import { HttpStatus } from '@nestjs/common';
import { createZodValidationPipe } from 'nestjs-zod';
import { ZodError } from 'zod';
import { ApiException } from '../errors/api.exception';

export const ApplicationZodValidationPipe = createZodValidationPipe({
  strictSchemaDeclaration: true,
  createValidationException: (error: unknown): ApiException => {
    const issues =
      error instanceof ZodError ? error.issues.map((issue) => ({ code: issue.code, path: issue.path.join('.') })) : [];

    return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, {
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed.',
      details: { issues },
    });
  },
});
