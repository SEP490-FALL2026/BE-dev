import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toMoneyApiException } from '../../../infrastructure/http/errors/money-errors';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
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
