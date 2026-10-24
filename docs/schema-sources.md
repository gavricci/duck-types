# Where the schema comes from

The generator describes each query by preparing it in a DuckDB connection. What that connection knows decides what gets typed. There are three ways to give it a schema, and one case where it needs none.

## `--init`: run DDL first

```sh
typeduck generate --init schema.sql
```

An in-memory database is created, `schema.sql` is executed, then every query is prepared. Anything SQL can do is allowed in the file: `CREATE TABLE`, `CREATE TYPE … AS ENUM`, `CREATE MACRO`, `INSTALL`/`LOAD` for extensions, `ATTACH` for other databases.

```ts
// examples/docs/src/schema-sources.ts
export const customers = sql('select distinct customer from orders order by 1');
```

This is the default to reach for: the schema lives next to the code and reviews like code.

## `--database`: a real file

```sh
typeduck generate --database analytics.duckdb
```

The file is opened **read-only** and queries are prepared against its catalog. Use this when the schema is owned elsewhere (a pipeline writes the file, you only read it). The database is never modified; `generate` runs no query, it only prepares them.

Both at once also works: `--database` for the tables that exist, `--init` for views or macros the application adds on top.

## No schema: files are the schema

DuckDB reads Parquet, CSV and JSON directly and infers their columns. Queries over files need no `CREATE TABLE` at all:

```ts
// examples/docs/src/schema-sources.ts
export const fromCsv = sql(`
  select id, customer, total::decimal(10, 2) as total, placed_at
  from read_csv('data/orders.csv')
  where customer = $customer
`);

export const spendFromCsv = sql(`
  select customer, sum(total) as spend, count(*) as orders
  from read_csv('data/orders.csv')
  group by customer
  order by spend desc
`);
```

Relative paths resolve against the project directory — the generator sets DuckDB's `file_search_path` to it — so `generate` sees the same files the application will. For files elsewhere pass `--cwd`.

A caveat worth knowing: CSV inference looks at the file's contents, so a column that happens to hold only integers in the sample becomes `BIGINT`. Cast where the type matters (`total::decimal(10, 2)` above), or prefer Parquet, which carries its schema.

## Remote databases

Put the `ATTACH` in the init file:

```sql
-- init.sql
attach 'https://example.com/warehouse.duckdb' as warehouse (read_only);
```

Then query `warehouse.orders` as usual. The same works for MotherDuck (`attach 'md:'`) and for DuckLake/Iceberg catalogs once the extension is loaded in the same file. Credentials go through DuckDB's own secret manager (`CREATE SECRET …`), never into `typeduck.config.json`.

## Which one?

| Situation | Use |
|---|---|
| Application owns its tables | `--init schema.sql` |
| Someone else produces the `.duckdb` file | `--database file.duckdb` |
| Data lives in Parquet/CSV | nothing; cast inferred CSV columns |
| Mix of the above | `--database` + `--init` |
