import { ArgumentMetadata, HttpStatus } from '@nestjs/common';
import { createZodValidationPipe } from 'nestjs-zod';
import { ZodError } from 'zod';
import { ApiException } from '../errors/api.exception';

/** The code and message of every request validation failure; `details.issues` lists what failed. */
export const VALIDATION_ERROR_BODY = Object.freeze({ code: 'VALIDATION_ERROR', message: 'Request validation failed.' });

const StrictZodValidationPipe = createZodValidationPipe({
  strictSchemaDeclaration: true,
  createValidationException: (error: unknown): ApiException => {
    const issues =
      error instanceof ZodError ? error.issues.map((issue) => ({ code: issue.code, path: issue.path.join('.') })) : [];

    return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, { ...VALIDATION_ERROR_BODY, details: { issues } });
  },
});

/**
 * Request bodies, params and queries must be declared with a Zod DTO (strict). Parameters
 * supplied by a custom decorator (`@CurrentPrincipal()`) are server-resolved values, not client
 * input, so they bypass validation. A custom decorator must therefore never return raw client
 * input; read that through a DTO.
 */
export class ApplicationZodValidationPipe extends StrictZodValidationPipe {
  override transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (metadata.type === 'custom') return value;

    return super.transform(value, metadata);
  }
}
