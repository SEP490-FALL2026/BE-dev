import { assertOpenApi30Dialect, findOpenApi30Violations, OpenApiDialectError } from './openapi-dialect';

/** A small document in the shape the exporter produces: every schema position the checker must visit. */
const document = () => ({
  openapi: '3.0.0',
  paths: {
    '/things/{id}': {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      patch: {
        parameters: [{ name: 'q', in: 'query', schema: { type: 'string', nullable: true } }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ThingBodyDto' } } },
        },
        responses: {
          '200': {
            description: 'ok',
            headers: { 'X-Flag': { schema: { type: 'boolean', enum: [true] } } },
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ThingResponseDto' },
                    { properties: { message: { example: 'THING.SAVED' } } },
                  ],
                },
                // Values, never schemas: a `type` array or `propertyNames` key in them is data.
                example: { type: ['string', 'null'], propertyNames: { type: 'string' } },
                examples: { one: { value: { type: ['a', 'b'] } } },
              },
            },
          },
        },
        'x-internal': { type: ['string', 'null'] },
      },
    },
  },
  components: {
    schemas: {
      ThingBodyDto: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 80 },
          note: { type: 'string', nullable: true },
          kind: { type: 'string', enum: ['A', 'B', null], nullable: true },
          ref: { allOf: [{ $ref: '#/components/schemas/Other' }], nullable: true },
          tags: { type: 'array', items: { type: 'string' }, maxItems: 5 },
          map: { type: 'object', additionalProperties: { type: 'integer', minimum: 0, exclusiveMinimum: true } },
          either: { anyOf: [{ type: 'string' }, { type: 'number' }] },
          withDefault: { type: 'object', default: { type: ['x', 'y'] } },
        },
        required: ['name'],
        additionalProperties: false,
      },
      ThingResponseDto: { type: 'object', properties: { success: { type: 'boolean', enum: [true] } } },
      Other: { type: 'object', additionalProperties: {} },
    },
    securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
  },
});

type Doc = ReturnType<typeof document>;
const withSchema = (mutate: (doc: Doc) => void): Doc => {
  const doc = document();
  mutate(doc);
  return doc;
};
const THING = '#/components/schemas/ThingBodyDto/properties';

