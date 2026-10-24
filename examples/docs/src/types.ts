import { sql } from 'typeduck';

// One column per family, so the generated typeduck.d.ts shows the mapping.
export const zoo = sql(`
  select
    true                                   as bool,
    1::integer                             as int,
    1::bigint                              as big,
    1.5::decimal(10, 2)                    as dec,
    'x'                                    as str,
    now()::timestamp                       as ts,
    current_date                           as day,
    '12:00:00'::time                       as t,
    interval '1 day'                       as iv,
    [1, 2]                                 as ints,
    {'x': 1, 'y': 'a'}                     as point,
    map {'k': 1}                           as m,
    union_value(num := 1)                  as u,
    'ok'::mood                             as e
`);
