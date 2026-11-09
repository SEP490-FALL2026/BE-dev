import { HttpStatus } from '@nestjs/common';
import { TransientDatabaseError } from '../../database/transaction-runner';
import { ObjectStorageUnavailableError } from '../../object-storage/object-storage.errors';
import { toUnavailableApiException } from './service-unavailable';

describe('which failures are an outage (503) and which are not', () => {
  it.each([
    ['a transient database error', new TransientDatabaseError('40001', new Error('connection reset'))],
    ['an object storage outage', new ObjectStorageUnavailableError()],
  ])('answers %s with 503 SERVICE_UNAVAILABLE and a message that gives nothing away', (_label, error) => {
    const exception = toUnavailableApiException(error);

    expect(exception?.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(exception?.getResponse()).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      message: 'The service is temporarily unavailable. Retry shortly.',
    });
  });

  it('leaves a defect to be an internal error: an ordinary error and a value that is not an error are not outages', () => {
    expect(toUnavailableApiException(new Error('a bug'))).toBeUndefined();
    expect(toUnavailableApiException('boom')).toBeUndefined();
    expect(toUnavailableApiException(undefined)).toBeUndefined();
  });
});
