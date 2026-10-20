import { z } from 'zod';
import { toOpenApi30Presentation } from './openapi-presentation';

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
