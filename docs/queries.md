# Running queries

A `Client` is one DuckDB connection with typed methods. Every method takes a `Query` from `sql()` and, when the query has parameters, exactly one more argument.

```ts
// examples/docs/src/queries.ts
const byId = sql('select id, customer, total from orders where id = $id');
const byIds = sql('select id, customer from orders where id = $1 or id = $2');
const insertOrder = sql(`
  insert into orders (id, customer, total, placed_at)
  values ($id, $customer, $total, $placed_at)
`);
const countOrders = sql('select count(*) as n from orders');
const allOrders = sql('select id, customer, total from orders order by id');
```

## Reading

```ts
const rows = await db.all(byId, { id: 1 });           // Row[]
const one = await db.one(byId, { id: 1 });            // Row — throws unless exactly one row
const maybe = await db.maybeOne(byId, { id: 999 });   // Row | null
```

`one()` is for lookups by key: zero rows is a bug you want to hear about, two rows is a worse one. `maybeOne()` returns the first row and ignores the rest.

## Parameters

Named placeholders (`$id`) take an object; positional ones (`$1`, `?`) take a tuple. A query with no parameters takes no second argument, and passing one is a type error.

```ts
const pair = await db.all(byIds, [1, 2]);
const { n } = await db.one(countOrders);
```

`null` is a value — SQL NULL. `undefined` is rejected with an error naming the parameter, because a missing key is almost always a mistake and binding it as NULL would hide it.

## Writing

```ts
const changed = await db.run(insertOrder, {
  id: 10,
  customer: 'cid',
  total: 42,
  placed_at: new Date(),
});
```

`run()` returns the number of rows changed. It works for any statement; for a `SELECT` it returns 0.

## Streaming

```ts
for await (const order of db.stream(allOrders)) {
  console.log(order.id, order.total);
}
```

Rows arrive as DuckDB produces them, chunk by chunk, without the whole result in memory. The connection is held until the loop finishes or `break`s — other calls on the same client wait.

## Transactions

```ts
await db.transaction(async (tx) => {
  await tx.run(insertOrder, { id: 11, customer: 'dee', total: 1, placed_at: new Date() });
  await tx.run(insertOrder, { id: 12, customer: 'eve', total: 2, placed_at: new Date() });
});
```

`BEGIN` before the body, `COMMIT` after, `ROLLBACK` if it throws. `tx` is the same client; the parameter exists so the body reads as transactional. Because a client is one connection, calls made *outside* the body while it runs land inside the transaction too — use a separate client for work that must not.

## Escaping

```ts
await db.raw.run('checkpoint');
```

`raw` is the `@duckdb/node-api` connection. Appenders, user-defined functions, `EXPLAIN` output, anything duck-types has no opinion on, is right there.

## Concurrency

One client serialises its calls: a second `all()` starts when the first finishes. That is a DuckDB property — a connection runs one statement at a time — made explicit rather than a limitation added by duck-types. For parallel queries open several clients on the same file; DuckDB handles the locking.

Prepared statements are cached by SQL text for the life of the client, so calling the same `Query` in a loop prepares it once.
