import { z } from 'zod';

/**
 * The exact `format` + `pattern` pairs the schema generator (Zod, which also validates these values at runtime) emits
 * for `z.uuid()` and `z.iso.datetime()`, with and without offset. Only these patterns merely repeat their format; any
 * other pattern — even next to a uuid or date-time format — is a rule of its own and stays in the document.
 */
const REDUNDANT_FORMAT_PATTERNS: ReadonlyArray<{ format: string; pattern: string }> = [
  z.uuid(),
  z.iso.datetime(),
  z.iso.datetime({ offset: true }),
].map((schema) => {
  const { format, pattern } = z.toJSONSchema(schema) as { format: string; pattern: string };
  return { format, pattern };
});

/** True only for a pattern the generator emits for exactly this format. When in doubt, the pattern is kept. */
export function isRedundantFormatPattern(format: unknown, pattern: unknown): boolean {
  return REDUNDANT_FORMAT_PATTERNS.some((known) => known.format === format && known.pattern === pattern);
}

/**
 * Presentation-only cleanup of the generated OpenAPI 3.0 document. The schema generator (Zod, through nestjs-zod) emits
 * JSON Schema 2020-12; every shape OpenAPI 3.0 lacks is rewritten to the 3.0 spelling of the same rule:
 *
 * - `const` becomes a single-value `enum`;
 * - a `type` array (Zod ≥ 4.6 writes a bare nullable as `type: [T, "null"]`) becomes one `type` plus `nullable`, or an
 *   `anyOf` of single types when several remain;
 * - a `{ type: "null" }` branch of `anyOf`/`oneOf` becomes `nullable` on the rest;
 * - a nullable `enum` lists `null` among its values, and an `enum` listing `null` is nullable;
 * - a numeric `exclusiveMinimum`/`exclusiveMaximum` becomes the 3.0 bound plus its boolean flag;
 * - `propertyNames: { type: "string" }` — true of every JSON object key — is dropped;
 * - a pattern that only repeats its uuid or date-time format is dropped.
 *
 * A shape with no exact 3.0 spelling (for example a `propertyNames` rule on the keys) is left as it is, so the dialect
 * gate (`openapi-dialect.ts`) names it instead of a rule disappearing silently. Runtime validation is untouched; examples,
 * defaults, enum values and extensions are data and are copied as they are. Returns a new document; the input is not
 * modified, and applying it twice gives the same document.
 */
export function toOpenApi30Presentation<T>(document: T): T {
  return walkDocument(document) as T;
}

/** Keywords whose value is one subschema (or a boolean schema). */
const SUBSCHEMA = new Set([
  'items',
  'additionalProperties',
  'not',
  'if',
  'then',
  'else',
  'contains',
  'propertyNames',
  'unevaluatedItems',
  'unevaluatedProperties',
  'additionalItems',
]);
/** Keywords whose value is a list of subschemas. */
const SUBSCHEMA_LIST = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems']);
/** Keywords whose value maps names (never keywords) to subschemas. */
const SUBSCHEMA_MAP = new Set(['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas']);
/** Keys of the document (outside schemas) whose value is data, copied as it is. */
const DOCUMENT_VALUES = new Set(['example', 'examples', 'default', 'enum', 'const']);

/** A deep copy, never interpreted: examples, defaults, enum values and extensions are data. */
const copy = (value: unknown): unknown => structuredClone(value);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * The OpenAPI document outside schemas. It is walked to find the schemas: `components.schemas.*` and every
 * `schema` (parameters, headers, media types). Examples and `x-*` extensions are copied as they are.
 */
function walkDocument(node: unknown, key?: string): unknown {
  if (Array.isArray(node)) return node.map((item) => walkDocument(item));
  if (!isRecord(node)) return node;

  const result: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(node)) {
    if (DOCUMENT_VALUES.has(name) || name.startsWith('x-')) result[name] = copy(value);
    else if (name === 'schema') result[name] = walkSchema(value);
    else if (name === 'schemas' && key === 'components') result[name] = walkSchemaMap(value);
    else result[name] = walkDocument(value, name);
  }
  return result;
}

function walkSchemaMap(node: unknown): unknown {
  if (!isRecord(node)) return copy(node);
  return Object.fromEntries(Object.entries(node).map(([name, schema]) => [name, walkSchema(schema)]));
}

/**
 * One schema object: its subschemas are walked first, then the schema itself is spelled in OpenAPI 3.0 (see
 * {@link toOpenApi30Presentation}); every other keyword's value (example, default, enum values, a `const` value,
 * extensions, discriminator…) is copied as it is.
 */
