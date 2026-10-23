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

/**
 * One DuckDB connection with typed query methods.
 *
 * A connection runs one statement at a time, so calls on a client are
 * serialised: a second `all()` waits for the first to finish, and a
 * `stream()` holds the connection until its iterator is done or returned.
 * Open several clients for parallel queries.
 *
 * Prepared statements are cached by SQL text and reused across calls.
 */
export class Client {
  private readonly prepared = new Map<string, DuckDBPreparedStatement>();
  private tail: Promise<unknown> = Promise.resolve();

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
    return this.exclusive(async () => {
      const prepared = await this.bind(query, args[0]);
      const reader = await prepared.runAndReadAll();
      return reader.getRowObjectsJS() as Row[];
    });
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
    return this.exclusive(async () => {
      const prepared = await this.bind(query, args[0]);
      const result = await prepared.run();
      return result.rowsChanged;
    });
  }

  /**
   * Streams rows as DuckDB produces them, without materialising the result.
   * Holds the connection until the iterator finishes or is returned early.
   */
  async *stream<Row, P>(query: Query<Row, P>, ...args: ParamArgs<P>): AsyncGenerator<Row> {
    const release = await this.acquire();
    try {
      const prepared = await this.bind(query, args[0]);
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
      release();
    }
  }

  /**
   * Runs `body` inside `BEGIN` … `COMMIT`, rolling back if it throws.
   *
   * The transaction is not isolated from other callers of the same client:
   * they share the connection, so their statements run inside it too.
   */
  async transaction<T>(body: (tx: Client) => Promise<T>): Promise<T> {
    await this.connection.run('begin transaction');
    try {
      const result = await body(this);
      await this.connection.run('commit');
      return result;
    } catch (error) {
      await this.connection.run('rollback');
      throw error;
    }
  }

  close(): void {
    for (const statement of this.prepared.values()) {
      statement.destroySync();
    }
    this.prepared.clear();
    this.connection.closeSync();
    this.instance.closeSync();
  }

  private async exclusive<T>(work: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await work();
    } finally {
      release();
    }
  }

  /** Waits for the connection to be free and returns the function that frees it again. */
  private acquire(): Promise<() => void> {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ready = this.tail.then(() => release);
    this.tail = held;
    return ready;
  }

  private async bind(
    query: Query<unknown, unknown>,
    params: unknown,
  ): Promise<DuckDBPreparedStatement> {
    let prepared = this.prepared.get(query.text);
    if (prepared === undefined) {
      prepared = await this.connection.prepare(query.text);
      this.prepared.set(query.text, prepared);
    } else {
      prepared.clearBindings();
    }
    if (Array.isArray(params)) {
      for (const [i, value] of params.entries()) {
        bindOne(prepared, i + 1, String(i + 1), value);
      }
    } else if (params && typeof params === 'object') {
      for (const [name, value] of Object.entries(params)) {
        bindOne(prepared, prepared.parameterIndex(name), name, value);
      }
    }
    return prepared;
  }
}

function bindOne(
  prepared: DuckDBPreparedStatement,
  index: number,
  name: string,
  value: unknown,
): void {
  if (value === undefined) {
    throw new TypeError(`Parameter $${name} is undefined; pass null for SQL NULL`);
  }
  let type: DuckDBType | undefined;
  try {
    type = prepared.parameterType(index);
  } catch {
    // Untyped parameter (`select $x`): let DuckDB infer from the bound value.
  }
  if (type === undefined) {
    if (value !== null && typeof value === 'object') {
      throw new TypeError(
        `Parameter $${name} has no inferred type; cast it in SQL (e.g. $${name}::timestamp) to bind an object`,
      );
    }
    prepared.bindValue(index, value as DuckDBValue);
  } else {
    prepared.bindValue(index, jsToDuckDBValue(value as JS, type), type);
  }
}

export const createClient = Client.open;
