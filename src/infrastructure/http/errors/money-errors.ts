import { HttpStatus } from '@nestjs/common';
import {
  CurrencyNotSupportedError,
  MoneyMalformedError,
  MoneyOutOfRangeError,
  MoneyScaleExceededError,
  RateMalformedError,
  RateOutOfRangeError,
  RateScaleExceededError,
  ReportingCurrencyNotSupportedError,
} from '../../../core/money/money.errors';
import { ApiException } from './api.exception';

const unprocessable = (code: string, message: string, details?: Record<string, unknown>): ApiException =>
  new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, { code, message, ...(details ? { details } : {}) });

/**
 * The 422 answers for the money and rate errors of `src/core/money` (ADR-0007), shared by every route that takes an
 * amount or a rate. A malformed text is the ordinary `VALIDATION_ERROR`; anything that is not a money error is
 * returned unchanged so the caller's own mapping, or the global filter, deals with it.
 */
export function toMoneyApiException(error: unknown): unknown {
  if (error instanceof MoneyMalformedError || error instanceof RateMalformedError) {
    return unprocessable('VALIDATION_ERROR', error.message);
  }
  if (error instanceof MoneyScaleExceededError) {
    return unprocessable('MONEY_SCALE_EXCEEDED', error.message, { allowedDecimals: error.allowedDecimals });
  }
  if (error instanceof MoneyOutOfRangeError) return unprocessable('MONEY_OUT_OF_RANGE', error.message);
  if (error instanceof CurrencyNotSupportedError) {
    return unprocessable('CURRENCY_NOT_SUPPORTED', error.message, { currency: error.currency });
  }
  if (error instanceof ReportingCurrencyNotSupportedError) {
    return new ApiException(HttpStatus.CONFLICT, {
      code: 'REPORTING_CURRENCY_NOT_SUPPORTED',
      message: error.message,
      details: { currency: error.currency },
    });
  }
  if (error instanceof RateScaleExceededError) return unprocessable('RATE_SCALE_EXCEEDED', error.message);
  if (error instanceof RateOutOfRangeError) return unprocessable('RATE_OUT_OF_RANGE', error.message);

  return error;
}
