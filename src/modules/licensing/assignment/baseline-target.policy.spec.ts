import type { SeatTarget } from '../../catalog/catalog.types';
import {
  SeatPlanNotSupportedError,
  SeatApplicationRetiredError,
  SeatQuantityUnknownError,
  SeatSubscriptionDraftError,
  SeatTargetInvalidError,
  SeatTargetNotFoundError,
} from '../licensing.errors';
import { assertBaselineTarget, assertSeatTargetUsable, toSeatTargetRef } from './baseline-target.policy';

const subscription = (over: Partial<SeatTarget> = {}): SeatTarget => ({
  kind: 'SUBSCRIPTION',
  subscriptionId: 's1',
  planId: 'p1',
  planName: 'Organization',
  applicationId: 'a1',
  applicationName: 'Figma',
  applicationKind: 'SAAS',
  provisioningType: 'K2',
  applicationStatus: 'APPROVED',
  status: 'ACTIVE',
  missing: [],
  purchasedQuantity: 100,
  ...over,
});
const internal: SeatTarget = subscription({
  kind: 'PLAN',
  subscriptionId: null,
  applicationKind: 'INTERNAL',
  applicationName: 'Cổng báo cáo nội bộ',
  provisioningType: 'K5',
  status: null,
  purchasedQuantity: null,
});

describe('toSeatTargetRef (a baseline is for one subscription or one internal plan)', () => {
  it('takes exactly one of the two', () => {
    expect(toSeatTargetRef({ subscriptionId: 's1' })).toEqual({ subscriptionId: 's1' });
    expect(toSeatTargetRef({ planId: 'p1' })).toEqual({ planId: 'p1' });
  });

  it('refuses neither and both', () => {
    expect(() => toSeatTargetRef({})).toThrow(SeatTargetInvalidError);
    expect(() => toSeatTargetRef({ subscriptionId: 's1', planId: 'p1' })).toThrow(SeatTargetInvalidError);
  });
});

describe('assertBaselineTarget (AC-11, AC-12, INV-01)', () => {
  it('lets a K1 or K2 subscription with its quantity known, and an internal K5 plan, through', () => {
    expect(() => assertBaselineTarget({ subscriptionId: 's1' }, subscription())).not.toThrow();
    expect(() =>
      assertBaselineTarget({ subscriptionId: 's1' }, subscription({ provisioningType: 'K1' })),
    ).not.toThrow();
    expect(() => assertBaselineTarget({ planId: 'p9' }, internal)).not.toThrow();
  });

  it('says which of the two does not exist', () => {
    expect.assertions(4);
    for (const [ref, kind] of [
      [{ subscriptionId: 'x' }, 'SUBSCRIPTION'],
      [{ planId: 'x' }, 'PLAN'],
    ] as const) {
      try {
        assertBaselineTarget(ref, null);
      } catch (error) {
        expect(error).toBeInstanceOf(SeatTargetNotFoundError);
        expect((error as SeatTargetNotFoundError).target).toBe(kind);
      }
    }
  });

  it('turns away a K4 plan, which needs the key vault and the company devices, and a K3 plan', () => {
    expect(() => assertBaselineTarget({ subscriptionId: 's1' }, subscription({ provisioningType: 'K4' }))).toThrow(
      SeatPlanNotSupportedError,
    );
    expect(() => assertBaselineTarget({ subscriptionId: 's1' }, subscription({ provisioningType: 'K3' }))).toThrow(
      SeatPlanNotSupportedError,
    );
  });

  it('turns away a paid plan named by itself: its seats are counted per subscription', () => {
    expect(() =>
      assertBaselineTarget(
        { planId: 'p1' },
        subscription({ kind: 'PLAN', subscriptionId: null, purchasedQuantity: null }),
      ),
    ).toThrow(SeatTargetInvalidError);
  });

  it('turns away a subscription that is still a draft, and says what it lacks (US-04-03 AC-6)', () => {
    const draft = subscription({ status: 'DRAFT', missing: ['START_DATE', 'UNIT_PRICE'] });

    expect(() => assertBaselineTarget({ subscriptionId: 's1' }, draft)).toThrow(
      new SeatSubscriptionDraftError(['START_DATE', 'UNIT_PRICE']),
    );
  });

  it('names the missing quantity of a draft rather than only its unknown seats', () => {
    const draft = subscription({ status: 'DRAFT', missing: ['QUANTITY'], purchasedQuantity: null });

    expect(() => assertBaselineTarget({ subscriptionId: 's1' }, draft)).toThrow(SeatSubscriptionDraftError);
  });

  it('turns away a subscription whose quantity is not known', () => {
    expect(() => assertBaselineTarget({ subscriptionId: 's1' }, subscription({ purchasedQuantity: null }))).toThrow(
      SeatQuantityUnknownError,
    );
  });
});

describe('assertSeatTargetUsable (a draft and a retired application take no seat, from a baseline or from a request)', () => {
  it('lets a complete subscription and a plan with no subscription through', () => {
    expect(() => assertSeatTargetUsable(subscription())).not.toThrow();
    expect(() => assertSeatTargetUsable(internal)).not.toThrow();
  });

  it('refuses a draft with what it lacks', () => {
    expect(() => assertSeatTargetUsable(subscription({ status: 'DRAFT', missing: ['BILLING_CYCLE'] }))).toThrow(
      new SeatSubscriptionDraftError(['BILLING_CYCLE']),
    );
  });

  it('refuses a seat under an application that is retired, even for a complete subscription or an internal plan', () => {
    expect(() => assertSeatTargetUsable(subscription({ applicationStatus: 'RETIRED' }))).toThrow(
      SeatApplicationRetiredError,
    );
    expect(() => assertSeatTargetUsable({ ...internal, applicationStatus: 'RETIRED' })).toThrow(
      SeatApplicationRetiredError,
    );
    expect(() =>
      assertBaselineTarget({ subscriptionId: 's1' }, subscription({ applicationStatus: 'RETIRED' })),
    ).toThrow(SeatApplicationRetiredError);
  });
});
