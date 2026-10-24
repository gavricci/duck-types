# Architecture

duck-types is small on purpose. This page explains the three decisions that shape it, so the limits make sense rather than feel arbitrary.

## 1. DuckDB types the queries, not a parser

Every alternative design — a SQL parser in TypeScript, a type-level parser, an ORM schema you declare — reimplements DuckDB's binder and falls behind it. DuckDB has `read_parquet`, `UNNEST`, `PIVOT`, macros, extensions, a `VARIANT` type, and a new feature every release. The only thing that always knows what a query returns is DuckDB.

So the generator does what a database client does anyway: `PREPARE` the statement and read back the column and parameter types (`DuckDBPreparedStatement.columnType(i)`, `parameterType(i)` in `@duckdb/node-api`). Nothing is executed. That is `describeQuery()` in [`src/describe.ts`](../src/describe.ts), exported for anyone building a different front end on the same idea.

The cost: generation needs a DuckDB that knows your schema ([Where the schema comes from](schema-sources.md)), and nullability is not reported, so every column is `| null` ([Type mapping](types.md)).

## 2. The lookup is a string literal type

```ts
export function sql<const S extends string>(text: S): Query<SpecOf<S>['row'], SpecOf<S>['params']>;
```

`sql('select …')` captures the literal type of its argument. `SpecOf<S>` indexes an interface:

```ts
export interface Queries {}   // in duck-types

declare module 'duck-types' {   // in your generated duck-types.d.ts
  interface Queries {
    'select id from orders where id = $id': {
      row: { id: number | null };
      params: { id: number | null };
    };
  }
}
```

Interfaces merge across declarations, so the generated file *adds entries* to `Queries` without duck-types knowing about your project. A query the generator has not seen falls back to `Record<string, JS | null>` rows and unchecked parameters — it compiles, it runs, it is just not typed yet.

This is why `sql()` takes a plain string and not a tagged template: `TemplateStringsArray` has no literal type, so ``sql`…` `` could not look anything up. A template literal **without** `${}` is a string literal and works fine; one with interpolation is a `string` and falls back.

There is no build plugin, no transformer, no runtime registry. Delete `duck-types.d.ts` and the code still runs; it just loses its types.

## 3. The scanner reads source files

`duck-types generate` has to find the strings to describe. It parses every file in `include` with `@babel/parser` (TypeScript syntax, error-tolerant) and collects the argument of every call to an identifier bound by `import { sql } from 'duck-types'` — aliases included (`import { sql as q }`). See [`src/generate/scan.ts`](../src/generate/scan.ts).

Why not the TypeScript compiler API? TypeScript 7's native compiler ships no JavaScript API, and depending on the user's TypeScript version for a build tool is fragile. Babel's parser is pure JS, 400 KB, and handles every TS/TSX file that `tsc` would.

What the scanner cannot see: `sql()` called through a wrapper (`const q = (s: string) => sql(s)`), strings built at runtime, re-exports of `sql` under another module name. These cases get the untyped fallback, not an error.

## What happens on `generate`

1. Glob `include`, parse, collect `(text, file, line, column)` for each literal `sql()` argument.
2. Open DuckDB: `--database` read-only, or in-memory; set `file_search_path` to the project directory; run `--init` if given.
3. For each distinct text: `prepare`, read column names/types and parameter names/types, destroy. Parameter names and column types that DuckDB cannot resolve become `unknown` plus a diagnostic.
4. Sort by text, render `Queries` through `tsTypeFor()` ([`src/types/emit.ts`](../src/types/emit.ts)), write — or compare, with `--check`.

The whole thing is a few hundred lines. Preparing a statement costs DuckDB about a millisecond, so there is no incremental mode: a project with a thousand queries regenerates in about a second.

## Runtime

`Client` ([`src/client.ts`](../src/client.ts)) wraps one `DuckDBConnection`. It caches prepared statements by SQL text, binds parameters through `jsToDuckDBValue()` using the types the prepared statement reports, reads rows with `getRowObjectsJS()`, and serialises calls because a connection runs one statement at a time. The `Row` type is a cast at the boundary — the generated type says what the converter returns, and the converter is what runs.

## What is deliberately not here

- A query builder. SQL is the interface.
- A schema DSL. The schema is wherever DuckDB reads it from.
- Nullability inference. Guessing wrong would be worse than `| null`.
- Connection pooling. Open several clients; DuckDB handles file locking.
