import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { globRoot, main } from '../src/cli/main.js';

const fixtures = fileURLToPath(new URL('./fixtures/', import.meta.url));
let dir: string;
let stderr: string[];
let stdout: string[];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'duck-types-'));
  await cp(fixtures, dir, { recursive: true });
  stderr = [];
  stdout = [];
});

afterEach(() => rm(dir, { recursive: true, force: true }));

const run = (argv: string[], signal?: AbortSignal) =>
  main(argv, {
    cwd: dir,
    stdout: (l) => stdout.push(l),
    stderr: (l) => stderr.push(l),
    ...(signal ? { signal } : {}),
  });

test('generate writes the output and reports diagnostics', async () => {
  expect(await run(['generate', 'app.ts', '-i', 'schema.sql'])).toBe(1);
  expect(stderr).toEqual([
    expect.stringMatching(/^app\.ts:11:28: cannot infer/),
    expect.stringMatching(/^app\.ts:12:27: Catalog Error/),
    'duck-types.d.ts: 2 of 4 queries typed',
  ]);
  const out = await readFile(join(dir, 'duck-types.d.ts'), 'utf8');
  expect(out).toContain('"select id, name from users where id = $id"');
});

test('config file supplies defaults; flags override', async () => {
  await writeFile(
    join(dir, 'duck-types.config.json'),
    JSON.stringify({ include: ['clean.ts'], init: 'schema.sql', out: 'types/q.d.ts' }),
  );
  await writeFile(
    join(dir, 'clean.ts'),
    "import { sql } from 'duck-types';\nexport const q = sql('select id from users');\n",
  );
  await import('node:fs/promises').then((fs) => fs.mkdir(join(dir, 'types')));
  expect(await run(['generate'])).toBe(0);
  expect(stderr).toEqual(['types/q.d.ts: 1 of 1 queries typed']);
  expect(await run(['generate', '-o', 'other.d.ts'])).toBe(0);
  expect(await readFile(join(dir, 'other.d.ts'), 'utf8')).toContain('"select id from users"');
});

test('--check passes when current and fails when stale', async () => {
  await writeFile(
    join(dir, 'clean.ts'),
    "import { sql } from 'duck-types';\nexport const q = sql('select id from users');\n",
  );
  const args = ['generate', 'clean.ts', '-i', 'schema.sql'];
  expect(await run([...args, '--check'])).toBe(1);
  expect(stderr.at(-1)).toBe('duck-types.d.ts is out of date; run duck-types generate');
  await run(args);
  stderr = [];
  expect(await run([...args, '--check'])).toBe(0);
});

test('--watch regenerates on change and stops on abort', async () => {
  await writeFile(
    join(dir, 'clean.ts'),
    "import { sql } from 'duck-types';\nexport const q = sql('select id from users');\n",
  );
  const controller = new AbortController();
  const finished = run(['generate', 'clean.ts', '-i', 'schema.sql', '--watch'], controller.signal);
  await vi.waitFor(() => expect(stderr).toHaveLength(1));
  await writeFile(
    join(dir, 'clean.ts'),
    "import { sql } from 'duck-types';\nexport const q = sql('select name from users');\n",
  );
  await vi.waitFor(
    async () =>
      expect(await readFile(join(dir, 'duck-types.d.ts'), 'utf8')).toContain(
        '"select name from users"',
      ),
    { timeout: 5000 },
  );
  controller.abort();
  expect(await finished).toBe(0);
});

test('help and unknown command', async () => {
  expect(await run(['--help'])).toBe(0);
  expect(stdout[0]).toMatch(/^Usage:/);
  expect(await run(['nope'])).toBe(1);
});

test('globRoot', () => {
  expect(globRoot('src/**/*.ts')).toBe('src');
  expect(globRoot('*.ts')).toBe('.');
  expect(globRoot('app.ts')).toBe('.');
  expect(globRoot('lib/db/queries.ts')).toBe('lib/db');
});
