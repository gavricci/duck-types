# FAQ

**Can I interpolate into `sql()`?**
Not and keep the types: ``sql(`… where id = ${id}`)`` is a `string`, not a literal, so it falls back to untyped rows — and it is a SQL injection waiting to happen. Use a parameter: `sql('… where id = $id')` and pass `{ id }`. For a dynamic table name or column list, build the string and accept the untyped fallback, or write one `sql()` per variant.

**Do I commit `typeduck.d.ts`?**
Yes. It is like a lockfile: `tsc` works on a fresh clone, reviews show type changes, and `typeduck generate --check` in CI catches drift. See [CI and workflow](ci.md).

**Why is `count(*)` a `bigint`?**
Because it is a `BIGINT` in DuckDB and `@duckdb/node-api` returns those as `bigint` — a JS `number` could not hold every value. `count(*)::integer` if you want a `number`. [Type mapping](types.md) has the whole story.

**Why is everything `| null`?**
DuckDB does not report nullability for result columns, and typeduck does not guess. Narrow where you know better.

**Can I run queries in parallel?**
Not on one `Client` — it is one connection, and a connection runs one statement at a time. Open several clients on the same database file; DuckDB handles the locking. In-memory databases are per instance, so parallel clients there would not share data.

**Does it work with `duckdb-wasm` in the browser?**
Not yet. The generated `Queries` table is backend-agnostic, so a wasm client with the same `all/one/stream` surface is the planned next backend. The generator will still run in Node (it needs native DuckDB to prepare statements).

**Does it work with Bun? Deno?**
Bun: yes, tested in CI — `@duckdb/node-api` loads under Bun's N-API. Deno: untested.

**Kysely? Drizzle?**
typeduck is not an ORM and does not compete with them on building queries. Adapters that let a Kysely or Drizzle user reuse the generated types are on the roadmap; today you can use typeduck for raw SQL alongside either.

**What does `generate` cost?**
Parsing is fast (Babel), preparing a statement is about a millisecond in DuckDB. A thousand queries regenerate in roughly a second. There is no incremental mode because it has not been needed.

**My query uses an extension (`spatial`, `httpfs`, …).**
Load it in the init file: `install spatial; load spatial;`. The generator's DuckDB is a normal DuckDB.

**The generator says "No files found that match".**
A `read_parquet('data/x.parquet')` resolved relative to the project directory and found nothing. Check the path from the project root, or pass `--cwd` to point the generator where the application runs.

**Can I see what the generator saw without writing the file?**
`typeduck generate --check` prints every diagnostic and exits without writing. For one query programmatically, `describeQuery(connection, text)` is exported.

**How do I type a query without the CLI?**
Augment `Queries` by hand in any `.d.ts` — the shape is in [Architecture](architecture.md). The CLI is a convenience over `describeQuery` + `tsTypeFor`, both exported.
