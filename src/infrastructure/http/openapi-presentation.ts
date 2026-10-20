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
 * Presentation-only cleanup of the generated OpenAPI 3.0 document: `const` (an OpenAPI 3.1 keyword) becomes a
 * single-value `enum`, and a pattern that only repeats its uuid or date-time format is dropped. Runtime validation is
 * untouched. Returns a new document; the input is not modified.
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
 * The OpenAPI document outside schemas (CP0-10). It is walked to find the schemas: `components.schemas.*` and every
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
 * One schema object: `const` becomes a single-value `enum` and a pattern that only repeats its format is dropped; its
 * subschemas are walked as schemas; every other keyword's value (example, default, enum values, a `const` value,
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

  return result;
}
