# typeduck

Type-safe DuckDB for TypeScript. Write SQL, get row types — inferred by DuckDB itself, not by a parser.

```ts
import { createClient, sql } from 'typeduck';

const db = await createClient('analytics.duckdb');

const ordersByCustomer = sql(`
  select id, total, placed_at, tags
  from orders
  where customer = $customer
`);

const orders = await db.all(ordersByCustomer, { customer: 'ann' });
//    ^? { id: number | null; total: number | null; placed_at: Date | null; tags: (string | null)[] | null }[]
```

No schema definitions, no query builder, no decorators. Run `typeduck generate` once (or in watch mode) and every `sql('...')` in your project is typed — rows and parameters — through a single generated `typeduck.d.ts`. Works on Node ≥ 20 and Bun.

## Install

```sh
pnpm add typeduck @duckdb/node-api
# npm install typeduck @duckdb/node-api
# bun add typeduck @duckdb/node-api
```

`@duckdb/node-api` is a peer dependency: you pick the DuckDB version. typeduck needs 2.0.0 or newer.

## How it works

`typeduck generate` scans your sources for `sql('...')` calls, hands each statement to DuckDB with `PREPARE`, and reads back the result column types and parameter types DuckDB resolved. It then writes them as a module augmentation keyed by the exact SQL text:

```ts
// typeduck.d.ts — generated
declare module 'typeduck' {
  interface Queries {
    "select id, total from orders where customer = $customer": {
      row: { id: number | null; total: number | null };
      params: { customer: string | null };
    };
  }
}
```

`sql()` is typed as `sql<const S extends string>(text: S)`, so a string literal looks itself up in `Queries` at compile time. There is no runtime cost and no build plugin — TypeScript does the lookup on its own.

Because DuckDB does the typing, everything DuckDB understands is covered: `read_parquet('…')`, `UNNEST`, window functions, `STRUCT`/`LIST`/`MAP` columns, extensions, your own macros. Nothing to keep in sync with a hand-written schema.

## Generating types

```sh
typeduck generate                      # scans src/**/*.ts, in-memory DuckDB
typeduck generate -i schema.sql        # run DDL first, then describe queries
typeduck generate -d analytics.duckdb  # describe against a real database (read-only)
typeduck generate --watch              # regenerate on change
typeduck generate --check              # CI: fail if typeduck.d.ts is stale
```

Put the defaults in `typeduck.config.json` so the command is just `typeduck generate`:

```json
{
  "include": ["src/**/*.ts"],
  "init": "schema.sql",
  "out": "typeduck.d.ts"
}
```

Relative file paths inside SQL (`read_csv('data/orders.csv')`) resolve against the project directory, the same way they will when the app runs there.

When DuckDB cannot infer a parameter's type — `select $x` says nothing about `$x` — the generator tells you where and suggests a cast (`$x::integer`). Queries that fail to prepare are reported with DuckDB's own error and the file position.

## Running queries

```ts
const db = await createClient('analytics.duckdb');          // ':memory:' by default
const db = await createClient('analytics.duckdb', { config: { access_mode: 'READ_ONLY' } });

await db.all(query, params);       // Row[]
await db.one(query, params);       // Row — throws unless exactly one
await db.maybeOne(query, params);  // Row | null
await db.run(query, params);       // number of rows changed
for await (const row of db.stream(query, params)) { … }

await db.transaction(async (tx) => { … });   // BEGIN / COMMIT, ROLLBACK on throw

db.raw        // the underlying @duckdb/node-api connection
db.close();
```

Parameters are an object for `$name` placeholders and a tuple for `$1` / `?`. A query with no parameters takes no second argument. `undefined` is rejected — pass `null` for SQL NULL.

A `Client` is one DuckDB connection, so calls on it are serialised and `stream()` holds the connection until its iterator finishes. Open several clients for parallel queries.

## Types

Values are what `@duckdb/node-api` produces through its JS converter, so the types agree with the runtime exactly:

| DuckDB | Row type | Parameter type |
|---|---|---|
| `BOOLEAN` | `boolean` | `boolean` |
| `TINYINT` … `INTEGER`, `UTINYINT` … `UINTEGER`, `FLOAT`, `DOUBLE` | `number` | `number` |
| `BIGINT`, `UBIGINT`, `HUGEINT`, `UHUGEINT`, `BIGNUM` | `bigint` | `bigint \| number` |
| `DECIMAL` | `number` | `number \| bigint` |
| `VARCHAR`, `UUID` | `string` | `string` |
| `ENUM('a', 'b')` | `'a' \| 'b'` | `'a' \| 'b'` |
| `DATE`, `TIMESTAMP`, `TIMESTAMP_S/MS/NS`, `TIMESTAMPTZ` | `Date` | `Date` |
| `TIME` | `bigint` (micros) | `bigint` |
| `TIMETZ` | `{ micros: bigint; offset: number }` | same |
| `INTERVAL` | `{ months: number; days: number; micros: bigint }` | same |
| `BLOB`, `BIT`, `GEOMETRY` | `Uint8Array` | `Uint8Array` |
| `T[]`, `T[N]` | `(T \| null)[]` | `readonly (T \| null)[]` |
| `STRUCT(a T, b U)` | `{ a: T \| null; b: U \| null }` | same |
| `ROW(T, U)` (unnamed struct) | `[T \| null, U \| null]` | same |
| `MAP(K, V)` | `{ key: K \| null; value: V \| null }[]` | same |
| `UNION(tag T, …)` | `{ tag: 'tag'; value: T \| null } \| …` | same |
| `VARIANT` | `JS` | primitives |

Every column and every nested element is `| null`: DuckDB does not report nullability for query results, and typeduck does not guess.

## Limitations

- `sql()` must get a string literal — a plain `'...'` or a template literal without `${}`. Interpolated strings fall back to untyped rows (`Record<string, JS | null>`).
- Parameter types come from context. `where id = $id` is typed; a bare `select $x` needs `$x::integer`.
- Native DuckDB only (`@duckdb/node-api`). No `duckdb-wasm` yet.
- One client, one connection, no pool.

## Example

[`examples/basic`](examples/basic) is a complete project: schema, CSV load, two typed queries, config file. (Inside this repo it calls the CLI from `dist/`; in your project the script is just `typeduck generate`.)

```sh
pnpm install && pnpm build
cd examples/basic && pnpm generate && pnpm typecheck && pnpm start
```

## Roadmap

- `duckdb-wasm` backend with the same `Queries` table
- Adapters so Kysely and Drizzle users can reuse the generated types
- Arrow result streaming

## License

MIT
