# typeduck

Type-safe DuckDB for TypeScript. Write SQL, get row types — inferred by DuckDB itself, not by a parser.

[![npm](https://img.shields.io/npm/v/typeduck)](https://www.npmjs.com/package/typeduck)
[![Node 20](https://img.shields.io/github/actions/workflow/status/gavricci/typeduck/node-20.yml?label=Node%2020)](https://github.com/gavricci/typeduck/actions/workflows/node-20.yml)
[![Node 22](https://img.shields.io/github/actions/workflow/status/gavricci/typeduck/node-22.yml?label=Node%2022)](https://github.com/gavricci/typeduck/actions/workflows/node-22.yml)
[![Node 24](https://img.shields.io/github/actions/workflow/status/gavricci/typeduck/node-24.yml?label=Node%2024)](https://github.com/gavricci/typeduck/actions/workflows/node-24.yml)
[![Bun](https://img.shields.io/github/actions/workflow/status/gavricci/typeduck/bun.yml?label=Bun)](https://github.com/gavricci/typeduck/actions/workflows/bun.yml)
[![MIT](https://img.shields.io/npm/l/typeduck)](LICENSE)

```ts
import { createClient, sql } from 'typeduck';

const db = await createClient('orders.duckdb');

const ordersFor = sql('select id, total, placed_at from orders where customer = $customer');

const rows = await db.all(ordersFor, { customer: 'ann' });
//    ^? { id: number | null; total: number | null; placed_at: Date | null }[]
```

Run `typeduck generate` once (or in `--watch`), and every `sql('...')` in the project is typed — rows and parameters — through one generated `typeduck.d.ts`. No schema DSL, no query builder, no build plugin.

## Before → after

**Hand-written row types** — the interface, the cast and the SQL drift apart; nothing checks them.

<table><tr><td>

```ts
interface OrderRow { id: number; total: number }

const reader = await conn.runAndReadAll(
  'select id, total from orders'
);
const rows = reader.getRowObjectsJS() as OrderRow[];
```

</td><td>

```ts
const orders = sql('select id, total from orders');

const rows = await db.all(orders);
// { id: number | null; total: number | null }[]
// — produced by DuckDB, regenerated on change
```

</td></tr></table>

**Value normalisers** — every project grows its own `instanceof DuckDBDecimalValue` branch.

<table><tr><td>

```ts
const rows = reader.getRowObjects().map((r) => ({
  total: (r.total as DuckDBDecimalValue).toDouble(),
  placed_at: new Date(Number(
    (r.placed_at as DuckDBTimestampValue).micros / 1000n
  )),
}));
```

</td><td>

```ts
const rows = await db.all(orders);
rows[0].total;      // number
rows[0].placed_at;  // Date
// the @duckdb/node-api JS converter,
// and the types say what it returns
```

</td></tr></table>

**Caught by `tsc`, not in production** — typos in columns and parameters are compile errors.

<table><tr><td>

```ts
const rows = reader.getRowObjectsJS();
rows[0].totl;                       // undefined at runtime
prepared.bind({ name: 'ann' });     // throws at runtime
```

</td><td>

```ts
const rows = await db.all(ordersFor, { customer: 'ann' });
rows[0].totl;                           // error: no property 'totl'
await db.all(ordersFor, { name: 'ann' }); // error: expected { customer }
```

</td></tr></table>

## In the editor

![Add a column to the SQL on the right; the row type on the left follows](https://raw.githubusercontent.com/gavricci/typeduck/main/docs/demo.gif)

What happens, left to right: `orders` is typed from the query in `queries.ts`; `customer` is added to the `select`; `typeduck generate --watch` regenerates `typeduck.d.ts` on save; the hover now shows `customer: string | null`. Nothing was edited by hand except the SQL.

## Install

`@duckdb/node-api` is a peer dependency: you pick the DuckDB version (2.0 or newer).

### pnpm

```sh
pnpm add typeduck @duckdb/node-api
pnpm typeduck generate
```

### npm

```sh
npm install typeduck @duckdb/node-api
npx typeduck generate
```

### bun

```sh
bun add typeduck @duckdb/node-api
bunx typeduck generate
```

Node ≥ 20 or Bun. Put the options in `typeduck.config.json` so the command stays that short:

```json
{ "include": ["src/**/*.ts"], "init": "schema.sql", "out": "typeduck.d.ts" }
```

## How it works

`typeduck generate` scans your sources for `sql('...')`, hands each statement to DuckDB with `PREPARE`, and reads back the column and parameter types DuckDB resolved — nothing is executed. It writes them as a module augmentation keyed by the exact SQL text:

```ts
// typeduck.d.ts — generated
declare module 'typeduck' {
  interface Queries {
    'select id, total, placed_at from orders where customer = $customer': {
      row: { id: number | null; total: number | null; placed_at: Date | null };
      params: { customer: string | null };
    };
  }
}
```

`sql()` is declared as `sql<const S extends string>(text: S)`, so a string literal looks itself up at compile time. Because DuckDB does the typing, everything DuckDB understands is covered: `read_parquet`, `UNNEST`, window functions, `STRUCT`/`LIST`/`MAP`, extensions, your macros.

## Next steps

- [Getting started](docs/getting-started.md) — empty project to first typed query in five steps
- [Where the schema comes from](docs/schema-sources.md) — `--init` DDL, `--database` files, Parquet/CSV with no schema, remote databases
- [Running queries](docs/queries.md) — `all`, `one`, `maybeOne`, `run`, `stream`, `transaction`, `raw`
- [Type mapping](docs/types.md) — every DuckDB type, and why `count(*)` is a `bigint`
- [Parameters](docs/parameters.md) — how inference works and what to do when it cannot
- [CI and workflow](docs/ci.md) — `--check`, `--watch`, pre-commit, scripts
- [Migrating from @duckdb/node-api](docs/migrating-from-node-api.md) — before and after, line by line
- [Architecture](docs/architecture.md) · [FAQ](docs/faq.md)

Every code block in the docs comes from [`examples/docs`](examples/docs), which CI generates and typechecks. [`examples/basic`](examples/basic) is a complete runnable project.

## Limitations

- `sql()` needs a string literal — `'...'` or a template literal without `${}`. Interpolated strings fall back to untyped rows.
- Parameter types come from context: `where id = $id` is typed, a bare `select $x` needs `$x::integer`.
- Every column is `| null`; DuckDB does not report nullability and typeduck does not guess.
- Native DuckDB only (`@duckdb/node-api`); no `duckdb-wasm` yet. One client is one connection.

## Roadmap

- `duckdb-wasm` backend sharing the same generated `Queries`
- Adapters so Kysely and Drizzle users can reuse the generated types
- Arrow result streaming

## License

MIT
