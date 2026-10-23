import { type DuckDBConnection, DuckDBInstance } from '@duckdb/node-api';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { nullable, propertyKey, tsTypeFor } from '../src/types/emit.js';

let connection: DuckDBConnection;

beforeAll(async () => {
  const instance = await DuckDBInstance.create(':memory:');
  connection = await instance.connect();
  await connection.run("create type mood as enum ('sad', 'ok', 'happy')");
});

afterAll(() => {
  connection.closeSync();
});

async function typeOf(expression: string): Promise<string> {
  const prepared = await connection.prepare(`select ${expression}`);
  try {
    return tsTypeFor(prepared.columnType(0));
  } finally {
    prepared.destroySync();
  }
}

// Each case: SQL expression → the TS type its JS-converted value has.
// Elements of LIST/ARRAY, STRUCT entries, MAP keys/values and UNION payloads may
// each be NULL on their own, so they are nullable; only the top level is not.
const cases: [string, string][] = [
  ['true', 'boolean'],
  ['1::tinyint', 'number'],
  ['1::smallint', 'number'],
  ['1::integer', 'number'],
  ['1::utinyint', 'number'],
  ['1::usmallint', 'number'],
  ['1::uinteger', 'number'],
  ['1.5::float', 'number'],
  ['1.5::double', 'number'],
  ['1.5::decimal(10,2)', 'number'],
  ['1::bigint', 'bigint'],
  ['1::ubigint', 'bigint'],
  ['1::hugeint', 'bigint'],
  ['1::uhugeint', 'bigint'],
  ["'x'", 'string'],
  ["'x'::varchar", 'string'],
  ['uuid()', 'string'],
  ["'\\x00'::blob", 'Uint8Array'],
  ["'101'::bit", 'Uint8Array'],
  ["'2024-01-01'::date", 'Date'],
  ["'2024-01-01 00:00:00'::timestamp", 'Date'],
  ["'2024-01-01 00:00:00'::timestamp_s", 'Date'],
  ["'2024-01-01 00:00:00'::timestamp_ms", 'Date'],
  ["'2024-01-01 00:00:00'::timestamp_ns", 'Date'],
  ["'2024-01-01 00:00:00+00'::timestamptz", 'Date'],
  ["'12:00:00'::time", 'bigint'],
  ["'12:00:00+02'::timetz", '{ micros: bigint; offset: number }'],
  ["interval '1 day'", '{ months: number; days: number; micros: bigint }'],
  ["'ok'::mood", '"sad" | "ok" | "happy"'],
  ['[1, 2]', '(number | null)[]'],
  ["['a', 'b']", '(string | null)[]'],
  ['[1, 2]::integer[2]', '(number | null)[]'],
  ["[['a']]", '((string | null)[] | null)[]'],
  ["['ok'::mood]", '("sad" | "ok" | "happy" | null)[]'],
  ["map {'a': 1}", '{ key: string | null; value: number | null }[]'],
  ["{'x': 1, 'y': 'a'}", '{ x: number | null; y: string | null }'],
  ["{'with space': 1}", '{ "with space": number | null }'],
  ["{'nested': {'deep': true}}", '{ nested: { deep: boolean | null } | null }'],
  ["row(1, 'a')", '[number | null, string | null]'],
  ['union_value(num := 1)', '{ tag: "num"; value: number | null }'],
  [
    '1::union(num integer, str varchar)',
    '{ tag: "num"; value: number | null } | { tag: "str"; value: string | null }',
  ],
  ['null', 'null'],
];

describe('tsTypeFor', () => {
  test.each(cases)('%s → %s', async (expression, expected) => {
    expect(await typeOf(expression)).toBe(expected);
  });
});

describe('nullable', () => {
  test('appends | null', () => {
    expect(nullable('number')).toBe('number | null');
  });
  test('leaves null and never alone', () => {
    expect(nullable('null')).toBe('null');
    expect(nullable('never')).toBe('never');
  });
});

describe('propertyKey', () => {
  test('bare identifiers stay bare', () => {
    expect(propertyKey('user_id')).toBe('user_id');
    expect(propertyKey('$x')).toBe('$x');
  });
  test('anything else is quoted', () => {
    expect(propertyKey('1st')).toBe('"1st"');
    expect(propertyKey('a-b')).toBe('"a-b"');
    expect(propertyKey('q"uote')).toBe('"q\\"uote"');
  });
});
