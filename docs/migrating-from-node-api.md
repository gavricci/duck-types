# Migrating from @duckdb/node-api

duck-types is a layer on top of `@duckdb/node-api`, not a replacement: the same engine, the same values, and `db.raw` is the connection you already have. Migration is mostly deletion.

## Before

```ts
// examples/docs/src/migrating-before.ts — plain @duckdb/node-api
import {
  type DuckDBDecimalValue,
  DuckDBInstance,
  type DuckDBTimestampValue,
} from '@duckdb/node-api';

interface OrderRow {
  id: number;
  total: number;
  placed_at: Date;
}

export async function main() {
  const instance = await DuckDBInstance.create('orders.duckdb');
  const connection = await instance.connect();

  const prepared = await connection.prepare(
    'select id, total, placed_at from orders where customer = $customer',
  );
  prepared.bind({ customer: 'ann' });
  const reader = await prepared.runAndReadAll();

  const rows: OrderRow[] = reader.getRowObjects().map((row) => ({
    id: row.id as number,
    total: (row.total as DuckDBDecimalValue).toDouble(),
    placed_at: new Date(Number((row.placed_at as DuckDBTimestampValue).micros / 1000n)),
  }));

  prepared.destroySync();
  connection.closeSync();
  return rows;
}
```

Three things in there are maintained by hand and checked by nobody: the `OrderRow` interface, the casts, and the value conversions.

## After

```ts
// examples/docs/src/migrating-after.ts — the same with duck-types
import { createClient, sql } from 'duck-types';

const ordersFor = sql('select id, total, placed_at from orders where customer = $customer');

export async function main() {
  const db = await createClient('orders.duckdb');
  const rows = await db.all(ordersFor, { customer: 'ann' });
  //    ^? { id: number | null; total: number | null; placed_at: Date | null }[]
  db.close();
  return rows;
}
```

## Line by line

| `@duckdb/node-api` | duck-types |
|---|---|
| `DuckDBInstance.create(path)` + `instance.connect()` | `createClient(path)` |
| `connection.prepare(sql)` + `bind(values)` + `runAndReadAll()` | `db.all(sql(text), values)` |
| `reader.getRowObjectsJS()` | the return value of `all()`, already typed |
| `reader.getRowObjects()` + manual conversion | not needed — values are the JS converter's |
| `prepared.destroySync()` | cached and destroyed by `db.close()` |
| `connection.run(sql)` for DDL | `db.raw.run(sql)` — or `db.run(sql(text))` to have it typed too |
| `connection.stream()` + chunk loop | `for await (const row of db.stream(...))` |
| `BEGIN` / `COMMIT` by hand | `db.transaction(async (tx) => …)` |
| `connection.createAppender()` | `db.raw.createAppender()` — unchanged |

## What stays the same

- Values: a `BIGINT` is still a `bigint`, a `TIMESTAMP` is still a `Date`. duck-types uses the same converter you would reach for with `getRowObjectsJS()`; see [Type mapping](types.md).
- The engine: your DuckDB version is whatever `@duckdb/node-api` you installed.
- Anything advanced: appenders, scalar and table functions, `interrupt()`, `progress` — all through `db.raw`.

## What you gain

- Row and parameter types that cannot drift from the SQL, because DuckDB produces them.
- Typos in column names and wrong parameter names are compile errors.
- Less code: the example above went from 27 lines to 10.
