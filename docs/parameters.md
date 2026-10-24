# Parameters

DuckDB infers a parameter's type from where it is used, the same way it types any expression. typeduck reads that inference back and puts it in the `params` type. When DuckDB cannot infer, the generator says so and nothing is guessed.

## Inferred from context

```ts
// examples/docs/src/parameters.ts
export const byId = sql('select id from orders where id = $id');
// params: { id: number | null }
```

`$id` is compared with an `INTEGER` column, so it is an `INTEGER`. The same works through arithmetic, function arguments with fixed signatures, `IN` lists, `BETWEEN`, and `INSERT … VALUES` (each value takes its column's type).

## Not inferrable: add a cast

```ts
export const byPrefix = sql(`select id from orders where starts_with(customer, $prefix::varchar)`);
```

Without `::varchar` DuckDB has nothing to go on — `starts_with` is overloaded — and `generate` reports:

```
src/parameters.ts:7:31: cannot infer the type of parameter $prefix; add a cast, e.g. $prefix::integer
```

The query still gets an entry with `params: { prefix: unknown }`, so the project compiles, but the parameter is unchecked until you cast. The same happens for `select $x` on its own, `$x = $y`, and most uses inside `CASE`.

## One name, many uses

```ts
export const window = sql(`
  select id, placed_at
  from orders
  where placed_at between $day::date and $day::date + interval '1 day'
`);
// params: { day: Date | null }
```

A name used twice is one parameter. All uses must agree on the type; DuckDB rejects the statement otherwise.

## Positional

```ts
export const range = sql('select id from orders where total between ? and ?');
// params: [number | bigint | null, number | bigint | null]
```

`?`, `$1`, `$2` are positional and the params type is a tuple in order. Named and positional cannot be mixed in one statement.

## NULL as a value

```ts
export const maybeCustomer = sql(`
  select id from orders where customer = $customer or $customer::varchar is null
`);
```

Pass `null` to bind SQL NULL. `undefined` throws at runtime (`Parameter $customer is undefined; pass null for SQL NULL`) and is excluded from the type, because a key that went missing is a bug you want surfaced, not a NULL you did not ask for.

## Objects for untyped parameters

If a parameter has no inferred type and you bind an object (a `Date`, an array), the client throws rather than guess an encoding. Primitives are passed through and DuckDB infers from the value. The fix is the same as above: cast in SQL.
