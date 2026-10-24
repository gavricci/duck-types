import { readFileSync } from 'node:fs';
import { createClient } from 'duck-types';
import { loadOrders, ordersByCustomer } from './queries.ts';

const db = await createClient();
await db.raw.run(readFileSync('schema.sql', 'utf8'));
await db.run(loadOrders);

const orders = await db.all(ordersByCustomer, { customer: 'ann' });

for (const order of orders) {
  console.log(order.id, order.total?.toFixed(2), order.placed_at?.toISOString(), order.tags);
}

db.close();
