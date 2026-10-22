import { HttpStatus } from '@nestjs/common';
import {
  CurrencyNotSupportedError,
  MoneyMalformedError,
  MoneyOutOfRangeError,
  MoneyScaleExceededError,
  RateMalformedError,
  RateOutOfRangeError,
  RateScaleExceededError,
} from '../../../core/money/money.errors';
import { ApiException } from './api.exception';
import { toMoneyApiException } from './money-errors';

function answerOf(error: unknown): { status: number; code: string } {
  const mapped = toMoneyApiException(error);
  expect(mapped).toBeInstanceOf(ApiException);
  const exception = mapped as ApiException;

  return { status: exception.getStatus(), code: (exception.getResponse() as { code: string }).code };
}

describe('toMoneyApiException', () => {
  it.each([
    [new MoneyMalformedError(), 'VALIDATION_ERROR'],
    [new MoneyScaleExceededError(2), 'MONEY_SCALE_EXCEEDED'],
    [new MoneyOutOfRangeError(), 'MONEY_OUT_OF_RANGE'],
    [new CurrencyNotSupportedError('XYZ'), 'CURRENCY_NOT_SUPPORTED'],
    [new RateMalformedError(), 'VALIDATION_ERROR'],
    [new RateScaleExceededError(), 'RATE_SCALE_EXCEEDED'],
    [new RateOutOfRangeError(), 'RATE_OUT_OF_RANGE'],
  ])('answers %p with 422 and a stable code', (error, code) => {
    expect(answerOf(error)).toEqual({ status: HttpStatus.UNPROCESSABLE_ENTITY, code });
  });

  it('names the allowed decimals when the scale is exceeded, and the currency when it is unsupported', () => {
    const scale = toMoneyApiException(new MoneyScaleExceededError(0)) as ApiException;
    const currency = toMoneyApiException(new CurrencyNotSupportedError('XYZ')) as ApiException;

    expect((scale.getResponse() as { details: unknown }).details).toEqual({ allowedDecimals: 0 });
    expect((currency.getResponse() as { details: unknown }).details).toEqual({ currency: 'XYZ' });
  });

  it('returns anything else unchanged so the global filter reports it', () => {
    const other = new Error('boom');

    expect(toMoneyApiException(other)).toBe(other);
  });
});
