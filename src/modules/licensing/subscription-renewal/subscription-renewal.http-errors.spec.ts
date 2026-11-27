import type { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toRenewalApiException } from './subscription-renewal.http-errors';
import { RenewalError } from './subscription-renewal.errors';
import type { NotRenewableReason } from './record/renewal-record.policy';

describe('NOT_RENEWABLE message (F4)', () => {
  it('names every reason the policy can give, CANCELLED included', () => {
    const reasons: Record<NotRenewableReason, true> = {
      PERPETUAL: true,
      INTERNAL: true,
      NOT_POOL_TERM: true,
      NOT_ACTIVE: true,
      ALREADY_CONTINUED: true,
      CANCELLED: true,
      MEMBER_COUNTED: true,
    };
    const exception = toRenewalApiException(new RenewalError('NOT_RENEWABLE', { reason: 'CANCELLED' })) as ApiException;
    const message = (exception.getResponse() as { message: string }).message;

    for (const reason of Object.keys(reasons)) expect(message).toContain(reason);
  });

  it('maps NOT_RESPONSIBLE to 403 SUBSCRIPTION_RENEWAL.NOT_RESPONSIBLE', () => {
    const exception = toRenewalApiException(new RenewalError('NOT_RESPONSIBLE')) as ApiException;

    expect(exception.getStatus()).toBe(403);
    expect(exception.getResponse()).toMatchObject({ code: 'SUBSCRIPTION_RENEWAL.NOT_RESPONSIBLE' });
  });

  it.each(['LINE_QUANTITY_NOT_TARGET', 'REDUCTION_AFTER_DEADLINE', 'LINES_REQUIRED'] as const)(
    'maps %s to 422 SUBSCRIPTION_RENEWAL.%s',
    (problem) => {
      const exception = toRenewalApiException(new RenewalError(problem, { lines: [] })) as ApiException;
      expect(exception.getStatus()).toBe(422);
      expect(exception.getResponse()).toMatchObject({ code: `SUBSCRIPTION_RENEWAL.${problem}` });
    },
  );
});
