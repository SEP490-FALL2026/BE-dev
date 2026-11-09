import { HttpStatus } from '@nestjs/common';
import { MoneyScaleExceededError } from '../../../core/money/money.errors';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import {
  ExchangeRateAlreadyRecordedError,
  ExchangeRateDateInFutureError,
  ExchangeRateDateTooOldError,
  ExchangeRateSameAsReportingCurrencyError,
} from './exchange-rate.errors';
import { toExchangeRateApiException } from './exchange-rate.http-errors';

function answerOf(error: unknown): { status: number; code: string } {
  const mapped = toExchangeRateApiException(error);
  expect(mapped).toBeInstanceOf(ApiException);
  const exception = mapped as ApiException;

  return { status: exception.getStatus(), code: (exception.getResponse() as { code: string }).code };
}

describe('toExchangeRateApiException', () => {
  it.each([
    [new ExchangeRateAlreadyRecordedError(), HttpStatus.CONFLICT, 'EXCHANGE_RATE.ALREADY_RECORDED'],
    [
      new ExchangeRateSameAsReportingCurrencyError('VND'),
      HttpStatus.UNPROCESSABLE_ENTITY,
      'EXCHANGE_RATE.SAME_AS_REPORTING_CURRENCY',
    ],
    [new ExchangeRateDateInFutureError(), HttpStatus.UNPROCESSABLE_ENTITY, 'EXCHANGE_RATE.DATE_IN_FUTURE'],
    [new ExchangeRateDateTooOldError(), HttpStatus.UNPROCESSABLE_ENTITY, 'EXCHANGE_RATE.DATE_TOO_OLD'],
    [new MoneyScaleExceededError(2), HttpStatus.UNPROCESSABLE_ENTITY, 'MONEY_SCALE_EXCEEDED'],
  ])('answers %p with its own status and code', (error, status, code) => {
    expect(answerOf(error)).toEqual({ status, code });
  });

  it('returns an error it does not know unchanged', () => {
    const other = new Error('boom');

    expect(toExchangeRateApiException(other)).toBe(other);
  });
});
