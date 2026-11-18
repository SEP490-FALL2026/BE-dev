import type { z } from 'zod';
import { Prisma } from '../../generated/prisma/client';
import { JsonColumnShapeError } from './json-column.errors';

/** A JSON column that always holds a value: read through `decode`, written through `encode`. */
export interface JsonColumn<T> {
  /** The value of the column as the domain type, or a `JsonColumnShapeError` naming the table, the column and the faults. */
  decode(value: unknown): T;
  /** The JSON to write: the shape the column has always had. */
  encode(value: T): Prisma.InputJsonValue;
}

/** A JSON column that may be NULL: `null` reads as `null` and writes as the database NULL. */
export interface NullableJsonColumn<T> {
  decode(value: unknown): T | null;
  encode(value: T | null): Prisma.InputJsonValue | typeof Prisma.DbNull;
}

interface JsonColumnSpec<S extends z.ZodType> {
  /** The table and the column as PostgreSQL names them (`@@map`, `@map`), for the error. */
  table: string;
  column: string;
  /** What the column holds when it is read; the output type is the domain type. */
  schema: S;
  /** Domain value to the JSON that is stored. It is typed, not checked: the domain type is the guard on the way in. */
  encode: (value: z.output<S>) => Prisma.InputJsonValue;
}

function decoderOf<S extends z.ZodType>({ table, column, schema }: JsonColumnSpec<S>): (value: unknown) => z.output<S> {
  return (value) => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new JsonColumnShapeError(table, column, parsed.error.issues);

    return parsed.data;
  };
}

/** The one codec of a JSON column that always has a value (`NOT NULL`). */
export function jsonColumn<S extends z.ZodType>(spec: JsonColumnSpec<S>): JsonColumn<z.output<S>> {
  return { decode: decoderOf(spec), encode: spec.encode };
}

/** The one codec of a JSON column that may be NULL. */
export function nullableJsonColumn<S extends z.ZodType>(spec: JsonColumnSpec<S>): NullableJsonColumn<z.output<S>> {
  const decode = decoderOf(spec);

  return {
    decode: (value) => (value === null || value === undefined ? null : decode(value)),
    encode: (value) => (value === null ? Prisma.DbNull : spec.encode(value)),
  };
}