describe('findOpenApi30Violations', () => {
  it('accepts a document that uses only OpenAPI 3.0 schema fields, whatever its examples, defaults or extensions hold', () => {
    expect(findOpenApi30Violations(document())).toEqual([]);
  });

  it.each([
    ['3.1.0', 'declared version 3.1.0 is not OpenAPI 3.0.x'],
    ['3.0', 'declared version 3.0 is not OpenAPI 3.0.x'],
    [undefined, 'declared version undefined is not OpenAPI 3.0.x'],
  ])('refuses the declared version %s', (version, reason) => {
    const doc = withSchema((d) => Object.assign(d, { openapi: version }));

    expect(findOpenApi30Violations(doc)).toEqual([{ pointer: '#/openapi', reason }]);
  });

  it('names the JSON pointer and the reason of a nullable type array (the Zod 4.6 shape)', () => {
    const doc = withSchema((d) =>
      Object.assign(d.components.schemas.ThingBodyDto.properties, { note: { type: ['string', 'null'] } }),
    );

    expect(findOpenApi30Violations(doc)).toEqual([
      {
        pointer: `${THING}/note/type`,
        reason: 'type must be one string in OpenAPI 3.0, found ["string","null"]',
      },
    ]);
  });

  it('names `propertyNames` and every other JSON Schema keyword OpenAPI 3.0 does not define', () => {
    const doc = withSchema((d) =>
      Object.assign(d.components.schemas.ThingBodyDto.properties, {
        map: { type: 'object', propertyNames: { type: 'string' }, additionalProperties: {} },
        tuple: { type: 'array', items: { type: 'string' }, prefixItems: [{ type: 'string' }] },
        fixed: { type: 'string', const: 'A' },
      }),
    );

    expect(findOpenApi30Violations(doc)).toEqual([
      { pointer: `${THING}/map/propertyNames`, reason: 'propertyNames is not an OpenAPI 3.0 schema field' },
      { pointer: `${THING}/tuple/prefixItems`, reason: 'prefixItems is not an OpenAPI 3.0 schema field' },
      { pointer: `${THING}/fixed/const`, reason: 'const is not an OpenAPI 3.0 schema field' },
    ]);
  });

  it.each([
    ['type null', { type: 'null' }, '/type', 'type "null" is not an OpenAPI 3.0 type'],
    [
      'a numeric exclusive bound',
      { type: 'number', exclusiveMinimum: 0 },
      '/exclusiveMinimum',
      'exclusiveMinimum must be a boolean in OpenAPI 3.0',
    ],
    ['an array without items', { type: 'array' }, '', 'an array schema must declare items in OpenAPI 3.0'],
    [
      'null in enum without nullable',
      { type: 'string', enum: ['A', null] },
      '/enum',
      'enum allows null but nullable is not true',
    ],
    [
      'siblings next to $ref',
      { $ref: '#/components/schemas/Other', nullable: true },
      '',
      'siblings of $ref are ignored in OpenAPI 3.0',
    ],
  ] as const)('names %s', (_label, schema, suffix, reason) => {
    const doc = withSchema((d) => Object.assign(d.components.schemas.ThingBodyDto.properties, { bad: schema }));

    expect(findOpenApi30Violations(doc)).toEqual([{ pointer: `${THING}/bad${suffix}`, reason }]);
  });

  it('allows a boolean schema only as additionalProperties', () => {
    const doc = withSchema((d) =>
      Object.assign(d.components.schemas.ThingBodyDto.properties, { open: { type: 'array', items: true } }),
    );

    expect(findOpenApi30Violations(doc)).toEqual([
      { pointer: `${THING}/open/items`, reason: 'a boolean schema is allowed only as additionalProperties' },
    ]);
  });

  it('visits inline request, response, parameter and header schemas and every nested subschema position', () => {
    const nullable = { type: ['string', 'null'] };
    const doc = withSchema((d) => {
      const operation = d.paths['/things/{id}'].patch;
      d.paths['/things/{id}'].parameters[0].schema = nullable as never;
      operation.parameters[0].schema = nullable as never;
      operation.requestBody.content['application/json'].schema = {
        type: 'object',
        properties: { inline: nullable },
      } as never;
      operation.responses['200'].headers['X-Flag'].schema = nullable as never;
      const props = d.components.schemas.ThingBodyDto.properties as Record<string, unknown>;
      props.tags = { type: 'array', items: nullable };
      props.map = { type: 'object', additionalProperties: nullable };
      props.either = { anyOf: [nullable], oneOf: [nullable], allOf: [nullable], not: nullable };
    });

    expect(findOpenApi30Violations(doc).map((violation) => violation.pointer)).toEqual([
      '#/paths/~1things~1{id}/parameters/0/schema/type',
      '#/paths/~1things~1{id}/patch/parameters/0/schema/type',
      '#/paths/~1things~1{id}/patch/requestBody/content/application~1json/schema/properties/inline/type',
      '#/paths/~1things~1{id}/patch/responses/200/headers/X-Flag/schema/type',
      `${THING}/tags/items/type`,
      `${THING}/map/additionalProperties/type`,
      `${THING}/either/anyOf/0/type`,
      `${THING}/either/oneOf/0/type`,
      `${THING}/either/allOf/0/type`,
      `${THING}/either/not/type`,
    ]);
  });

  it('never reads examples, defaults, enum values or extensions as schemas', () => {
    const doc = withSchema((d) => {
      const props = d.components.schemas.ThingBodyDto.properties as Record<string, unknown>;
      props.valued = { type: 'object', example: { const: 1 }, enum: [{ type: ['a'] }], 'x-note': { const: 1 } };
    });

    expect(findOpenApi30Violations(doc)).toEqual([]);
  });

  it('does not modify the document it checks', () => {
    const doc = withSchema((d) =>
      Object.assign(d.components.schemas.ThingBodyDto.properties, { note: { type: ['string', 'null'] } }),
    );
    const snapshot = JSON.stringify(doc);

    findOpenApi30Violations(doc);

    expect(JSON.stringify(doc)).toBe(snapshot);
  });
});

describe('assertOpenApi30Dialect', () => {
  it('passes a coherent OpenAPI 3.0 document', () => {
    expect(() => assertOpenApi30Dialect(document())).not.toThrow();
  });

  it('throws an OpenApiDialectError that carries every pointer and reason', () => {
    const doc = withSchema((d) => {
      Object.assign(d.components.schemas.ThingBodyDto.properties, {
        note: { type: ['string', 'null'] },
        map: { type: 'object', propertyNames: { type: 'string' }, additionalProperties: {} },
      });
    });

    let thrown: unknown;
    try {
      assertOpenApi30Dialect(doc);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(OpenApiDialectError);
    const error = thrown as OpenApiDialectError;
    expect(error.name).toBe('OpenApiDialectError');
    expect(error.violations.map((violation) => violation.pointer)).toEqual([
      `${THING}/note/type`,
      `${THING}/map/propertyNames`,
    ]);
    expect(error.message).toBe('2 OpenAPI 3.0 dialect violations');
  });
});
