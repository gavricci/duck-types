import { sql } from 'duck-types';

// A table created by schema.sql (--init) or present in the database (--database).
export const customers = sql('select distinct customer from orders order by 1');

// No schema at all: DuckDB infers the columns from the file itself.
// Relative paths resolve against the project directory, both in `generate` and at runtime.
export const fromCsv = sql(`
  select id, customer, total::decimal(10, 2) as total, placed_at
  from read_csv('data/orders.csv')
  where customer = $customer
`);

// Aggregates over files work the same way.
export const spendFromCsv = sql(`
  select customer, sum(total) as spend, count(*) as orders
  from read_csv('data/orders.csv')
  group by customer
  order by spend desc
`);
