import { readFile } from 'node:fs/promises';
import { DuckDBInstance } from '@duckdb/node-api';
import { glob } from 'tinyglobby';
import { describeQuery } from '../describe.js';
import { emitDeclarations, type GeneratedEntry } from './emit.js';
import { type FoundQuery, scanFile } from './scan.js';

export interface GenerateOptions {
  /** Globs of source files to scan. */
  include: string[];
  /** Database file to describe queries against; in-memory when omitted. */
  database?: string | undefined;
  /** SQL file to run first, e.g. the schema DDL. */
  init?: string | undefined;
  cwd?: string | undefined;
}

export interface Diagnostic {
  query: FoundQuery;
  message: string;
}

export interface GenerateResult {
  declarations: string;
  queries: FoundQuery[];
  diagnostics: Diagnostic[];
}

export async function generate(options: GenerateOptions): Promise<GenerateResult> {
  const cwd = options.cwd ?? process.cwd();
  const files = await glob(options.include, {
    cwd,
    absolute: true,
    ignore: ['**/node_modules/**'],
  });
  const queries = (await Promise.all(files.sort().map(scanFile))).flat();

  const instance = await DuckDBInstance.create(options.database ?? ':memory:', {
    access_mode: options.database ? 'READ_ONLY' : 'READ_WRITE',
  });
  const connection = await instance.connect();
  try {
    if (options.init) {
      await connection.run(await readFile(options.init, 'utf8'));
    }
    const entries = new Map<string, GeneratedEntry>();
    const diagnostics: Diagnostic[] = [];
    for (const query of queries) {
      if (entries.has(query.text)) {
        continue;
      }
      try {
        const description = await describeQuery(connection, query.text);
        entries.set(query.text, { text: query.text, description });
        for (const p of description.params) {
          if (p.type === null) {
            diagnostics.push({
              query,
              message: `cannot infer the type of parameter $${p.name}; add a cast, e.g. $${p.name}::integer`,
            });
          }
        }
      } catch (error) {
        diagnostics.push({
          query,
          message: (error as Error).message.split('\n')[0] ?? String(error),
        });
      }
    }
    return { declarations: emitDeclarations([...entries.values()]), queries, diagnostics };
  } finally {
    connection.closeSync();
    instance.closeSync();
  }
}
