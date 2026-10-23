#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { relative } from 'node:path';
import { parseArgs } from 'node:util';
import { generate } from './generate/index.js';

const USAGE = `Usage: typeduck generate [globs...] [options]

Scans TypeScript sources for sql('...') calls, describes each query against
DuckDB, and writes their row and parameter types as a module augmentation.

Options:
  -d, --database <file>  DuckDB file to describe queries against (opened read-only)
  -i, --init <file>      SQL to run first, e.g. schema DDL (in-memory by default)
  -o, --out <file>       Output file (default: typeduck.d.ts)
      --check            Exit 1 if the output file is out of date; write nothing
  -h, --help

Default globs: src/**/*.ts src/**/*.tsx`;

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      database: { type: 'string', short: 'd' },
      init: { type: 'string', short: 'i' },
      out: { type: 'string', short: 'o', default: 'typeduck.d.ts' },
      check: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const [command, ...globs] = positionals;
  if (values.help || command !== 'generate') {
    console.log(USAGE);
    return values.help ? 0 : 1;
  }

  const result = await generate({
    include: globs.length > 0 ? globs : ['src/**/*.ts', 'src/**/*.tsx'],
    database: values.database,
    init: values.init,
  });

  for (const { query, message } of result.diagnostics) {
    console.error(
      `${relative(process.cwd(), query.file)}:${query.line}:${query.column}: ${message}`,
    );
  }

  const out = values.out as string;
  if (values.check) {
    const current = await readFile(out, 'utf8').catch(() => null);
    if (current !== result.declarations) {
      console.error(`${out} is out of date; run typeduck generate`);
      return 1;
    }
  } else {
    await writeFile(out, result.declarations);
  }
  const typed = result.queries.length - result.diagnostics.length;
  console.error(`${out}: ${typed} of ${result.queries.length} queries typed`);
  return result.diagnostics.length > 0 ? 1 : 0;
}

process.exitCode = await main(process.argv.slice(2));
