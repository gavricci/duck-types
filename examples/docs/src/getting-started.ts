import { createClient, sql } from 'duck-types';

export const recentOrders = sql(`
  select id, customer, total, placed_at
  from orders
  where placed_at >= $since
  order by placed_at desc
  limit 10
`);

export async function main() {
  const db = await createClient('orders.duckdb');
  const rows = await db.all(recentOrders, { since: new Date('2026-01-01') });
  //    ^? { id: number | null; customer: string | null; total: number | null; placed_at: Date | null }[]
  for (const row of rows) {
    console.log(row.customer, row.total, row.placed_at?.toISOString());
  }
  db.close();
}
