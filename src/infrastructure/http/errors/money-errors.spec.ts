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

  it('answers a reporting currency outside the currency table with 409, naming it, never a 500 (DB-02)', () => {
    const mapped = toMoneyApiException(new ReportingCurrencyNotSupportedError('MYR')) as ApiException;

    expect(answerOf(new ReportingCurrencyNotSupportedError('MYR'))).toEqual({
      status: HttpStatus.CONFLICT,
      code: 'REPORTING_CURRENCY_NOT_SUPPORTED',
    });
    expect((mapped.getResponse() as { details: unknown }).details).toEqual({ currency: 'MYR' });
  });

  it('names the allowed decimals when the scale is exceeded, and the currency when it is unsupported', () => {
    const scale = toMoneyApiException(new MoneyScaleExceededError(0)) as ApiException;
    const currency = toMoneyApiException(new CurrencyNotSupportedError('XYZ')) as ApiException;

    expect((scale.getResponse() as { details: unknown }).details).toEqual({ allowedDecimals: 0 });
    expect((currency.getResponse() as { details: unknown }).details).toEqual({ currency: 'XYZ' });
  });

  describe('with the path of the money object in the body (B2)', () => {
    const detailsOf = (error: unknown): unknown => (toMoneyApiException(error) as ApiException).getResponse();
    const withPath = <T extends { path: string | null }>(error: T, path: string): T => {
      error.path = path;

      return error;
    };

    it('points a malformed text at its amount as an issue, the shape of every VALIDATION_ERROR', () => {
      const answer = detailsOf(withPath(new MoneyMalformedError(), 'unitPrice')) as Record<string, unknown>;

      expect(answer).toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { issues: [{ code: 'invalid_format', path: 'unitPrice.amount' }] },
      });
    });

    it('points a malformed text of a flat field at the field itself, not at an amount inside it (FIX-E-O1)', () => {
      const flat = withPath(new MoneyMalformedError(), 'netAmount');
      flat.flat = true;

      expect(detailsOf(flat)).toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { issues: [{ code: 'invalid_format', path: 'netAmount' }] },
      });
    });

    it('names the path of an amount out of range', () => {
      const answer = detailsOf(withPath(new MoneyOutOfRangeError(), 'lines.2.amount')) as Record<string, unknown>;

      expect(answer).toMatchObject({ code: 'MONEY_OUT_OF_RANGE', details: { path: 'lines.2.amount' } });
    });

    it('keeps allowedDecimals and adds the path when the scale is exceeded', () => {
      const answer = detailsOf(withPath(new MoneyScaleExceededError(0), 'requestedAmount')) as Record<string, unknown>;

      expect(answer).toMatchObject({
        code: 'MONEY_SCALE_EXCEEDED',
        details: { allowedDecimals: 0, path: 'requestedAmount' },
      });
    });

    it('keeps the currency and adds the path when the currency is unsupported', () => {
      const answer = detailsOf(withPath(new CurrencyNotSupportedError('XYZ'), 'originalPrice')) as Record<
        string,
        unknown
      >;

      expect(answer).toMatchObject({
        code: 'CURRENCY_NOT_SUPPORTED',
        details: { currency: 'XYZ', path: 'originalPrice' },
      });
    });

    it('keeps the status 422 for every money error that carries a path', () => {
      const errors = [
        withPath(new MoneyMalformedError(), 'a'),
        withPath(new MoneyOutOfRangeError(), 'a'),
        withPath(new MoneyScaleExceededError(2), 'a'),
        withPath(new CurrencyNotSupportedError('XYZ'), 'a'),
      ];

      for (const error of errors) {
        expect((toMoneyApiException(error) as ApiException).getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
      }
    });
  });

  describe('without a path (an internal call)', () => {
    const responseOf = (error: unknown): Record<string, unknown> =>
      (toMoneyApiException(error) as ApiException).getResponse() as Record<string, unknown>;

    it('answers a malformed text with no details, as before', () => {
      expect(responseOf(new MoneyMalformedError())).not.toHaveProperty('details');
    });

    it('answers an amount out of range with no details, as before', () => {
      expect(responseOf(new MoneyOutOfRangeError())).not.toHaveProperty('details');
    });

    it('answers a scale and a currency error with their old details only', () => {
      expect(responseOf(new MoneyScaleExceededError(2)).details).toEqual({ allowedDecimals: 2 });
      expect(responseOf(new CurrencyNotSupportedError('XYZ')).details).toEqual({ currency: 'XYZ' });
    });
  });

  it('returns anything else unchanged so the global filter reports it', () => {
    const other = new Error('boom');

    expect(toMoneyApiException(other)).toBe(other);
  });
});
