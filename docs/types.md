# Type mapping

typeduck does not invent a value model. Rows come from `@duckdb/node-api`'s JS converter (`getRowObjectsJS`), and the generated types describe exactly what that converter returns. If the runtime and the types ever disagreed, the types would be lying; keeping one source of truth is the point.

## The table

| DuckDB | Row type | Parameter type |
|---|---|---|
| `BOOLEAN` | `boolean` | `boolean` |
| `TINYINT`, `SMALLINT`, `INTEGER`, `UTINYINT`, `USMALLINT`, `UINTEGER` | `number` | `number` |
| `FLOAT`, `DOUBLE` | `number` | `number` |
| `BIGINT`, `UBIGINT`, `HUGEINT`, `UHUGEINT`, `BIGNUM` | `bigint` | `bigint \| number` |
| `DECIMAL(p, s)` | `number` | `number \| bigint` |
| `VARCHAR`, `UUID` | `string` | `string` |
| `ENUM('a', 'b')` | `'a' \| 'b'` | `'a' \| 'b'` |
| `DATE` | `Date` | `Date` |
| `TIMESTAMP`, `TIMESTAMP_S`, `TIMESTAMP_MS`, `TIMESTAMP_NS` | `Date` | `Date` |
| `TIMESTAMPTZ`, `TIMESTAMPTZ_NS` | `Date` | `Date` |
| `TIME`, `TIME_NS` | `bigint` (microseconds / nanoseconds since midnight) | `bigint` |
| `TIMETZ` | `{ micros: bigint; offset: number }` | same |
| `INTERVAL` | `{ months: number; days: number; micros: bigint }` | same |
| `BLOB`, `BIT`, `GEOMETRY` | `Uint8Array` | `Uint8Array` |
| `T[]` (list), `T[N]` (array) | `(T \| null)[]` | `readonly (T \| null)[]` |
| `STRUCT(a T, b U)` | `{ a: T \| null; b: U \| null }` | same |
| `ROW(T, U)` — unnamed struct | `[T \| null, U \| null]` | `readonly [...]` |
| `MAP(K, V)` | `{ key: K \| null; value: V \| null }[]` | `readonly [...]` |
| `UNION(tag T, other U)` | `{ tag: 'tag'; value: T \| null } \| { tag: 'other'; value: U \| null }` | same |
| `VARIANT` | `JS` (any JS value the converter can produce) | `boolean \| number \| bigint \| string` |
| `NULL` (a literal `null` column) | `null` | — |

Here is what the generator writes for a query that touches most of them:

```ts
// examples/docs/src/types.ts
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
```

```ts
// typeduck.d.ts (wrapped for reading)
row: {
  bool: boolean | null;
  int: number | null;
  big: bigint | null;
  dec: number | null;
  str: string | null;
  ts: Date | null;
  day: Date | null;
  t: bigint | null;
  iv: { months: number; days: number; micros: bigint } | null;
  ints: (number | null)[] | null;
  point: { x: number | null; y: string | null } | null;
  m: { key: string | null; value: number | null }[] | null;
  u: { tag: "num"; value: number | null } | null;
  e: "sad" | "ok" | "happy" | null;
}
```

## Why everything is `| null`

DuckDB reports a result column's type but not whether it can be NULL — a `NOT NULL` column becomes nullable after a `LEFT JOIN`, and the binder does not track that through. typeduck does not guess. If you know a column cannot be null, narrow it at the use site (`row.id!` or a check); if that gets tiresome in one place, `coalesce()` in the SQL moves the decision to where DuckDB can see it — the type stays `| null` (DuckDB still does not report it), but the value never is.

The same applies inside containers: list elements, struct fields, map keys and values may each be NULL on their own.

## Why `BIGINT` is `bigint` and `DECIMAL` is `number`

A `BIGINT` can hold values a JS `number` cannot represent, so the converter returns `bigint` and the type says so. `count(*)` is a `BIGINT`: expect `2n`, not `2`. Cast in SQL if you want a number — `count(*)::integer` — and the type follows.

`DECIMAL` becomes `number` via `toDouble()`. That is lossy for more than ~15 significant digits; if you need exact decimals, select `total::varchar` and parse with a decimal library, or `total * 100` into an integer type. This follows `@duckdb/node-api`'s converter; typeduck does not override it.

Parameters are a little wider than rows where the binder is lenient: a `BIGINT` parameter accepts a plain `number`, a `DECIMAL` accepts a `bigint`.

## Duplicate column names

`select 1 as a, 2 as a` yields keys `a` and `a:1`, matching how `getRowObjectsJS` disambiguates. Alias your columns; this is here so the types never silently drop one.
