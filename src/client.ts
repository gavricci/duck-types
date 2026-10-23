import {
  type DuckDBConnection,
  DuckDBInstance,
  type DuckDBPreparedStatement,
  type DuckDBType,
  type DuckDBValue,
  type JS,
  jsToDuckDBValue,
} from '@duckdb/node-api';
import type { Query } from './query.js';

export interface ClientOptions {
  /** DuckDB configuration options, e.g. `{ access_mode: 'READ_ONLY' }`. */
  config?: Record<string, string>;
}

/**
 * Parameters as the generated spec declares them: an object for `$name`
 * parameters, a tuple for `$1`/`?`. Omitted entirely when the query has none.
 */
type ParamArgs<P> = unknown extends P
  ? [params?: Record<string, JS | null> | readonly (JS | null)[]]
  : P extends readonly []
    ? []
    : keyof P extends never
      ? []
      : [params: P];

export class Client {
  private constructor(
    private readonly instance: DuckDBInstance,
    private readonly connection: DuckDBConnection,
  ) {}

  /** Opens a database file, or an in-memory database for `':memory:'` (the default). */
  static async open(path = ':memory:', options: ClientOptions = {}): Promise<Client> {
    const instance = await DuckDBInstance.create(path, options.config);
    const connection = await instance.connect();
    return new Client(instance, connection);
  }

  /** The underlying `@duckdb/node-api` connection, for anything typeduck does not cover. */
  get raw(): DuckDBConnection {
    return this.connection;
  }

  /** Runs the query and returns every row. */
  async all<Row, P>(query: Query<Row, P>, ...args: ParamArgs<P>): Promise<Row[]> {
    const prepared = await this.bind(query, args[0]);
    try {
      const reader = await prepared.runAndReadAll();
      return reader.getRowObjectsJS() as Row[];
    } finally {
      prepared.destroySync();
    }
  }

  /** Runs the query and returns its single row; throws when there is not exactly one. */
  async one<Row, P>(query: Query<Row, P>, ...args: ParamArgs<P>): Promise<Row> {
    const rows = await this.all(query, ...args);
    if (rows.length !== 1) {
      throw new Error(`Expected exactly one row, got ${rows.length}: ${query.text}`);
    }
    return rows[0] as Row;
  }

  /** Runs the query and returns its first row, or `null` when there are none. */
  async maybeOne<Row, P>(query: Query<Row, P>, ...args: ParamArgs<P>): Promise<Row | null> {
    const rows = await this.all(query, ...args);
    return rows[0] ?? null;
  }

  /** Runs a statement for its effect and returns the number of rows changed. */
  async run<Row, P>(query: Query<Row, P>, ...args: ParamArgs<P>): Promise<number> {
    const prepared = await this.bind(query, args[0]);
    try {
      const result = await prepared.run();
      return result.rowsChanged;
    } finally {
      prepared.destroySync();
    }
  }

  /** Streams rows as DuckDB produces them, without materialising the result. */
  async *stream<Row, P>(query: Query<Row, P>, ...args: ParamArgs<P>): AsyncGenerator<Row> {
    const prepared = await this.bind(query, args[0]);
    try {
      const result = await prepared.stream();
      try {
        for await (const chunk of result.yieldRowObjectJs()) {
          for (const row of chunk) {
            yield row as Row;
          }
        }
      } finally {
        result.closeSync();
      }
    } finally {
      prepared.destroySync();
    }
  }

  close(): void {
    this.connection.closeSync();
    this.instance.closeSync();
  }

  private async bind(
    query: Query<unknown, unknown>,
    params: unknown,
  ): Promise<DuckDBPreparedStatement> {
    const prepared = await this.connection.prepare(query.text);
    try {
      if (Array.isArray(params)) {
        for (const [i, value] of params.entries()) {
          bindOne(prepared, i + 1, value);
        }
      } else if (params && typeof params === 'object') {
        for (const [name, value] of Object.entries(params)) {
          bindOne(prepared, prepared.parameterIndex(name), value);
        }
      }
      return prepared;
    } catch (error) {
      prepared.destroySync();
      throw error;
    }
  }
}

function bindOne(prepared: DuckDBPreparedStatement, index: number, value: unknown): void {
  let type: DuckDBType | undefined;
  try {
    type = prepared.parameterType(index);
  } catch {
    // Untyped parameter (`select $x`): let DuckDB infer from the bound value.
  }
  if (type === undefined) {
    if (value !== null && typeof value === 'object') {
      throw new TypeError(
        `Parameter ${index} has no inferred type; cast it in SQL (e.g. $${index}::timestamp) to bind an object`,
      );
    }
    prepared.bindValue(index, value as DuckDBValue);
  } else {
    prepared.bindValue(index, jsToDuckDBValue(value as JS, type), type);
  }
}

export const createClient = Client.open;
