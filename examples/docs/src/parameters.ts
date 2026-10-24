import { sql } from 'duck-types';

// Typed from the column it is compared with: $id is INTEGER.
export const byId = sql('select id from orders where id = $id');

// Typed from the cast: without ::varchar DuckDB could not infer $prefix.
export const byPrefix = sql(`select id from orders where starts_with(customer, $prefix::varchar)`);

// Same name twice is one parameter.
export const window = sql(`
  select id, placed_at
  from orders
  where placed_at between $day::date and $day::date + interval '1 day'
`);

// Positional: $1, $2 or ? — the params type is a tuple.
export const range = sql('select id from orders where total between ? and ?');

// NULL is a value, not an absence: pass null, not undefined.
export const maybeCustomer = sql(`
  select id from orders where customer = $customer or $customer::varchar is null
`);
