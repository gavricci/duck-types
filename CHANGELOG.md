# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.1] — 2026-10-25

### Changed

- README: before/after examples no longer use side-by-side tables, which did
  not fit on GitHub or npm.
- `duck-types generate` explains itself when it finds no `sql()` calls at all:
  which globs it scanned, under which directory, and that `sql` must be
  imported from `duck-types`.

## [0.1.0] — 2026-10-24

First release.

### Added

- `sql('...')` — a SQL string that carries its row and parameter types, looked
  up in the `Queries` interface by exact text.
- `duck-types generate` — scans sources for `sql()` calls, prepares each
  statement in DuckDB and writes `duck-types.d.ts` with the resolved column and
  parameter types. Supports `--init` (run DDL first), `--database` (describe
  against a file, read-only), `--watch`, `--check` for CI, `--cwd`, and
  `duck-types.config.json` for defaults. Relative paths inside SQL resolve
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

[Unreleased]: https://github.com/gavricci/duck-types/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/gavricci/duck-types/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/gavricci/duck-types/releases/tag/v0.1.0
