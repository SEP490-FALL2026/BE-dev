import { applyDecorators, HttpStatus, Type } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ErrorEnvelopeDto } from '../dto/error-envelope.dto';

export function ApiErrorResponses(
  ...responses: Array<{
    status: HttpStatus;
    description?: string;
    type?: Type<unknown>;
  }>
): MethodDecorator {
  return applyDecorators(
    ...responses.map(({ status, description, type }) =>
      ApiResponse({ status, description, type: type ?? ErrorEnvelopeDto }),
    ),
  );
}
