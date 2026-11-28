import { ApiException } from '../../../../infrastructure/http/errors/api.exception';
import { SubscriptionPlanHasNoSubscriptionError } from '../subscription.errors';
import { toSubscriptionApiException } from '../subscription.http-errors';
import { assertSubscriptionShape } from '../subscription.policy';

const perpetualOfK4 = {
  kind: 'PERPETUAL' as const,
  applicationKind: 'LICENSED' as const,
  planProvisioningType: 'K4' as const,
  startDate: '2026-03-15' as string | null,
  endDate: null as string | null,
  renewalDate: null as string | null,
  noticeDeadline: null as string | null,
  noticePeriodDays: null as number | null,
  billingCycle: null as string | null,
  autoRenew: false,
  allowsMidTermReduction: false,
};

describe('assertSubscriptionShape and the binding of a K4 plan', () => {
  it('gives a plan bundled with the machine no subscription, as a K5 plan has none (nothing is bought for it)', () => {
    try {
      assertSubscriptionShape({ ...perpetualOfK4, planKeyBinding: 'DEVICE_BUNDLED' });
      throw new Error('Expected SUBSCRIPTION.PLAN_HAS_NO_SUBSCRIPTION');
    } catch (error) {
      expect(error).toBeInstanceOf(SubscriptionPlanHasNoSubscriptionError);
      const mapped = toSubscriptionApiException(error);
      expect(mapped).toBeInstanceOf(ApiException);
      expect((mapped as ApiException).getResponse()).toMatchObject({ code: 'SUBSCRIPTION.PLAN_HAS_NO_SUBSCRIPTION' });
    }
  });

  it.each(['ACCOUNT', 'DEVICE_KEY', null, undefined] as const)(
    'lets a perpetual purchase of a K4 plan bound %s through',
    (binding) => {
      expect(() => assertSubscriptionShape({ ...perpetualOfK4, planKeyBinding: binding })).not.toThrow();
    },
  );
});
