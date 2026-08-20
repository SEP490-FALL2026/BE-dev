import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map, Observable } from 'rxjs';
import { DEFAULT_SUCCESS_MESSAGE, SUCCESS_MESSAGE_METADATA } from '../decorators/api-success-response.decorator';
import { SuccessEnvelope } from '../dto/success-envelope.dto';

@Injectable()
export class SuccessEnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<SuccessEnvelope<unknown>> {
    const message =
      this.reflector.getAllAndOverride<string>(SUCCESS_MESSAGE_METADATA, [context.getHandler(), context.getClass()]) ??
      DEFAULT_SUCCESS_MESSAGE;

    return next.handle().pipe(
      map((data: unknown) => ({
        success: true as const,
        message,
        data: data ?? null,
      })),
    );
  }
}
