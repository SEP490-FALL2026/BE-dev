import { createZodDto as createNestjsZodDto, type ZodDto } from 'nestjs-zod';

type DtoSchema = Parameters<typeof createNestjsZodDto>[0];
/** A DTO class as Swagger reads it; the factory reads the class it is called on (`this`). */
interface OpenApiMetadataSource {
  _OPENAPI_METADATA_FACTORY: (this: unknown) => unknown;
}

const METADATA_FACTORY = '_OPENAPI_METADATA_FACTORY';
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * The application's DTO factory: nestjs-zod's `createZodDto`, unchanged at runtime (same schema, validation,
 * serialization and `Output` variant), with one correction to what @nestjs/swagger reads (OPENAPI-EXAMPLE.1-F3).
 *
 * Since Zod 4.6 a bare union of types — a refined or plain `string().nullable()` — is emitted as `type: ["string",
 * "null"]`. nestjs-zod passes each top-level property's `type` to Swagger as it is, and Swagger reads a `type` array as
 * its own "array of" shorthand: the property was documented as `string[]` and its null dropped. Here each such property
 * gets back the `anyOf` of single types it stands for (the form Zod < 4.6 emitted), which nestjs-zod and the 3.0
 * presentation already spell as one type plus `nullable`. Nested schemas reach the document untouched and are handled by
 * `toOpenApi30Presentation`. Every application DTO is built here (the boundary test in zod-dto.spec.ts).
 */
export function createZodDto<TSchema extends DtoSchema, TCodec extends boolean = false>(
  schema: TSchema,
  options?: { codec: TCodec },
): ZodDto<TSchema, TCodec> {
  const dto = createNestjsZodDto(schema, options);
  withSwaggerReadableTypes(dto);

  const output = Object.getOwnPropertyDescriptor(dto, 'Output');
  if (output?.get) {
    Object.defineProperty(dto, 'Output', {
      configurable: true,
      enumerable: output.enumerable,
      get(this: unknown) {
        return withSwaggerReadableTypes(output.get?.call(this) as OpenApiMetadataSource);
      },
    });
  }
  return dto;
}

/**
 * Replaces the metadata factory on the class nestjs-zod returned — never on a subclass: Swagger calls the factory of
 * every class up the prototype chain and keeps the first value of each key, so a parent left as it was would add its
 * array reading back.
 */
function withSwaggerReadableTypes<T extends OpenApiMetadataSource>(dto: T): T {
  const factory = dto._OPENAPI_METADATA_FACTORY;
  Object.defineProperty(dto, METADATA_FACTORY, {
    configurable: true,
    writable: true,
    value: function readableMetadata(this: unknown) {
      return withTypeArraysExpanded(factory.call(this));
    },
  });
  return dto;
}

/** Each top-level property whose `type` is an array, as the `anyOf` of single types the array stands for. */
function withTypeArraysExpanded(metadata: unknown): unknown {
  if (!isRecord(metadata)) return metadata;
  return Object.fromEntries(
    Object.entries(metadata).map(([name, property]) => {
      // Zod writes a type array only in place of such an anyOf, so none stands beside it; if one ever did, the property
      // is left as it is and the OpenAPI semantic gate (openapi-dialect.e2e-spec.ts) names it.
      if (!isRecord(property) || !Array.isArray(property.type) || 'anyOf' in property) return [name, property];
      const types = property.type as unknown[];
      return [name, { ...property, type: '', anyOf: types.map((type) => ({ type })) }];
    }),
  );
}
