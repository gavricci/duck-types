import { watch } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { type GenerateOptions, generate } from '../generate/index.js';

export const USAGE = `Usage: duck-types generate [globs...] [options]

Scans TypeScript sources for sql('...') calls, describes each query against
DuckDB, and writes their row and parameter types as a module augmentation.

Options:
  -d, --database <file>  DuckDB file to describe queries against (opened read-only)
  -i, --init <file>      SQL to run first, e.g. schema DDL (in-memory by default)
  -o, --out <file>       Output file (default: duck-types.d.ts)
  -c, --cwd <dir>        Project directory (default: current directory)
      --check            Exit 1 if the output file is out of date; write nothing
  -w, --watch            Regenerate when source files change
  -h, --help

Defaults come from duck-types.config.json in the project directory when present:
  { "include": ["src/**/*.ts"], "database": "...", "init": "...", "out": "..." }
Default globs: src/**/*.ts src/**/*.tsx`;

export interface Config {
  include?: string[];
  database?: string;
  init?: string;
  out?: string;
}

export interface MainOptions {
  cwd?: string;
  stdout?: (line: string) => void;
  stderr?: (line: string) => void;
  /** Stops `--watch`. */
  signal?: AbortSignal;
}

export async function main(argv: string[], options: MainOptions = {}): Promise<number> {
  const stdout = options.stdout ?? ((line) => console.log(line));
  const stderr = options.stderr ?? ((line) => console.error(line));

  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      database: { type: 'string', short: 'd' },
      init: { type: 'string', short: 'i' },
      out: { type: 'string', short: 'o' },
      cwd: { type: 'string', short: 'c' },
      check: { type: 'boolean', default: false },
      watch: { type: 'boolean', short: 'w', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const [command, ...globs] = positionals;
  if (values.help || command !== 'generate') {
    stdout(USAGE);
    return values.help ? 0 : 1;
  }

  const cwd = resolve(options.cwd ?? process.cwd(), values.cwd ?? '.');
  const config = await readConfig(cwd);
  const generateOptions: GenerateOptions = {
    include: globs.length > 0 ? globs : (config.include ?? ['src/**/*.ts', 'src/**/*.tsx']),
    database: values.database ?? config.database,
    init: values.init ?? config.init,
    cwd,
  };
  const out = resolve(cwd, values.out ?? config.out ?? 'duck-types.d.ts');

  const runOnce = async (): Promise<number> => {
    const result = await generate(generateOptions);
    for (const { query, message } of result.diagnostics) {
      stderr(`${rel(cwd, query.file)}:${query.line}:${query.column}: ${message}`);
    }
    if (values.check) {
      const current = await readFile(out, 'utf8').catch(() => null);
      if (current !== result.declarations) {
        stderr(`${rel(cwd, out)} is out of date; run duck-types generate`);
        return 1;
      }
    } else {
      await writeFile(out, result.declarations);
    }
    const typed = result.queries.length - result.diagnostics.length;
    stderr(`${rel(cwd, out)}: ${typed} of ${result.queries.length} queries typed`);
    if (result.queries.length === 0) {
      stderr(
        `no sql() calls found in ${generateOptions.include.join(' ')} under ${cwd}; ` +
          "sql must be imported from 'duck-types' (run from the project directory, or pass --cwd)",
      );
    }
    return result.diagnostics.length > 0 ? 1 : 0;
  };

  const code = await runOnce();
  if (!values.watch) {
    return code;
  }
  await watchAndRerun(cwd, generateOptions.include, out, runOnce, options.signal);
  return 0;
}

/** A path relative to `cwd`, with `/` separators on every platform so messages are stable. */
function rel(cwd: string, path: string): string {
  return relative(cwd, path).split(sep).join('/');
}

async function readConfig(cwd: string): Promise<Config> {
  const text = await readFile(resolve(cwd, 'duck-types.config.json'), 'utf8').catch(() => null);
  return text === null ? {} : (JSON.parse(text) as Config);
}

/** Watches the directories the globs start in and reruns on any change, debounced. */
function watchAndRerun(
  cwd: string,
  include: string[],
  out: string,
  rerun: () => Promise<number>,
  signal?: AbortSignal,
): Promise<void> {
  const roots = new Set(include.map((g) => resolve(cwd, globRoot(g))));
  return new Promise((done) => {
    let timer: NodeJS.Timeout | undefined;
    let running = Promise.resolve();
    const watchers = [...roots].map((root) =>
      watch(root, { recursive: true }, (_event, file) => {
        if (file && resolve(root, file) === out) {
          return;
        }
        clearTimeout(timer);
        timer = setTimeout(() => {
          running = running.then(() => rerun().then(() => undefined));
        }, 100);
      }),
    );
    const stop = () => {
      clearTimeout(timer);
      for (const w of watchers) {
        w.close();
      }
      running.then(done);
    };
    if (signal?.aborted) {
      stop();
    } else {
      signal?.addEventListener('abort', stop, { once: true });
    }
  });
}

/** The literal directory prefix of a glob: `src/**\/*.ts` → `src`, `*.ts` → `.`. */
export function globRoot(pattern: string): string {
  const parts = pattern.split('/');
  const literal: string[] = [];
  for (const part of parts) {
    if (/[*?[{]/.test(part)) {
      break;
    }
    literal.push(part);
  }
  if (literal.length === parts.length) {
    return dirname(pattern);
  }
  return literal.length > 0 ? literal.join('/') : '.';
}
