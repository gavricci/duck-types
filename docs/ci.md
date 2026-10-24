# CI and workflow

`typeduck.d.ts` is generated, committed, and checked — the same contract as a lockfile.

## Commit the file

Yes, commit it. It makes `tsc` work on a fresh clone without DuckDB having run, it shows type changes in code review, and `--check` keeps it honest.

## `--check` in CI

```sh
typeduck generate --check
```

Regenerates in memory and exits 1 if the result differs from the file on disk (or if any query failed to describe). Nothing is written.

```yaml
# .github/workflows/ci.yml
- run: pnpm install --frozen-lockfile
- run: pnpm typeduck generate --check
- run: pnpm tsc --noEmit
```

A failing check means someone changed a query, or the schema, without regenerating. The fix is `typeduck generate` and a commit.

## `--watch` in development

```sh
typeduck generate --watch
```

Watches the directories your `include` globs start in and regenerates on change, debounced. Editor type errors update as you type SQL — which is the moment typeduck is actually fun.

## Scripts

```json
{
  "scripts": {
    "generate": "typeduck generate",
    "dev": "typeduck generate --watch",
    "typecheck": "typeduck generate --check && tsc --noEmit"
  }
}
```

Run with `pnpm generate`, `npm run generate` or `bun run generate` — the script is the same. If you prefer no script, the runners are `pnpm typeduck`, `npx typeduck`, `bunx typeduck`.

## Pre-commit

With [lefthook](https://github.com/evilmartians/lefthook), husky or a plain hook:

```sh
#!/bin/sh
typeduck generate --check || {
  echo "typeduck.d.ts is stale — run: typeduck generate"
  exit 1
}
```

## Schema changes

When the schema changes, regenerate. If a query no longer prepares (a renamed column, a dropped table), `generate` prints DuckDB's error with the file and position of the `sql()` call and exits 1 — the first failing step is the generator, before any test.
