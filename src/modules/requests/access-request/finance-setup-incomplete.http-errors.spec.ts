import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { FinanceSetupIncompleteError } from '../../organization/organization.errors';
import { toGroupRequestApiException } from '../group-request/group-request.http-errors';
import { toRenewalApiException } from '../renewal-request/renewal-request.http-errors';
import { toServiceAccountApiException } from '../service-account-request/service-account-request.http-errors';
import { toAccessRequestApiException } from './access-request.http-errors';
import { toAssessmentApiException } from './assessment.http-errors';

/**
 * F01 (`QĐ-87d(1)`, spec L.11): a department may have no Cost Center yet, and whatever charges a cost to it answers 409
 * `FINANCE.SETUP_INCOMPLETE` with nothing written. Every request mapper falls back to `toAccessRequestApiException`, so
 * one mapping answers on every route that can throw it.
 */
describe('FINANCE.SETUP_INCOMPLETE on the request routes', () => {
  const error = new FinanceSetupIncompleteError('d-1');

  it.each([
    ['the request mapper', toAccessRequestApiException],
    ['the assessment mapper (proposals)', toAssessmentApiException],
    ['the group request mapper', toGroupRequestApiException],
    ['the renewal request mapper', toRenewalApiException],
    ['the service account request mapper', toServiceAccountApiException],
  ])('is answered 409 by %s, with no department id in the answer', (_name, map) => {
    const answer = map(error);

    expect(answer).toBeInstanceOf(ApiException);
    expect((answer as ApiException).getStatus()).toBe(HttpStatus.CONFLICT);
    expect((answer as ApiException).getResponse()).toMatchObject({ code: 'FINANCE.SETUP_INCOMPLETE' });
    expect(JSON.stringify((answer as ApiException).getResponse())).not.toContain('d-1');
  });
});
