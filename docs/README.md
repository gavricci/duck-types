# duck-types documentation

Every code block in these pages is copied from a file in [`examples/docs/src`](../examples/docs/src), which CI generates types for and typechecks — if a page says something compiles, it does.

| Page | What it covers |
|---|---|
| [Getting started](getting-started.md) | From an empty project to the first typed query in five steps |
| [Where the schema comes from](schema-sources.md) | `--init` DDL, `--database` files, Parquet/CSV with no schema at all, remote databases |
| [Running queries](queries.md) | `all`, `one`, `maybeOne`, `run`, `stream`, `transaction`, parameters, `raw` |
| [Type mapping](types.md) | Every DuckDB type and what it becomes in a row and in a parameter |
| [Parameters](parameters.md) | How DuckDB infers parameter types, when it cannot, and what to do then |
| [CI and workflow](ci.md) | `--check` in CI, `--watch` in development, pre-commit, scripts per package manager |
| [Migrating from @duckdb/node-api](migrating-from-node-api.md) | The same program before and after, line by line |
| [Architecture](architecture.md) | How the lookup works, what was deliberately not done, and the limits that follow |
| [FAQ](faq.md) | Interpolation, connections, wasm, ORMs, performance |
