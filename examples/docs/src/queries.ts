import { type Client, createClient, sql } from 'typeduck';

const byId = sql('select id, customer, total from orders where id = $id');
const byIds = sql('select id, customer from orders where id = $1 or id = $2');
const insertOrder = sql(`
  insert into orders (id, customer, total, placed_at)
  values ($id, $customer, $total, $placed_at)
`);
const countOrders = sql('select count(*) as n from orders');
const allOrders = sql('select id, customer, total from orders order by id');

export async function examples(db: Client) {
  // Rows, exactly one, or at most one.
  const rows = await db.all(byId, { id: 1 });
  const one = await db.one(byId, { id: 1 }); // throws unless exactly one row
  const maybe = await db.maybeOne(byId, { id: 999 }); // null when missing

  // Positional parameters are a tuple.
  const pair = await db.all(byIds, [1, 2]);

  // No parameters: no second argument.
  const { n } = await db.one(countOrders);

  // Writes return the number of rows changed. Pass null for SQL NULL; undefined throws.
  const changed = await db.run(insertOrder, {
    id: 10,
    customer: 'cid',
    total: 42,
    placed_at: new Date(),
  });

  // Stream large results without materialising them.
  for await (const order of db.stream(allOrders)) {
    console.log(order.id, order.total);
  }

  // Transactions roll back when the body throws.
  await db.transaction(async (tx) => {
    await tx.run(insertOrder, { id: 11, customer: 'dee', total: 1, placed_at: new Date() });
    await tx.run(insertOrder, { id: 12, customer: 'eve', total: 2, placed_at: new Date() });
  });

  // Anything typeduck does not cover: the @duckdb/node-api connection.
  await db.raw.run('checkpoint');

  return { rows, one, maybe, pair, n, changed };
}

export async function main() {
  const db = await createClient();
  await examples(db);
  db.close();
}
