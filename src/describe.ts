import type { DuckDBConnection, DuckDBType } from '@duckdb/node-api';

export interface ColumnInfo {
  name: string;
  /** As `getRowObjectsJS` keys it: the second `a` becomes `a:1`, the third `a:2`. */
  key: string;
  /** `null` when the type depends on an untyped parameter: `select $x as x`. */
  type: DuckDBType | null;
}

export interface ParamInfo {
  /** `$id` → `id`; `$1` or `?` → `1`. */
  name: string;
  /** `null` when DuckDB could not infer it from context: `select $x` needs a cast. */
  type: DuckDBType | null;
}

export interface QueryDescription {
  columns: ColumnInfo[];
  params: ParamInfo[];
  /** Whether every parameter is positional (`$1`, `?`) rather than named (`$id`). */
  positional: boolean;
}

/**
 * Prepares `sql` and reads back what DuckDB knows about it without running it:
 * result column names and types, parameter names and types.
 *
 * Throws DuckDB's own error when the statement does not prepare (unknown
 * table, missing file, syntax error).
 */
export async function describeQuery(
  connection: DuckDBConnection,
  sql: string,
): Promise<QueryDescription> {
  const prepared = await connection.prepare(sql);
  try {
    const columns: ColumnInfo[] = [];
    const seen = new Map<string, number>();
    for (let i = 0; i < prepared.columnCount; i++) {
      const name = prepared.columnName(i);
      const count = (seen.get(name) ?? 0) + 1;
      seen.set(name, count);
      columns.push({
        name,
        key: count > 1 ? `${name}:${count - 1}` : name,
        type: tryType(() => prepared.columnType(i)),
      });
    }

    const params: ParamInfo[] = [];
    for (let i = 1; i <= prepared.parameterCount; i++) {
      params.push({
        name: prepared.parameterName(i),
        type: tryType(() => prepared.parameterType(i)),
      });
    }

    return {
      columns,
      params,
      positional: params.every((p, i) => p.name === String(i + 1)),
    };
  } finally {
    prepared.destroySync();
  }
}

function tryType(read: () => DuckDBType): DuckDBType | null {
  try {
    return read();
  } catch {
    // The bindings throw ("Failed to get param logical type", "Unexpected
    // type id: 0") when DuckDB has not resolved the type.
    return null;
  }
}
