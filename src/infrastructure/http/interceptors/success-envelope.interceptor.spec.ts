import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, of } from 'rxjs';
import { DEFAULT_SUCCESS_MESSAGE, SUCCESS_MESSAGE_METADATA } from '../decorators/api-success-response.decorator';
import { RAW_RESPONSE_METADATA } from '../decorators/raw-response.decorator';
import { SuccessEnvelopeInterceptor } from './success-envelope.interceptor';

/**
 * Uses a real Reflector over real metadata rather than a stubbed one. A stub would pass
 * even if the interceptor read the wrong key, which is the whole thing worth pinning here.
 */
function contextFor(metadata: Record<symbol, unknown> = {}): ExecutionContext {
  const handler = (): void => undefined;
  class ProbeController {}

  for (const key of Object.getOwnPropertySymbols(metadata)) {
    Reflect.defineMetadata(key, metadata[key], handler);
  }

  return {
    getHandler: () => handler,
    getClass: () => ProbeController,
  } as unknown as ExecutionContext;
}

function handlerReturning(value: unknown): CallHandler {
  return { handle: () => of(value) };
}

describe('SuccessEnvelopeInterceptor', () => {
  const interceptor = new SuccessEnvelopeInterceptor(new Reflector());

  it('wraps an ordinary payload with the default message', async () => {
    const result = await firstValueFrom(interceptor.intercept(contextFor(), handlerReturning({ id: 1 })));

    expect(result).toEqual({ success: true, message: DEFAULT_SUCCESS_MESSAGE, data: { id: 1 } });
  });

  it('uses the message a handler declares', async () => {
    const context = contextFor({ [SUCCESS_MESSAGE_METADATA]: 'CATALOG.APPLICATION_CREATED' });

    const result = await firstValueFrom(interceptor.intercept(context, handlerReturning({ id: 1 })));

    expect(result).toMatchObject({ message: 'CATALOG.APPLICATION_CREATED' });
  });

  it('represents an empty body as null rather than dropping the envelope', async () => {
    const result = await firstValueFrom(interceptor.intercept(contextFor(), handlerReturning(undefined)));

    expect(result).toEqual({ success: true, message: DEFAULT_SUCCESS_MESSAGE, data: null });
  });

  it('passes a raw response through untouched', async () => {
    const context = contextFor({ [RAW_RESPONSE_METADATA]: true });

    await expect(firstValueFrom(interceptor.intercept(context, handlerReturning('id,name\n1,figma')))).resolves.toBe(
      'id,name\n1,figma',
    );
  });

  it('does not turn a raw null into an envelope', async () => {
    const context = contextFor({ [RAW_RESPONSE_METADATA]: true });

    await expect(firstValueFrom(interceptor.intercept(context, handlerReturning(null)))).resolves.toBeNull();
  });
});
