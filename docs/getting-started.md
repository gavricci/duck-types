# Getting started

Five steps from an empty directory to a typed query. The example uses an `orders` table; swap in your own schema at step 2.

## 1. Install

```sh
pnpm add duck-types @duckdb/node-api
```

(`npm install` and `bun add` work the same way; see the [README](../README.md#install) for the runner commands.)

## 2. Describe the schema

duck-types asks DuckDB what your queries return, so DuckDB needs to know the tables. The simplest way is a DDL file that the generator runs in an in-memory database before describing anything:

```sql
-- schema.sql
create table orders (
  id         integer primary key,
  customer   varchar not null,
  total      decimal(10, 2) not null,
  placed_at  timestamp not null,
  tags       varchar[]
);
```

If you already have a `.duckdb` file, point at it instead — see [Where the schema comes from](schema-sources.md).

## 3. Configure once

```json
// duck-types.config.json
{
  "include": ["src/**/*.ts"],
  "init": "schema.sql",
  "out": "duck-types.d.ts"
}
```

Make sure `duck-types.d.ts` is inside your `tsconfig.json`'s `include` (or `files`). It is an ordinary declaration file.

## 4. Write a query

```ts
// examples/docs/src/getting-started.ts
import { createClient, sql } from 'duck-types';

export const recentOrders = sql(`
  select id, customer, total, placed_at
  from orders
  where placed_at >= $since
  order by placed_at desc
  limit 10
`);
```

`sql()` takes a string literal — single quotes or a backtick template without `${}` — and returns a `Query` that carries its types once step 5 has run.

## 5. Generate and use

```sh
pnpm duck-types generate
# duck-types.d.ts: 1 of 1 queries typed
```

```ts
export async function main() {
  const db = await createClient('orders.duckdb');
  const rows = await db.all(recentOrders, { since: new Date('2026-01-01') });
  //    ^? { id: number | null; customer: string | null; total: number | null; placed_at: Date | null }[]
  for (const row of rows) {
    console.log(row.customer, row.total, row.placed_at?.toISOString());
  }
  db.close();
}
```

The parameter object is typed too: `{ since: Date | null }`. Pass a string and `tsc` complains before DuckDB would.

## What just happened

`duck-types generate` found `sql(...)` in `src/`, prepared the statement in DuckDB, read back the column types and the parameter types, and wrote them into `duck-types.d.ts` keyed by the exact SQL text. TypeScript's own literal-type lookup does the rest; nothing runs at runtime that would not run without duck-types.

Add `duck-types generate --check` to CI so the file cannot drift from the code — [CI and workflow](ci.md).
