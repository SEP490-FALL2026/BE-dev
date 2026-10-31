import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map, Observable } from 'rxjs';
import { RAW_RESPONSE_METADATA } from '../decorators/raw-response.decorator';
import {
  DEFAULT_SUCCESS_MESSAGE,
  SUCCESS_MESSAGE_OVERRIDE,
  SUCCESS_MESSAGE_METADATA,
} from '../decorators/api-success-response.decorator';

@Injectable()
export class SuccessEnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const isRawResponse = this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isRawResponse) {
      return next.handle();
    }

    const message =
      this.reflector.getAllAndOverride<string>(SUCCESS_MESSAGE_METADATA, [context.getHandler(), context.getClass()]) ??
      DEFAULT_SUCCESS_MESSAGE;

    return next.handle().pipe(
      map((data: unknown) => ({
        success: true as const,
        message: this.chosenMessage(context) ?? message,
        data: data ?? null,
      })),
    );
  }

  /** The message a handler put on the request for this call (`SUCCESS_MESSAGE_OVERRIDE`), read once the handler has answered. */
  private chosenMessage(context: ExecutionContext): string | null {
    const request = context.switchToHttp?.().getRequest<Record<string, unknown> | undefined>();
    const chosen = request?.[SUCCESS_MESSAGE_OVERRIDE];

    return typeof chosen === 'string' ? chosen : null;
  }
}
