import { createClient, sql } from 'typeduck';

const ordersFor = sql('select id, total, placed_at from orders where customer = $customer');

export async function main() {
  const db = await createClient();
  const rows = await db.all(ordersFor, { customer: 'ann' });

  // Each of these is a type error, not a runtime surprise:
  // @ts-expect-error — no such column
  rows[0]?.totl;
  // @ts-expect-error — parameter is $customer, not $name
  await db.all(ordersFor, { name: 'ann' });
  // @ts-expect-error — placed_at is a Date, not a string
  const s: string | null | undefined = rows[0]?.placed_at;

  db.close();
  return s;
}
