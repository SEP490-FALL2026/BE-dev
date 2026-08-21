import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * Route params need a declared schema like any other input: the global validation pipe runs
 * with `strictSchemaDeclaration`, so a primitive `@Param('id')` has no schema to validate
 * against and fails as a server error rather than a 422.
 *
 * Declaring it here also keeps the failure shape consistent — an invalid id produces the
 * same VALIDATION_ERROR envelope as an invalid body, instead of ParseUUIDPipe's 400.
 */
export const applicationIdParamSchema = z.strictObject({
  id: z.uuid(),
});

export class ApplicationIdParamDto extends createZodDto(applicationIdParamSchema) {}
