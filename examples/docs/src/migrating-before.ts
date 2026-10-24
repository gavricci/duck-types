// examples/docs/src/migrating-before.ts — plain @duckdb/node-api
import { DuckDBDecimalValue, DuckDBInstance, DuckDBTimestampValue } from '@duckdb/node-api';

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
