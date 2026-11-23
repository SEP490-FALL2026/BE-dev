import {
  SubscriptionMidTermReductionNotAllowedError,
  SubscriptionQuantityReasonRequiredError,
  SubscriptionVersionRequiredError,
} from '../subscription.errors';
import { assertVersionForQuantityChange, judgeQuantityChange } from '../subscription.policy';

describe('assertVersionForQuantityChange', () => {
  it('allows omitting expectedUpdatedAt when purchasedQuantity is not sent', () => {
    expect(() => assertVersionForQuantityChange(undefined, undefined)).not.toThrow();
    expect(() => assertVersionForQuantityChange(undefined, new Date('2026-01-01T00:00:00.000Z'))).not.toThrow();
  });

  it('allows sending purchasedQuantity when expectedUpdatedAt is provided', () => {
    expect(() => assertVersionForQuantityChange(5, new Date('2026-01-01T00:00:00.000Z'))).not.toThrow();
  });

  it('refuses sending purchasedQuantity without expectedUpdatedAt', () => {
    expect(() => assertVersionForQuantityChange(5, undefined)).toThrow(SubscriptionVersionRequiredError);
    expect(() => assertVersionForQuantityChange(0, undefined)).toThrow(SubscriptionVersionRequiredError);
  });
});

describe('judgeQuantityChange', () => {
  const base = {
    status: 'ACTIVE' as const,
    planProvisioningType: 'K2' as const,
    currentQuantity: 10,
    commitmentTermMonths: 12 as const,
    allowsMidTermReduction: false,
  };

  it('blocks reducing a 12-month active K2 subscription when mid-term reduction is off', () => {
    expect(() => judgeQuantityChange({ ...base, requestedQuantity: 8, quantityChangeReason: undefined })).toThrow(
      SubscriptionMidTermReductionNotAllowedError,
    );
  });

  it('allows reducing an active K2 subscription when mid-term reduction is on or commitment is 1 month', () => {
    expect(
      judgeQuantityChange({
        ...base,
        allowsMidTermReduction: true,
        requestedQuantity: 8,
        quantityChangeReason: undefined,
      }),
    ).toBeUndefined();
    expect(
      judgeQuantityChange({
        ...base,
        commitmentTermMonths: 1,
        requestedQuantity: 8,
        quantityChangeReason: undefined,
      }),
    ).toBeUndefined();
  });

  it('requires quantityChangeReason when increasing an active K2 subscription and returns it', () => {
    expect(() => judgeQuantityChange({ ...base, requestedQuantity: 12, quantityChangeReason: undefined })).toThrow(
      SubscriptionQuantityReasonRequiredError,
    );
    expect(judgeQuantityChange({ ...base, requestedQuantity: 12, quantityChangeReason: 'New team members' })).toBe(
      'New team members',
    );
  });

  it('ignores quantityChangeReason when quantity is unchanged, reduced, or omitted', () => {
    expect(judgeQuantityChange({ ...base, requestedQuantity: 10, quantityChangeReason: 'Ignored' })).toBeUndefined();
    expect(
      judgeQuantityChange({
        ...base,
        allowsMidTermReduction: true,
        requestedQuantity: 8,
        quantityChangeReason: 'Ignored',
      }),
    ).toBeUndefined();
    expect(
      judgeQuantityChange({ ...base, requestedQuantity: undefined, quantityChangeReason: 'Ignored' }),
    ).toBeUndefined();
  });

  it('does not apply to DRAFT, K1, or K4 subscriptions across combinations', () => {
    const nonApplicable = [
      { status: 'DRAFT' as const, planProvisioningType: 'K2' as const },
      { status: 'ACTIVE' as const, planProvisioningType: 'K1' as const },
      { status: 'ACTIVE' as const, planProvisioningType: 'K4' as const },
    ];
    for (const variant of nonApplicable) {
      for (const requestedQuantity of [8, 10, 12]) {
        expect(
          judgeQuantityChange({
            ...base,
            ...variant,
            requestedQuantity,
            quantityChangeReason: 'Optional',
          }),
        ).toBeUndefined();
      }
    }
  });
});
