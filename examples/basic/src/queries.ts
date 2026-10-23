import { sql } from 'typeduck';

export const loadOrders = sql(`
  insert into orders
  select * from read_csv('data/orders.csv')
`);

export const ordersByCustomer = sql(`
  select id, total, placed_at, tags
  from orders
  where customer = $customer
  order by placed_at
`);

export const spendPerMonth = sql(`
  select date_trunc('month', placed_at) as month,
         count(*)                       as orders,
         sum(total)                     as spend
  from orders
  group by 1
  order by 1
`);
