import { sql as q } from 'duck-types';
import { sql } from 'duck-types';
import { sql as notOurs } from 'other';

export const byId = sql('select id, name from users where id = $id');
export const tpl = q(`select
  count(*) as n
from users`);
export const ignored = notOurs('select 1');
export const dynamic = sql(`select ${1}`);
export const untyped = sql('select $x as x');
export const broken = sql('select * from nope');
