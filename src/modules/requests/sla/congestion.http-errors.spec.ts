import { HttpStatus } from '@nestjs/common';
import { TransientDatabaseError } from '../../../infrastructure/database/transaction-runner';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { CongestionHolderNotFoundError } from './congestion.errors';
import { toCongestionApiException } from './congestion.http-errors';

/** The board of the Super Admin answers a database outage with 503 like every guarded route (Prompt 02, 26/10/2026). */
describe('toCongestionApiException', () => {
  it('answers a database outage with 503 SERVICE_UNAVAILABLE', () => {
    const mapped = toCongestionApiException(new TransientDatabaseError('40001', new Error('connection reset')));

    expect(mapped).toBeInstanceOf(ApiException);
    expect((mapped as ApiException).getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect((mapped as ApiException).getResponse()).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });

  it('keeps the 404 of a holder that does not exist and lets a defect through', () => {
    const notFound = toCongestionApiException(new CongestionHolderNotFoundError());
    const defect = new Error('a defect');

    expect((notFound as ApiException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(toCongestionApiException(defect)).toBe(defect);
  });
});
