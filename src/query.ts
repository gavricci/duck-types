import type { JS } from '@duckdb/node-api';

/**
 * The type table `duck-types generate` fills in through module augmentation:
 * one entry per SQL string found in the project, keyed by the exact text.
 *
 * ```ts
 * declare module 'duck-types' {
 *   interface Queries {
 *     'select id from users where id = $id': {
 *       row: { id: number | null };
 *       params: { id: number };
 *     };
 *   }
 * }
 * ```
 */
// biome-ignore lint/suspicious/noEmptyInterface: augmented by generated code
export interface Queries {}

export interface QuerySpec {
  row: Record<string, unknown>;
  params: Record<string, unknown> | readonly unknown[];
}

/**
 * What a query is typed as when the generator has not seen it: JS rows, and
 * parameters that are optional and unchecked.
 */
export interface UnknownQuerySpec {
  row: Record<string, JS | null>;
  params: unknown;
}

type SpecOf<S extends string> = S extends keyof Queries
  ? Queries[S] extends QuerySpec
    ? Queries[S]
    : UnknownQuerySpec
  : UnknownQuerySpec;

/** A SQL statement carrying its row and parameter types. */
export interface Query<Row = Record<string, unknown>, Params = unknown> {
  readonly text: string;
  /** Type-only: never set at runtime. */
  readonly __row?: Row;
  /** Type-only: never set at runtime. */
  readonly __params?: Params;
}

export type RowOf<Q> = Q extends Query<infer R, unknown> ? R : never;
export type ParamsOf<Q> = Q extends Query<unknown, infer P> ? P : never;

/**
 * Wraps a SQL string so its types can be looked up. The argument must be a
 * string literal (or a template literal without `${}`) for the lookup to
 * work; an interpolated string falls back to untyped rows.
 */
export function sql<const S extends string>(text: S): Query<SpecOf<S>['row'], SpecOf<S>['params']> {
  return { text };
}
