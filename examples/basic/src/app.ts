import { createClient } from 'typeduck';
import { loadOrders, ordersByCustomer, spendPerMonth } from './queries.ts';

const db = await createClient();
await db.raw.run(await import('node:fs/promises').then((fs) => fs.readFile('schema.sql', 'utf8')));
await db.run(loadOrders);

const orders = await db.all(ordersByCustomer, { customer: 'ann' });
//    ^? { id: number | null; total: number | null; placed_at: Date | null; tags: (string | null)[] | null }[]
for (const order of orders) {
  console.log(order.id, order.total?.toFixed(2), order.placed_at?.toISOString(), order.tags);
}

for (const row of await db.all(spendPerMonth)) {
  //         ^? { month: Date | null; orders: bigint | null; spend: number | null }
  console.log(row.month?.toISOString().slice(0, 7), row.orders, row.spend);
}

db.close();
