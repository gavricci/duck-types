import { readFile } from 'node:fs/promises';
import { parse } from '@babel/parser';
import type { Node, SourceLocation } from '@babel/types';

export interface FoundQuery {
  text: string;
  file: string;
  line: number;
  column: number;
}

/**
 * Finds every `sql('...')` call in a TypeScript source file whose `sql` is
 * imported from `typeduck`, and returns the literal text passed to it.
 *
 * Only string literals and `${}`-free template literals count: anything else
 * cannot be typed by name, so the generator ignores it the way the type
 * lookup would.
 */
export async function scanFile(file: string): Promise<FoundQuery[]> {
  return scanSource(await readFile(file, 'utf8'), file);
}

export function scanSource(code: string, file: string): FoundQuery[] {
  const ast = parse(code, {
    sourceType: 'module',
    plugins: ['typescript', ...(file.endsWith('.tsx') ? (['jsx'] as const) : [])],
    errorRecovery: true,
  });
  const names = sqlBindings(ast.program.body);
  if (names.size === 0) {
    return [];
  }
  const found: FoundQuery[] = [];
  walk(ast.program, (node) => {
    if (
      node.type !== 'CallExpression' ||
      node.callee.type !== 'Identifier' ||
      !names.has(node.callee.name) ||
      node.arguments.length !== 1
    ) {
      return;
    }
    const arg = node.arguments[0];
    if (!arg) {
      return;
    }
    let text: string | undefined;
    if (arg.type === 'StringLiteral') {
      text = arg.value;
    } else if (arg.type === 'TemplateLiteral' && arg.expressions.length === 0) {
      text = arg.quasis[0]?.value.cooked ?? undefined;
    }
    if (text !== undefined) {
      found.push({ text, file, ...position(arg.loc) });
    }
  });
  return found;
}

/** Local names bound to typeduck's `sql`: `import { sql }` and `import { sql as q }`. */
function sqlBindings(statements: readonly Node[]): Set<string> {
  const names = new Set<string>();
  for (const statement of statements) {
    if (statement.type !== 'ImportDeclaration' || statement.source.value !== 'typeduck') {
      continue;
    }
    for (const specifier of statement.specifiers) {
      if (specifier.type !== 'ImportSpecifier') {
        continue;
      }
      const imported =
        specifier.imported.type === 'Identifier'
          ? specifier.imported.name
          : specifier.imported.value;
      if (imported === 'sql') {
        names.add(specifier.local.name);
      }
    }
  }
  return names;
}

function position(loc: SourceLocation | null | undefined): { line: number; column: number } {
  return { line: loc?.start.line ?? 0, column: (loc?.start.column ?? -1) + 1 };
}

function walk(node: Node, visit: (node: Node) => void): void {
  visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments') {
      continue;
    }
    const child = (node as unknown as Record<string, unknown>)[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (isNode(item)) {
          walk(item, visit);
        }
      }
    } else if (isNode(child)) {
      walk(child, visit);
    }
  }
}

function isNode(value: unknown): value is Node {
  return typeof value === 'object' && value !== null && typeof (value as Node).type === 'string';
}
