import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ZodSerializerInterceptor } from 'nestjs-zod';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { SuccessEnvelopeInterceptor } from './interceptors/success-envelope.interceptor';
import { ApplicationZodValidationPipe } from './pipes/zod-validation.pipe';

@Module({
  providers: [
    { provide: APP_PIPE, useClass: ApplicationZodValidationPipe },
    // Response flow is reversed: envelope first, then Zod validates the wire DTO.
    { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
    { provide: APP_INTERCEPTOR, useClass: SuccessEnvelopeInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class HttpInfrastructureModule {}
