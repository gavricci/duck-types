import { afterAll, beforeAll, expect, expectTypeOf, test } from 'vitest';
import { type Client, createClient, type Queries, sql } from '../src/index.js';

declare module '../src/query.js' {
  interface Queries {
    'select id, name, created from users where id = $id': {
      row: { id: number | null; name: string | null; created: Date | null };
      params: { id: number };
    };
    'select count(*) as n from users': {
      row: { n: bigint | null };
      params: [];
    };
    'insert into users values ($1, $2, $3)': {
      row: { Count: bigint | null };
      params: [number, string, Date];
    };
  }
}

let db: Client;

beforeAll(async () => {
  db = await createClient();
  await db.raw.run('create table users(id integer, name varchar, created timestamp)');
});

afterAll(() => db.close());

const insert = sql('insert into users values ($1, $2, $3)');
const byId = sql('select id, name, created from users where id = $id');
const count = sql('select count(*) as n from users');

test('typed rows flow through', async () => {
  expect(await db.run(insert, [1, 'ann', new Date('2024-01-02T03:04:05Z')])).toBe(1);
  const row = await db.one(byId, { id: 1 });
  expectTypeOf(row).toEqualTypeOf<{
    id: number | null;
    name: string | null;
    created: Date | null;
  }>();
  expect(row).toEqual({ id: 1, name: 'ann', created: new Date('2024-01-02T03:04:05Z') });
});

test('no-param queries take no second argument', async () => {
  const { n } = await db.one(count);
  expectTypeOf(n).toEqualTypeOf<bigint | null>();
  expect(n).toBe(1n);
});

test('maybeOne and all', async () => {
  expect(await db.maybeOne(byId, { id: 99 })).toBeNull();
  expect(await db.all(byId, { id: 1 })).toHaveLength(1);
});

test('one throws on zero or many', async () => {
  await expect(db.one(byId, { id: 99 })).rejects.toThrow(/exactly one/);
});

test('stream yields rows', async () => {
  await db.run(insert, [2, 'bob', new Date(0)]);
  const names: (string | null)[] = [];
  for await (const row of db.stream(sql('select name from users order by id'))) {
    names.push(row.name as string | null);
  }
  expect(names).toEqual(['ann', 'bob']);
});

test('unknown queries fall back to JS rows', async () => {
  const rows = await db.all(sql('select 1 as x'));
  expect(rows).toEqual([{ x: 1 }]);
  expectTypeOf(rows[0]?.x).toEqualTypeOf<import('@duckdb/node-api').JS | null | undefined>();
});

test('Queries is the augmentation point', () => {
  expectTypeOf<Queries['select count(*) as n from users']['row']>().toEqualTypeOf<{
    n: bigint | null;
  }>();
});