function walkSchema(node: unknown): unknown {
  if (!isRecord(node)) return copy(node);

  const result: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(node)) {
    if (SUBSCHEMA.has(name)) result[name] = walkSchema(value);
    else if (SUBSCHEMA_LIST.has(name)) result[name] = Array.isArray(value) ? value.map(walkSchema) : copy(value);
    else if (SUBSCHEMA_MAP.has(name)) result[name] = walkSchemaMap(value);
    else result[name] = copy(value);
  }

  if ('const' in result) {
    result.enum = [result.const];
    delete result.const;
  }
  if (isRedundantFormatPattern(result.format, result.pattern)) delete result.pattern;
  if (isAnyStringKey(result.propertyNames)) delete result.propertyNames;
  toBooleanBound(result, 'exclusiveMinimum', 'minimum', (bound, inclusive) => inclusive > bound);
  toBooleanBound(result, 'exclusiveMaximum', 'maximum', (bound, inclusive) => inclusive < bound);

  return withNullableEnum(withoutNullBranch(withoutNullBranch(withoutTypeArray(result), 'anyOf'), 'oneOf'));
}

type Schema = Record<string, unknown>;

/** `{ type: "string" }` as `propertyNames`: every JSON object key already is one, so the rule says nothing. */
const isAnyStringKey = (value: unknown): boolean =>
  isRecord(value) && Object.keys(value).length === 1 && value.type === 'string';

/**
 * A numeric exclusive bound (JSON Schema 2020-12) as the OpenAPI 3.0 inclusive bound plus its boolean flag. When an
 * inclusive bound is also present, the stricter of the two stays.
 */
function toBooleanBound(
  schema: Schema,
  exclusive: 'exclusiveMinimum' | 'exclusiveMaximum',
  inclusive: 'minimum' | 'maximum',
  inclusiveIsStricter: (bound: number, inclusiveBound: number) => boolean,
): void {
  const bound = schema[exclusive];
  if (typeof bound !== 'number') return;
  const current = schema[inclusive];
  if (typeof current === 'number' && inclusiveIsStricter(bound, current)) {
    delete schema[exclusive];
    return;
  }
  schema[inclusive] = bound;
  schema[exclusive] = true;
}

/** `type: [T, "null"]` → `type: T` + `nullable`; several non-null types → an `anyOf` of single types (+ `nullable`). */
function withoutTypeArray(schema: Schema): Schema {
  if (!Array.isArray(schema.type)) return schema;
  const members = [...new Set(schema.type as unknown[])];
  const nullable = members.includes('null');
  const types = members.filter((member) => member !== 'null');
  // Only null, a non-string member, or an `anyOf` already beside it: no exact 3.0 spelling — the dialect gate names it.
  if (types.length === 0 || types.some((member) => typeof member !== 'string')) return schema;
  const rest: Schema = { ...schema };
  delete rest.type;
  if (types.length === 1) return { ...rest, type: types[0], ...(nullable && { nullable: true }) };
  if ('anyOf' in rest) return schema;
  return { ...rest, anyOf: types.map((type) => ({ type })), ...(nullable && { nullable: true }) };
}

const isNullBranch = (branch: unknown): boolean =>
  isRecord(branch) && branch.type === 'null' && Object.keys(branch).length === 1;
const isBareRef = (branch: unknown): boolean =>
  isRecord(branch) && typeof branch.$ref === 'string' && Object.keys(branch).length === 1;
/** True when merging `branch` into `parent` would overwrite one of the parent's keywords with another value. */
const collides = (parent: Schema, branch: Schema): boolean =>
  Object.keys(branch).some((key) => key in parent && JSON.stringify(parent[key]) !== JSON.stringify(branch[key]));

/**
 * A `{ type: "null" }` branch of `anyOf`/`oneOf` as `nullable` on what remains. One remaining branch is merged into its
 * parent when nothing collides; a `$ref` (whose siblings 3.0 ignores) or a colliding branch is kept under `allOf`.
 */
function withoutNullBranch(schema: Schema, keyword: 'anyOf' | 'oneOf'): Schema {
  const branches: unknown = schema[keyword];
  if (!Array.isArray(branches) || !branches.some(isNullBranch)) return schema;
  const remaining = (branches as unknown[]).filter((branch) => !isNullBranch(branch));
  if (remaining.length === 0) return schema;
  const parent: Schema = { ...schema };
  delete parent[keyword];
  if (remaining.length > 1) return { ...parent, [keyword]: remaining, nullable: true };

  const sole = remaining[0];
  if (isRecord(sole) && !isBareRef(sole) && !collides(parent, sole)) return { ...sole, ...parent, nullable: true };
  const existing: unknown = parent.allOf;
  delete parent.allOf;
  return { allOf: [...(Array.isArray(existing) ? (existing as unknown[]) : []), sole], ...parent, nullable: true };
}

/** OpenAPI 3.0.3: `nullable` does not widen an `enum`, so a nullable enum lists null; an enum listing null is nullable. */
function withNullableEnum(schema: Schema): Schema {
  const values: unknown = schema.enum;
  if (!Array.isArray(values)) return schema;
  const listed = values as unknown[];
  if (schema.nullable === true && !listed.includes(null)) return { ...schema, enum: [...listed, null] };
  if (schema.nullable !== true && listed.includes(null)) return { ...schema, nullable: true };
  return schema;
}
