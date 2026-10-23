# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] — 2026-10-23

First release.

### Added

- `sql('...')` — a SQL string that carries its row and parameter types, looked
  up in the `Queries` interface by exact text.
- `typeduck generate` — scans sources for `sql()` calls, prepares each
  statement in DuckDB and writes `typeduck.d.ts` with the resolved column and
  parameter types. Supports `--init` (run DDL first), `--database` (describe
  against a file, read-only), `--watch`, `--check` for CI, `--cwd`, and
  `typeduck.config.json` for defaults. Relative paths inside SQL resolve
  against the project directory.
- `createClient()` / `Client` over `@duckdb/node-api`: `all`, `one`,
  `maybeOne`, `run`, `stream`, `transaction`, `raw`, `close`. Calls on a
  client are serialised; prepared statements are cached by SQL text;
  `undefined` parameters are rejected.
- `describeQuery()` and `tsTypeFor()` for building on top of the same
  machinery.
- Type mapping for every DuckDB type, with `LIST`, `ARRAY`, `STRUCT`, tuple,
  `MAP`, `UNION` and `ENUM` resolved exactly; every column and nested element
  is nullable.

[Unreleased]: https://github.com/gavricci/typeduck/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/gavricci/typeduck/releases/tag/v0.1.0
