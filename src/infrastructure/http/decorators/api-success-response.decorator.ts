import { applyDecorators, HttpCode, HttpStatus, SetMetadata, Type } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ZodSerializerDto } from 'nestjs-zod';

export const DEFAULT_SUCCESS_MESSAGE = 'COMMON.SUCCESS';
export const SUCCESS_MESSAGE_METADATA = Symbol('SUCCESS_MESSAGE_METADATA');

export function ApiSuccessResponse(
  responseDto: Type<unknown>,
  options: {
    message?: string;
    description?: string;
    status?: HttpStatus;
  } = {},
): MethodDecorator {
  const status = options.status ?? HttpStatus.OK;
  return applyDecorators(
    SetMetadata(SUCCESS_MESSAGE_METADATA, options.message ?? DEFAULT_SUCCESS_MESSAGE),
    ZodSerializerDto(responseDto as never),
    HttpCode(status),
    ApiResponse({
      status,
      type: responseDto,
      description: options.description,
    }),
  );
}
