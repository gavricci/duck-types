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
