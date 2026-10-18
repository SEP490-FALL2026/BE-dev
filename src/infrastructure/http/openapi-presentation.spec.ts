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
