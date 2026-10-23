import { type DuckDBConnection, DuckDBInstance } from '@duckdb/node-api';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { describeQuery } from '../src/describe.js';

let connection: DuckDBConnection;

beforeAll(async () => {
  connection = await (await DuckDBInstance.create(':memory:')).connect();
  await connection.run('create table users(id integer, name varchar, created timestamp)');
});

afterAll(() => connection.closeSync());

test('columns and named params inferred from context', async () => {
  const d = await describeQuery(connection, 'select id, name from users where created > $since');
  expect(d.columns.map((c) => [c.key, String(c.type)])).toEqual([
    ['id', 'INTEGER'],
    ['name', 'VARCHAR'],
  ]);
  expect(d.params.map((p) => [p.name, String(p.type)])).toEqual([['since', 'TIMESTAMP']]);
  expect(d.positional).toBe(false);
});

test('positional params', async () => {
  const d = await describeQuery(connection, 'insert into users values ($1, $2, $3)');
  expect(d.positional).toBe(true);
  expect(d.params.map((p) => String(p.type))).toEqual(['INTEGER', 'VARCHAR', 'TIMESTAMP']);
  expect(d.columns.map((c) => c.key)).toEqual(['Count']);
});

test('duplicate column names are keyed like getRowObjectsJS', async () => {
  const d = await describeQuery(connection, 'select 1 as a, 2 as a, 3 as a');
  expect(d.columns.map((c) => c.key)).toEqual(['a', 'a:1', 'a:2']);
});

test('uninferrable parameter type is null', async () => {
  const d = await describeQuery(connection, 'select id from users where name = $n or $flag');
  expect(d.params.find((p) => p.name === 'n')?.type?.toString()).toBe('VARCHAR');
  expect(d.params.find((p) => p.name === 'flag')?.type?.toString()).toBe('BOOLEAN');
});

test('errors propagate from prepare', async () => {
  await expect(describeQuery(connection, 'select * from nope')).rejects.toThrow(/nope/);
});
