import { type DuckDBType, DuckDBTypeId } from '@duckdb/node-api';

/**
 * Which side of the engine boundary a type is rendered for.
 *
 * `output` is what `@duckdb/node-api` hands back through its JS value
 * converter (`getRowObjectsJS` and friends). `input` is what `jsToDuckDBValue`
 * accepts when binding a parameter; it is wider where the converter is lenient
 * (a BIGINT parameter takes `number` as well as `bigint`).
 */
export type Direction = 'output' | 'input';

/**
 * Renders a DuckDB type as TypeScript type source text, with nested types
 * resolved exactly instead of bottoming out at `JS`.
 *
 * Nullability is not part of the type: DuckDB does not report whether a result
 * column can be NULL, so callers wrap with `nullable()` where it applies.
 */
export function tsTypeFor(type: DuckDBType, direction: Direction = 'output'): string {
  const input = direction === 'input';
  const nested = (t: DuckDBType) => nullable(tsTypeFor(t, direction));
  switch (type.typeId) {
    case DuckDBTypeId.BOOLEAN:
      return 'boolean';
    case DuckDBTypeId.TINYINT:
    case DuckDBTypeId.SMALLINT:
    case DuckDBTypeId.INTEGER:
    case DuckDBTypeId.UTINYINT:
    case DuckDBTypeId.USMALLINT:
    case DuckDBTypeId.UINTEGER:
    case DuckDBTypeId.FLOAT:
    case DuckDBTypeId.DOUBLE:
      return 'number';
    case DuckDBTypeId.DECIMAL:
      return input ? 'number | bigint' : 'number';
    case DuckDBTypeId.BIGINT:
    case DuckDBTypeId.UBIGINT:
    case DuckDBTypeId.HUGEINT:
    case DuckDBTypeId.UHUGEINT:
    case DuckDBTypeId.BIGNUM:
      return input ? 'bigint | number' : 'bigint';
    case DuckDBTypeId.TIME:
    case DuckDBTypeId.TIME_NS:
      return 'bigint';
    case DuckDBTypeId.VARCHAR:
    case DuckDBTypeId.UUID:
      return 'string';
    case DuckDBTypeId.BLOB:
    case DuckDBTypeId.BIT:
    case DuckDBTypeId.GEOMETRY:
      return 'Uint8Array';
    case DuckDBTypeId.DATE:
    case DuckDBTypeId.TIMESTAMP:
    case DuckDBTypeId.TIMESTAMP_S:
    case DuckDBTypeId.TIMESTAMP_MS:
    case DuckDBTypeId.TIMESTAMP_NS:
    case DuckDBTypeId.TIMESTAMP_TZ:
    case DuckDBTypeId.TIMESTAMP_TZ_NS:
      return 'Date';
    case DuckDBTypeId.INTERVAL:
      return '{ months: number; days: number; micros: bigint }';
    case DuckDBTypeId.TIME_TZ:
      return '{ micros: bigint; offset: number }';
    case DuckDBTypeId.ENUM:
      return type.values.map(stringLiteral).join(' | ');
    case DuckDBTypeId.LIST:
    case DuckDBTypeId.ARRAY:
      return `${input ? 'readonly ' : ''}${parenthesize(nested(type.valueType))}[]`;
    case DuckDBTypeId.MAP:
      return `${input ? 'readonly ' : ''}{ key: ${nested(type.keyType)}; value: ${nested(type.valueType)} }[]`;
    case DuckDBTypeId.STRUCT:
      if (type.isTuple) {
        return `${input ? 'readonly ' : ''}[${type.entryTypes.map(nested).join(', ')}]`;
      }
      if (type.entryCount === 0) {
        return '{}';
      }
      return `{ ${type.entryNames
        .map((name, i) => `${propertyKey(name)}: ${nested(type.entryTypes[i] as DuckDBType)}`)
        .join('; ')} }`;
    case DuckDBTypeId.UNION:
      return type.memberTags
        .map(
          (tag, i) =>
            `{ tag: ${stringLiteral(tag)}; value: ${nested(type.memberTypes[i] as DuckDBType)} }`,
        )
        .join(' | ');
    case DuckDBTypeId.VARIANT:
      return input ? 'boolean | number | bigint | string' : 'JS';
    case DuckDBTypeId.SQLNULL:
      return 'null';
    case DuckDBTypeId.ANY:
    case DuckDBTypeId.STRING_LITERAL:
    case DuckDBTypeId.INTEGER_LITERAL:
      return 'never';
  }
}

/** `T | null`, without doubling an existing `null`. */
export function nullable(tsType: string): string {
  if (tsType === 'null' || tsType === 'never') {
    return tsType;
  }
  return `${tsType} | null`;
}

function parenthesize(tsType: string): string {
  return tsType.includes('|') ? `(${tsType})` : tsType;
}

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** A property key as it appears in a TS object type: bare when it is an identifier, quoted otherwise. */
export function propertyKey(name: string): string {
  return IDENTIFIER.test(name) ? name : stringLiteral(name);
}

export function stringLiteral(value: string): string {
  return JSON.stringify(value);
}
