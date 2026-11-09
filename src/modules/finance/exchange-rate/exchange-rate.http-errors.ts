import { HttpStatus } from '@nestjs/common';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { refuse, toFinanceApiException } from '../finance.http-errors';
import {
  ExchangeRateAlreadyRecordedError,
  ExchangeRateDateInFutureError,
  ExchangeRateDateTooOldError,
  ExchangeRateSameAsReportingCurrencyError,
} from './exchange-rate.errors';

/**
 * Maps the errors of the exchange-rate routes to their HTTP answers; every other error goes to the mapper of the module
 * (`toFinanceApiException`: money and rate errors, a database that cannot answer, the rest unchanged).
 */
export function toExchangeRateApiException(error: unknown): unknown {
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

  return toFinanceApiException(error);
}

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime. */
export const EXCHANGE_RATE_ERROR_EXAMPLES = {
  EXCHANGE_RATE_ALREADY_RECORDED: errorExampleOf(toExchangeRateApiException(new ExchangeRateAlreadyRecordedError())),
  EXCHANGE_RATE_SAME_AS_REPORTING_CURRENCY: errorExampleOf(
    toExchangeRateApiException(new ExchangeRateSameAsReportingCurrencyError('XYZ')),
  ),
  EXCHANGE_RATE_DATE_IN_FUTURE: errorExampleOf(toExchangeRateApiException(new ExchangeRateDateInFutureError())),
  EXCHANGE_RATE_DATE_TOO_OLD: errorExampleOf(toExchangeRateApiException(new ExchangeRateDateTooOldError())),
} as const;
