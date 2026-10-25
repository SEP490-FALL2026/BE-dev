/**
 * OPENAPI-EXAMPLE.1-F3: the exported document declares OpenAPI 3.0, so every schema in it must be an OpenAPI 3.0 Schema
 * Object — the JSON Schema subset 3.0 defines, not JSON Schema 2020-12 (OpenAPI 3.1). Client generators validate the
 * whole document against the declared version and refuse a mixed one (FE/Mobile Orval). This checker names each shape
 * outside the dialect by JSON pointer and reason; it reads the document and never changes it.
 */

export interface OpenApiDialectViolation {
  /** JSON pointer (RFC 6901) of the offending keyword or schema. */
  pointer: string;
  reason: string;
}

/** Raised by {@link assertOpenApi30Dialect}; carries every violation so the caller can name each one. */
export class OpenApiDialectError extends Error {
  constructor(readonly violations: readonly OpenApiDialectViolation[]) {
    super(`${violations.length} OpenAPI 3.0 dialect violations`);
    this.name = 'OpenApiDialectError';
  }
}

/** The fixed fields of an OpenAPI 3.0.3 Schema Object (`x-*` extensions are allowed besides). */
const SCHEMA_FIELDS = new Set([
  'title',
  'multipleOf',
  'maximum',
  'exclusiveMaximum',
  'minimum',
  'exclusiveMinimum',
  'maxLength',
  'minLength',
  'pattern',
  'maxItems',
  'minItems',
  'uniqueItems',
  'maxProperties',
  'minProperties',
  'required',
  'enum',
  'type',
  'allOf',
  'oneOf',
  'anyOf',
  'not',
  'items',
  'properties',
  'additionalProperties',
  'description',
  'format',
  'default',
  'nullable',
  'discriminator',
  'readOnly',
  'writeOnly',
  'xml',
  'externalDocs',
  'example',
  'deprecated',
  '$ref',
]);
const TYPES = new Set(['integer', 'number', 'string', 'boolean', 'array', 'object']);

/** Positions whose value is one subschema — the 3.0 ones and the JSON Schema ones, so nothing below them is missed. */
const SUBSCHEMA = [
  'items',
  'additionalProperties',
  'not',
  'propertyNames',
  'contains',
  'if',
  'then',
  'else',
  'unevaluatedItems',
  'unevaluatedProperties',
  'additionalItems',
];
const SUBSCHEMA_LIST = ['allOf', 'anyOf', 'oneOf', 'prefixItems'];
const SUBSCHEMA_MAP = ['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas'];
/** Keys of the document (outside schemas) whose value is data. */
const DOCUMENT_VALUES = new Set(['example', 'examples', 'default', 'enum', 'const']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const escape = (key: string) => key.replace(/~/g, '~0').replace(/\//g, '~1');

/** Every schema shape of `document` outside OpenAPI 3.0, in document order. Empty for a coherent 3.0 document. */
export function findOpenApi30Violations(document: unknown): OpenApiDialectViolation[] {
  const violations: OpenApiDialectViolation[] = [];
  const version = isRecord(document) ? document.openapi : undefined;
  if (typeof version !== 'string' || !/^3\.0\.\d+$/.test(version)) {
    violations.push({ pointer: '#/openapi', reason: `declared version ${String(version)} is not OpenAPI 3.0.x` });
  }
  walkDocument(document, '#', undefined, violations);
  return violations;
}

/** Throws {@link OpenApiDialectError} when the document is not one coherent OpenAPI 3.0 document. */
export function assertOpenApi30Dialect(document: unknown): void {
  const violations = findOpenApi30Violations(document);
  if (violations.length > 0) throw new OpenApiDialectError(violations);
}

/** The document outside schemas: walked to reach `components.schemas.*` and every `schema` (parameters, headers, media). */
function walkDocument(node: unknown, pointer: string, key: string | undefined, out: OpenApiDialectViolation[]): void {
  if (Array.isArray(node)) {
    node.forEach((item, index) => walkDocument(item, `${pointer}/${index}`, undefined, out));
    return;
  }
  if (!isRecord(node)) return;
  for (const [name, value] of Object.entries(node)) {
    const at = `${pointer}/${escape(name)}`;
    if (DOCUMENT_VALUES.has(name) || name.startsWith('x-')) continue;
    if (name === 'schema') walkSchema(value, at, out);
    else if (name === 'schemas' && key === 'components' && isRecord(value))
      for (const [schemaName, schema] of Object.entries(value)) walkSchema(schema, `${at}/${escape(schemaName)}`, out);
    else walkDocument(value, at, name, out);
  }
}

function walkSchema(node: unknown, pointer: string, out: OpenApiDialectViolation[]): void {
  if (typeof node === 'boolean') {
    if (!pointer.endsWith('/additionalProperties'))
      out.push({ pointer, reason: 'a boolean schema is allowed only as additionalProperties' });
    return;
  }
  if (!isRecord(node)) return;

  if (typeof node.$ref === 'string' && Object.keys(node).some((key) => key !== '$ref' && !key.startsWith('x-')))
    out.push({ pointer, reason: 'siblings of $ref are ignored in OpenAPI 3.0' });
  if (node.type === 'array' && node.items === undefined)
    out.push({ pointer, reason: 'an array schema must declare items in OpenAPI 3.0' });

  for (const [name, value] of Object.entries(node)) {
    const at = `${pointer}/${escape(name)}`;
    if (name.startsWith('x-')) continue;
    if (!SCHEMA_FIELDS.has(name)) out.push({ pointer: at, reason: `${name} is not an OpenAPI 3.0 schema field` });
    else if (name === 'type') {
      if (Array.isArray(value))
        out.push({ pointer: at, reason: `type must be one string in OpenAPI 3.0, found ${JSON.stringify(value)}` });
      else if (typeof value !== 'string' || !TYPES.has(value))
        out.push({ pointer: at, reason: `type ${JSON.stringify(value)} is not an OpenAPI 3.0 type` });
    } else if ((name === 'exclusiveMinimum' || name === 'exclusiveMaximum') && typeof value !== 'boolean')
      out.push({ pointer: at, reason: `${name} must be a boolean in OpenAPI 3.0` });
    else if (name === 'enum' && Array.isArray(value) && value.includes(null) && node.nullable !== true)
      out.push({ pointer: at, reason: 'enum allows null but nullable is not true' });

    if (SUBSCHEMA.includes(name)) walkSchema(value, at, out);
    else if (SUBSCHEMA_LIST.includes(name) && Array.isArray(value))
      value.forEach((item, index) => walkSchema(item, `${at}/${index}`, out));
    else if (SUBSCHEMA_MAP.includes(name) && isRecord(value))
      for (const [key, schema] of Object.entries(value)) walkSchema(schema, `${at}/${escape(key)}`, out);
  }
}
