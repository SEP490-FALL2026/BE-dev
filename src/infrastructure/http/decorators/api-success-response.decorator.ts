import { applyDecorators, HttpCode, HttpStatus, SetMetadata, Type } from '@nestjs/common';
import { ApiResponse, type ApiResponseOptions } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';
import { SUCCESS_MESSAGE_EXTENSION } from '../openapi-success-examples';

export const DEFAULT_SUCCESS_MESSAGE = 'COMMON.SUCCESS';
export const SUCCESS_MESSAGE_METADATA = Symbol('SUCCESS_MESSAGE_METADATA');
/**
 * The property of the request where a handler whose success message depends on what it did (one route that sends any of several kinds
 * of request, and answers as the route that sends that kind does) puts the one message the envelope carries. The message the route
 * declares stays the one the OpenAPI document shows; this only replaces it on the wire for that call.
 */
export const SUCCESS_MESSAGE_OVERRIDE = 'successMessage';

/**
 * The success envelope of a route. The one resolved `message` is both what the interceptor answers with and the
 * example the OpenAPI document shows (OPENAPI-EXAMPLE.1): it travels on the response as an internal extension that
 * `withSuccessMessageExamples` turns into an `allOf` overlay on the DTO reference, so `success` and `data` stay described
 * by the DTO itself and the DTO is registered exactly as before.
 */
export function ApiSuccessResponse(
  responseDto: Type<unknown>,
  options: {
    message?: string;
    description?: string;
    status?: HttpStatus;
  } = {},
): MethodDecorator {
  const status = options.status ?? HttpStatus.OK;
  const message = options.message ?? DEFAULT_SUCCESS_MESSAGE;
  const response = {
    status,
    type: responseDto,
    description: options.description,
    [SUCCESS_MESSAGE_EXTENSION]: message,
  } as ApiResponseOptions;
  return applyDecorators(
    SetMetadata(SUCCESS_MESSAGE_METADATA, message),
    ZodSerializerDto(responseDto as never),
    HttpCode(status),
    ApiResponse(response),
  );
}
