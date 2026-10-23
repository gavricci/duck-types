import { type DuckDBType, DuckDBTypeId } from '@duckdb/node-api';

/**
 * Renders a DuckDB type as TypeScript type source text, matching the shape
 * `@duckdb/node-api` produces through its JS value converter
 * (`getRowObjectsJS` and friends), with nested types resolved exactly instead
 * of bottoming out at `JS`.
 *
 * Nullability is not part of the type: DuckDB does not report whether a result
 * column can be NULL, so callers wrap with `nullable()` where it applies.
 */
export function tsTypeFor(type: DuckDBType): string {
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
    case DuckDBTypeId.DECIMAL:
      return 'number';
    case DuckDBTypeId.BIGINT:
    case DuckDBTypeId.UBIGINT:
    case DuckDBTypeId.HUGEINT:
    case DuckDBTypeId.UHUGEINT:
    case DuckDBTypeId.BIGNUM:
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
      return `${parenthesize(nullable(tsTypeFor(type.valueType)))}[]`;
    case DuckDBTypeId.MAP:
      return `{ key: ${nullable(tsTypeFor(type.keyType))}; value: ${nullable(tsTypeFor(type.valueType))} }[]`;
    case DuckDBTypeId.STRUCT:
      if (type.isTuple) {
        return `[${type.entryTypes.map((t) => nullable(tsTypeFor(t))).join(', ')}]`;
      }
      if (type.entryCount === 0) {
        return '{}';
      }
      return `{ ${type.entryNames
        .map(
          (name, i) =>
            `${propertyKey(name)}: ${nullable(tsTypeFor(type.entryTypes[i] as DuckDBType))}`,
        )
        .join('; ')} }`;
    case DuckDBTypeId.UNION:
      return type.memberTags
        .map(
          (tag, i) =>
            `{ tag: ${stringLiteral(tag)}; value: ${nullable(tsTypeFor(type.memberTypes[i] as DuckDBType))} }`,
        )
        .join(' | ');
    case DuckDBTypeId.VARIANT:
      return 'JS';
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
