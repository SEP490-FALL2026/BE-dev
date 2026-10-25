import { z } from 'zod';
import { findOpenApi30Violations } from './openapi-dialect';
import { isRedundantFormatPattern, toOpenApi30Presentation } from './openapi-presentation';

/** What the schema generator really emits next to `format`: the oracle for "redundant". */
const generated = (schema: z.ZodType): { format: string; pattern: string } => {
  const { format, pattern } = z.toJSONSchema(schema) as { format: string; pattern: string };
  return { format, pattern };
};
const GENERATED_UUID = generated(z.uuid());
const GENERATED_DATE_TIME = generated(z.iso.datetime());
const GENERATED_DATE_TIME_WITH_OFFSET = generated(z.iso.datetime({ offset: true }));

const MESSAGE_KEY_PATTERN = '^[A-Z][A-Z0-9_]*(\\.[A-Z0-9_]+)+$';
/** Business rules that are narrower than the format: they must survive the cleanup. */
const VERSION_4_UUID_ONLY = '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
const WHOLE_SECONDS_UTC_ONLY = '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$';

describe('toOpenApi30Presentation', () => {
  const source = () => ({
    openapi: '3.0.0',
    components: {
      schemas: {
        Envelope: {
          type: 'object',
          properties: {
            success: { type: 'boolean', const: false },
            message: { type: 'string', pattern: MESSAGE_KEY_PATTERN },
            id: { type: 'string', ...GENERATED_UUID },
            at: { type: 'string', ...GENERATED_DATE_TIME },
            atWithOffset: { type: 'string', ...GENERATED_DATE_TIME_WITH_OFFSET },
            items: { type: 'array', items: { type: 'string', ...GENERATED_UUID } },
            customId: { type: 'string', format: 'uuid', pattern: VERSION_4_UUID_ONLY },
            customAt: { type: 'string', format: 'date-time', pattern: WHOLE_SECONDS_UTC_ONLY },
            swapped: { type: 'string', format: 'date-time', pattern: GENERATED_UUID.pattern },
            file: { type: 'string', format: 'binary' },
            code: { type: 'string', format: 'other', pattern: '^[A-Z]+$' },
          },
        },
      },
    },
  });

  it('turns every OpenAPI 3.1 `const` into a single-value `enum`, at any depth', () => {
    const result = toOpenApi30Presentation(source());

    expect(result.components.schemas.Envelope.properties.success).toEqual({ type: 'boolean', enum: [false] });
  });

  it('drops exactly the uuid and date-time patterns the generator emits, at any depth', () => {
    const { properties } = toOpenApi30Presentation(source()).components.schemas.Envelope;

    expect(properties.id).toEqual({ type: 'string', format: 'uuid' });
    expect(properties.at).toEqual({ type: 'string', format: 'date-time' });
    expect(properties.atWithOffset).toEqual({ type: 'string', format: 'date-time' });
    expect(properties.items.items).toEqual({ type: 'string', format: 'uuid' });
  });

  it.each([
    ['a custom uuid pattern', 'customId', 'uuid', VERSION_4_UUID_ONLY],
    ['a custom date-time pattern', 'customAt', 'date-time', WHOLE_SECONDS_UTC_ONLY],
    // A generated pattern only counts as redundant next to its own format.
    ['a generated uuid pattern next to date-time', 'swapped', 'date-time', GENERATED_UUID.pattern],
  ] as const)('keeps %s', (_label, property, format, pattern) => {
    const { properties } = toOpenApi30Presentation(source()).components.schemas.Envelope;

    expect(properties[property]).toEqual({ type: 'string', format, pattern });
  });

  it('keeps business patterns without a format and patterns next to any other format', () => {
    const { properties } = toOpenApi30Presentation(source()).components.schemas.Envelope;

    expect(properties.message).toEqual({ type: 'string', pattern: MESSAGE_KEY_PATTERN });
    expect(properties.code).toEqual({ type: 'string', format: 'other', pattern: '^[A-Z]+$' });
    expect(properties.file).toEqual({ type: 'string', format: 'binary' });
  });

  it('does not modify the document it is given', () => {
    const input = source();
    const snapshot = JSON.stringify(input);

    toOpenApi30Presentation(input);

    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

/** CP0-10: `const` is a schema keyword; it is converted only on schema objects, never on names or values. */
describe('toOpenApi30Presentation: `const` only where it is a schema keyword', () => {
  const ENUM_FALSE = { type: 'boolean', enum: [false] };
  const document = () => ({
    openapi: '3.0.0',
    paths: {
      '/things/{kind}': {
        get: {
          parameters: [{ name: 'kind', in: 'path', schema: { type: 'string', const: 'a' } }],
          responses: {
            '200': {
              description: 'ok',
              headers: { 'X-Flag': { schema: { type: 'boolean', const: true } } },
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Thing' },
                  // A response example is a value: its `const` key is data, not a keyword.
                  example: { const: 'value', nested: { const: 1 } },
                  examples: { one: { value: { const: 'x' } } },
                },
              },
            },
          },
          'x-internal': { const: 'extension payload' },
        },
      },
    },
    components: {
      schemas: {
        Thing: {
          type: 'object',
          properties: {
            // A property literally named `const`: its name stays, its own schema keyword converts.
            const: { type: 'string', const: 'k' },
            flag: { type: 'boolean', const: false },
            list: { type: 'array', items: { type: 'boolean', const: false } },
            tuple: { type: 'array', prefixItems: [{ type: 'boolean', const: false }] },
            map: { type: 'object', additionalProperties: { type: 'boolean', const: false } },
            either: { anyOf: [{ type: 'boolean', const: false }, { oneOf: [{ type: 'boolean', const: false }] }] },
            both: { allOf: [{ type: 'object', properties: { inner: { type: 'boolean', const: false } } }] },
            notThis: { not: { type: 'boolean', const: false } },
            withDefault: { type: 'object', default: { const: 'kept' } },
            withExample: { type: 'object', example: { const: 'kept' }, 'x-note': { const: 'kept' } },
            withEnumValue: { type: 'object', enum: [{ const: 'kept' }] },
          },
        },
      },
    },
  });

  it('converts `const` on schemas: parameters, headers, components, and every subschema position', () => {
    const result = toOpenApi30Presentation(document());
    const operation = result.paths['/things/{kind}'].get;
    const { properties } = result.components.schemas.Thing;

    expect(operation.parameters[0].schema).toEqual({ type: 'string', enum: ['a'] });
    expect(operation.responses['200'].headers['X-Flag'].schema).toEqual({ type: 'boolean', enum: [true] });
    expect(properties.flag).toEqual(ENUM_FALSE);
    expect(properties.list.items).toEqual(ENUM_FALSE);
    expect(properties.tuple.prefixItems[0]).toEqual(ENUM_FALSE);
    expect(properties.map.additionalProperties).toEqual(ENUM_FALSE);
    expect(properties.either.anyOf[0]).toEqual(ENUM_FALSE);
    expect((properties.either.anyOf[1] as { oneOf: unknown[] }).oneOf[0]).toEqual(ENUM_FALSE);
    expect(properties.both.allOf[0].properties.inner).toEqual(ENUM_FALSE);
    expect(properties.notThis.not).toEqual(ENUM_FALSE);
  });

  it('keeps a property named `const` as a property name', () => {
    const { properties } = toOpenApi30Presentation(document()).components.schemas.Thing;

    expect(Object.keys(properties)).toContain('const');
    expect(properties.const).toEqual({ type: 'string', enum: ['k'] });
    expect(Object.keys(properties)).not.toContain('enum');
  });

  it('never renames `const` inside an example, examples, default, an enum value or an extension', () => {
    const result = toOpenApi30Presentation(document());
    const media = result.paths['/things/{kind}'].get.responses['200'].content['application/json'];
    const { properties } = result.components.schemas.Thing;

    expect(media.example).toEqual({ const: 'value', nested: { const: 1 } });
    expect(media.examples.one.value).toEqual({ const: 'x' });
    expect(result.paths['/things/{kind}'].get['x-internal']).toEqual({ const: 'extension payload' });
    expect(properties.withDefault.default).toEqual({ const: 'kept' });
    expect(properties.withExample.example).toEqual({ const: 'kept' });
    expect(properties.withExample['x-note']).toEqual({ const: 'kept' });
    expect(properties.withEnumValue.enum).toEqual([{ const: 'kept' }]);
  });

  it('leaves its input untouched and gives the same result when applied twice', () => {
    const input = document();
    const snapshot = JSON.stringify(input);

    const once = toOpenApi30Presentation(input);
    const twice = toOpenApi30Presentation(once);

    expect(JSON.stringify(input)).toBe(snapshot);
    expect(twice).toEqual(once);
  });
});

describe('toOpenApi30Presentation: response examples (OPENAPI-EXAMPLE.1)', () => {
  const ENVELOPE = { $ref: '#/components/schemas/ErrorEnvelopeDto' };
  const responses = () => ({
    '200': {
      description: 'ok',
      content: {
        'application/json': {
          schema: {
            allOf: [
              { $ref: '#/components/schemas/ThingDto' },
              { properties: { message: { example: 'THING.FETCHED' } } },
            ],
          },
        },
      },
    },
    '404': {
      description: 'missing',
      content: {
        'application/json': {
          schema: ENVELOPE,
          examples: {
            'THING.NOT_FOUND': {
              summary: 'The thing does not exist.',
              value: {
                success: false,
                error: {
                  code: 'THING.NOT_FOUND',
                  message: 'The thing does not exist.',
                  const: 'x',
                  requestId: 'req_example',
                },
              },
            },
          },
        },
      },
    },
  });

  it('keeps the success message overlay and the named error examples exactly as they are', () => {
    const input = { openapi: '3.0.0', paths: { '/things/{id}': { get: { responses: responses() } } } };

    expect(toOpenApi30Presentation(input).paths['/things/{id}'].get.responses).toEqual(responses());
  });
});

/** Wraps one schema in a document at the position a component property takes. */
const inComponent = (schema: unknown, required: string[] = []) => ({
  openapi: '3.0.0',
  components: { schemas: { Thing: { type: 'object', properties: { field: schema }, required } } },
});
const presentedField = (schema: unknown): unknown =>
  toOpenApi30Presentation(inComponent(schema)).components.schemas.Thing.properties.field;

/**
 * OPENAPI-EXAMPLE.1-F3: since Zod 4.6, a bare `z.string().nullable()` is emitted as `type: ["string", "null"]` and a
 * record as `propertyNames: { type: "string" }` — JSON Schema the OpenAPI 3.0 document must not contain.
 */
describe('toOpenApi30Presentation: JSON Schema type unions and null (OPENAPI-EXAMPLE.1-F3)', () => {
  it.each([
    ['a nullable type array', { type: ['string', 'null'] }, { type: 'string', nullable: true }],
    ['the null member first', { type: ['null', 'integer'] }, { type: 'integer', nullable: true }],
    ['a one-member type array', { type: ['boolean'] }, { type: 'boolean' }],
    [
      'a type array next to constraints',
      { type: ['string', 'null'], format: 'date', maxLength: 10 },
      { type: 'string', format: 'date', maxLength: 10, nullable: true },
    ],
    ['a multi-type union', { type: ['string', 'number'] }, { anyOf: [{ type: 'string' }, { type: 'number' }] }],
    [
      'a nullable multi-type union',
      { type: ['string', 'number', 'null'] },
      { anyOf: [{ type: 'string' }, { type: 'number' }], nullable: true },
    ],
    [
      'a nullable enum, whose values must then list null',
      { type: ['string', 'null'], enum: ['A', 'B'] },
      { type: 'string', enum: ['A', 'B', null], nullable: true },
    ],
  ])('turns %s into one OpenAPI 3.0 type', (_label, schema, expected) => {
    expect(presentedField(schema)).toEqual(expected);
  });

  it.each([
    [
      'a constrained branch, merged with its parent',
      { anyOf: [{ type: 'string', minLength: 1 }, { type: 'null' }], description: 'kept' },
      { type: 'string', minLength: 1, description: 'kept', nullable: true },
    ],
    [
      'a $ref branch, kept as allOf',
      { anyOf: [{ $ref: '#/components/schemas/Other' }, { type: 'null' }] },
      { allOf: [{ $ref: '#/components/schemas/Other' }], nullable: true },
    ],
    [
      'several branches',
      { oneOf: [{ type: 'string' }, { type: 'integer' }, { type: 'null' }] },
      { oneOf: [{ type: 'string' }, { type: 'integer' }], nullable: true },
    ],
    [
      'a branch whose keyword collides with its parent, kept as allOf',
      { anyOf: [{ type: 'string', description: 'inner' }, { type: 'null' }], description: 'outer' },
      { allOf: [{ type: 'string', description: 'inner' }], description: 'outer', nullable: true },
    ],
  ])('turns a null branch of anyOf/oneOf with %s into nullable', (_label, schema, expected) => {
    expect(presentedField(schema)).toEqual(expected);
  });

  it('marks an enum that lists null as nullable', () => {
    expect(presentedField({ type: 'string', enum: ['A', null] })).toEqual({
      type: 'string',
      enum: ['A', null],
      nullable: true,
    });
  });

  it('drops only the `propertyNames` every JSON object key already satisfies, and keeps a real key rule', () => {
    expect(presentedField({ type: 'object', propertyNames: { type: 'string' }, additionalProperties: {} })).toEqual({
      type: 'object',
      additionalProperties: {},
    });
    // A key rule OpenAPI 3.0 cannot express is not silently dropped: the dialect gate names it instead.
    const rule = { type: 'object', propertyNames: { type: 'string', pattern: '^[A-Z]+$' }, additionalProperties: {} };
    expect(presentedField(rule)).toEqual(rule);
  });

  it('turns a numeric exclusive bound into the OpenAPI 3.0 boolean form', () => {
    expect(presentedField({ type: 'integer', exclusiveMinimum: 0, exclusiveMaximum: 10 })).toEqual({
      type: 'integer',
      minimum: 0,
      exclusiveMinimum: true,
      maximum: 10,
      exclusiveMaximum: true,
    });
  });

  it('keeps required and optional exactly as they were', () => {
    const required = toOpenApi30Presentation(inComponent({ type: ['string', 'null'] }, ['field']));
    const optional = toOpenApi30Presentation(inComponent({ type: ['string', 'null'] }));

    expect(required.components.schemas.Thing.required).toEqual(['field']);
    expect(optional.components.schemas.Thing.required).toEqual([]);
  });

  it('converts every schema position: inline request, response, parameter, header, items, map values and branches', () => {
    const nullable = { type: ['string', 'null'] };
    const presentedNullable = { type: 'string', nullable: true };
    const input = {
      openapi: '3.0.0',
      paths: {
        '/things': {
          post: {
            parameters: [{ name: 'q', in: 'query', schema: nullable }],
            requestBody: {
              content: { 'application/json': { schema: { type: 'object', properties: { a: nullable } } } },
            },
            responses: {
              '200': {
                description: 'ok',
                headers: { 'X-Next': { schema: nullable } },
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        list: { type: 'array', items: nullable },
                        map: { type: 'object', additionalProperties: nullable },
                        deep: { allOf: [{ type: 'object', properties: { leaf: { anyOf: [nullable] } } }] },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    const presented = toOpenApi30Presentation(input);
    const operation = presented.paths['/things'].post;
    const response = operation.responses['200'];
    const properties = response.content['application/json'].schema.properties;

    expect(operation.parameters[0].schema).toEqual(presentedNullable);
    expect(operation.requestBody.content['application/json'].schema.properties.a).toEqual(presentedNullable);
    expect(response.headers['X-Next'].schema).toEqual(presentedNullable);
    expect(properties.list.items).toEqual(presentedNullable);
    expect(properties.map.additionalProperties).toEqual(presentedNullable);
    expect(properties.deep.allOf[0].properties.leaf.anyOf[0]).toEqual(presentedNullable);
    expect(findOpenApi30Violations(presented)).toEqual([]);
  });

  it('never rewrites a type array or propertyNames inside an example, a default, an enum value or an extension', () => {
    const data = { type: ['string', 'null'], propertyNames: { type: 'string' }, exclusiveMinimum: 0 };
    const input = inComponent({ type: 'object', example: data, default: data, enum: [data], 'x-shape': data });

    expect(presentedField(input.components.schemas.Thing.properties.field)).toEqual({
      type: 'object',
      example: data,
      default: data,
      enum: [data],
      'x-shape': data,
    });
  });

  it('leaves its input untouched and gives the same result when applied twice', () => {
    const input = inComponent({
      anyOf: [{ type: ['string', 'null'] }, { oneOf: [{ $ref: '#/components/schemas/Other' }, { type: 'null' }] }],
      properties: { bag: { type: 'object', propertyNames: { type: 'string' }, additionalProperties: {} } },
      enum: ['A', null],
      exclusiveMinimum: 1,
    });
    const snapshot = JSON.stringify(input);

    const once = toOpenApi30Presentation(input);
    const twice = toOpenApi30Presentation(once);

    expect(JSON.stringify(input)).toBe(snapshot);
    expect(twice).toEqual(once);
  });

  it("matches Zod's own OpenAPI 3.0 rendering of the same schema (the runtime contract)", () => {
    const schema = z.strictObject({
      note: z.string().nullable(),
      code: z.string().min(1).nullable(),
      id: z.uuid().nullable(),
      owner: z.strictObject({ name: z.string() }).nullable(),
      bag: z.record(z.string(), z.unknown()).nullable(),
      labels: z.array(z.string().nullable()).max(5),
      either: z.union([z.string(), z.number()]),
      maybe: z.union([z.string(), z.number()]).nullable(),
      count: z.number().int().positive(),
      when: z.string().nullable().optional(),
    });
    // What nestjs-zod hands to the document (JSON Schema draft 2020-12), without the `$schema` it strips.
    const generated = { ...z.toJSONSchema(schema) } as Record<string, unknown>;
    delete generated.$schema;
    const withoutRedundantPatterns = (node: unknown): unknown => {
      if (Array.isArray(node)) return node.map(withoutRedundantPatterns);
      if (node === null || typeof node !== 'object') return node;
      const format = (node as { format?: unknown }).format;
      const kept = Object.entries(node).filter(
        ([key, value]) => key !== 'pattern' || !isRedundantFormatPattern(format, value),
      );
      return Object.fromEntries(kept.map(([key, value]) => [key, withoutRedundantPatterns(value)]));
    };

    expect(presentedField(generated)).toEqual(
      withoutRedundantPatterns(z.toJSONSchema(schema, { target: 'openapi-3.0' })),
    );
  });
});
