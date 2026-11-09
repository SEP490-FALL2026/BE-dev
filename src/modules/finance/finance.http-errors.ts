import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../infrastructure/http/errors/api.exception';
import { toMoneyApiException } from '../../infrastructure/http/errors/money-errors';
import { toUnavailableApiException } from '../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../infrastructure/http/openapi-error-examples';
import { CurrencyNotSupportedError, RateOutOfRangeError, RateScaleExceededError } from '../../core/money/money.errors';

export function refuse(
  status: HttpStatus,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): ApiException {
  return new ApiException(status, { code, message, ...(details ? { details } : {}) });
}

/**
 * Maps the errors that every finance route can meet to their HTTP answers. Money and rate errors come from the shared mapper; a
 * database that cannot answer is a 503; anything else is returned unchanged for the global filter. The answers of the exchange-rate
 * errors are in `exchange-rate/exchange-rate.http-errors.ts`, which falls back to this one.
 */
export function toFinanceApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;

  const money = toMoneyApiException(error);
  if (money !== error) return money;

  return toUnavailableApiException(error) ?? error;
}

const example = (error: Error) => errorExampleOf(toFinanceApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime. */
export const FINANCE_ERROR_EXAMPLES = {
  CURRENCY_NOT_SUPPORTED: example(new CurrencyNotSupportedError('XYZ')),
  RATE_OUT_OF_RANGE: example(new RateOutOfRangeError()),
  RATE_SCALE_EXCEEDED: example(new RateScaleExceededError()),
} as const;
