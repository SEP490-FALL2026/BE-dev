import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toMoneyApiException } from '../../../infrastructure/http/errors/money-errors';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import {
  CurrencyNotSupportedError,
  RateOutOfRangeError,
  RateScaleExceededError,
} from '../../../core/money/money.errors';
import {
  ExchangeRateAlreadyRecordedError,
  ExchangeRateDateInFutureError,
  ExchangeRateDateTooOldError,
  ExchangeRateSameAsReportingCurrencyError,
} from '../exchange-rate/exchange-rate.errors';

function refuse(status: HttpStatus, code: string, message: string, details?: Record<string, unknown>): ApiException {
  return new ApiException(status, { code, message, ...(details ? { details } : {}) });
}

/**
 * Maps the errors of the finance routes to their HTTP answers. Money and rate errors come from the shared mapper; a
 * database that cannot answer is a 503; anything else is returned unchanged for the global filter.
 */
export function toFinanceApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (error instanceof ExchangeRateAlreadyRecordedError) {
    return refuse(HttpStatus.CONFLICT, 'EXCHANGE_RATE.ALREADY_RECORDED', error.message);
  }
  if (error instanceof ExchangeRateSameAsReportingCurrencyError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'EXCHANGE_RATE.SAME_AS_REPORTING_CURRENCY', error.message, {
      currency: error.currency,
    });
  }
  if (error instanceof ExchangeRateDateInFutureError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'EXCHANGE_RATE.DATE_IN_FUTURE', error.message);
  }
  if (error instanceof ExchangeRateDateTooOldError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'EXCHANGE_RATE.DATE_TOO_OLD', error.message);
  }

  const money = toMoneyApiException(error);
  if (money !== error) return money;

  return toUnavailableApiException(error) ?? error;
}

const example = (error: Error) => errorExampleOf(toFinanceApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). */
export const FINANCE_ERROR_EXAMPLES = {
  EXCHANGE_RATE_ALREADY_RECORDED: example(new ExchangeRateAlreadyRecordedError()),
  EXCHANGE_RATE_SAME_AS_REPORTING_CURRENCY: example(new ExchangeRateSameAsReportingCurrencyError('XYZ')),
  EXCHANGE_RATE_DATE_IN_FUTURE: example(new ExchangeRateDateInFutureError()),
  EXCHANGE_RATE_DATE_TOO_OLD: example(new ExchangeRateDateTooOldError()),
  CURRENCY_NOT_SUPPORTED: example(new CurrencyNotSupportedError('XYZ')),
  RATE_OUT_OF_RANGE: example(new RateOutOfRangeError()),
  RATE_SCALE_EXCEEDED: example(new RateScaleExceededError()),
} as const;
