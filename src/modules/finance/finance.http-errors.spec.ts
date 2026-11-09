import { HttpStatus } from '@nestjs/common';
import { MoneyScaleExceededError } from '../../core/money/money.errors';
import { ApiException } from '../../infrastructure/http/errors/api.exception';
import { toFinanceApiException } from './finance.http-errors';

function answerOf(error: unknown): { status: number; code: string } {
  const mapped = toFinanceApiException(error);
  expect(mapped).toBeInstanceOf(ApiException);
  const exception = mapped as ApiException;

  return { status: exception.getStatus(), code: (exception.getResponse() as { code: string }).code };
}

describe('toFinanceApiException', () => {
  it.each([[new MoneyScaleExceededError(2), HttpStatus.UNPROCESSABLE_ENTITY, 'MONEY_SCALE_EXCEEDED']])(
    'answers %p with its own status and code',
    (error, status, code) => {
      expect(answerOf(error)).toEqual({ status, code });
    },
  );

  it('returns an error it does not know unchanged', () => {
    const other = new Error('boom');

    expect(toFinanceApiException(other)).toBe(other);
  });
});
