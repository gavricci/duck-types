import { DuckDBInstance } from '@duckdb/node-api';
import { expect, test } from 'vitest';
import { VERSION } from '../src/index.js';

test('exports a version', () => {
  expect(VERSION).toBe('0.0.0');
});

test('duckdb engine is reachable', async () => {
  const instance = await DuckDBInstance.create(':memory:');
  const connection = await instance.connect();
  const reader = await connection.runAndReadAll('select 42 as answer');
  expect(reader.getRowObjects()).toEqual([{ answer: 42 }]);
});
