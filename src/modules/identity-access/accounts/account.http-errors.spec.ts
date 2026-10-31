import { HttpStatus } from '@nestjs/common';
import { TransientDatabaseError } from '../../../infrastructure/database/transaction-runner';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toAccountApiException } from './account.http-errors';

function expectUnavailable(mapped: unknown): void {
  expect(mapped).toBeInstanceOf(ApiException);
  const exception = mapped as ApiException;
  expect(exception.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
  expect(exception.getResponse()).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
}

describe('toAccountApiException — database availability', () => {
  it('answers 503 for a transient error raised inside a transaction', () => {
    expectUnavailable(toAccountApiException(new TransientDatabaseError('57014', new Error('timeout'))));
  });

  // Reads outside TransactionRunner (list, get) surface the driver's own error.
  it.each(['Query read timeout', 'Connection terminated due to connection timeout'])(
    'answers 503 for the driver error "%s" from a read outside a transaction',
    (message) => {
      expectUnavailable(toAccountApiException(new Error(message)));
    },
  );

  it('leaves an unexpected error unchanged so the global filter reports it', () => {
    const error = new Error('column "nope" does not exist');
    expect(toAccountApiException(error)).toBe(error);
  });
});
