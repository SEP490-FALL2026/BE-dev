import { HttpStatus } from '@nestjs/common';
import { TransientDatabaseError } from '../../infrastructure/database/transaction-runner';
import { ApiException } from '../../infrastructure/http/errors/api.exception';
import { toLeaveApiException } from './leave/leave.http-errors';
import { toNoticeApiException } from './notice/notice.http-errors';
import { toOffboardingApiException } from './offboarding/offboarding.http-errors';
import { toTransferApiException } from './transfer/transfer.http-errors';
import { toTransferReviewApiException } from './transfer-review/transfer-review.http-errors';

const outage = () => new TransientDatabaseError('40001', new Error('connection reset'));

/**
 * A database that cannot answer behind the guard is 503 SERVICE_UNAVAILABLE on every guarded route (api-contract, the
 * shared GUARDED_SERVICE_UNAVAILABLE_RESPONSE), never a 500: each mapper of the personnel routes hands an outage to
 * `toUnavailableApiException` (26/10/2026). A defect stays a defect: anything else passes through unchanged.
 */
describe.each([
  ['long leaves', toLeaveApiException],
  ['personnel notices', toNoticeApiException],
  ['transfers', toTransferApiException],
  ['transfer reviews', toTransferReviewApiException],
  ['offboarding cases', toOffboardingApiException],
])('the mapper of %s', (_name, toApiException) => {
  it('answers a database outage with 503 SERVICE_UNAVAILABLE', () => {
    const mapped = toApiException(outage());

    expect(mapped).toBeInstanceOf(ApiException);
    expect((mapped as ApiException).getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect((mapped as ApiException).getResponse()).toEqual({
      code: 'SERVICE_UNAVAILABLE',
      message: 'The service is temporarily unavailable. Retry shortly.',
    });
  });

  it('lets an unexpected error through to the global filter', () => {
    const defect = new Error('a defect');

    expect(toApiException(defect)).toBe(defect);
  });
});
