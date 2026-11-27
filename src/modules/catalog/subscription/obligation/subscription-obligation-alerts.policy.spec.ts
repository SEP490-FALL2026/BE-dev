import { hasAdjustmentPoint } from './subscription-obligation.policy';

describe('hasAdjustmentPoint (F5)', () => {
  it('is only a subscription of a shared-pool workspace plan (K2) of licensed or SaaS software with fixed seat counting', () => {
    expect(hasAdjustmentPoint({ planProvisioningType: 'K2', applicationKind: 'SAAS' })).toBe(true);
    expect(hasAdjustmentPoint({ planProvisioningType: 'K2', applicationKind: 'SAAS', seatCounting: 'FIXED' })).toBe(
      true,
    );
    expect(hasAdjustmentPoint({ planProvisioningType: 'K2', applicationKind: 'LICENSED' })).toBe(true);
    expect(hasAdjustmentPoint({ planProvisioningType: 'K2', applicationKind: 'SAAS', seatCounting: 'MEMBERS' })).toBe(
      false,
    );
    expect(hasAdjustmentPoint({ planProvisioningType: 'K1', applicationKind: 'SAAS' })).toBe(false);
    expect(hasAdjustmentPoint({ planProvisioningType: 'K4', applicationKind: 'LICENSED' })).toBe(false);
    expect(hasAdjustmentPoint({ planProvisioningType: 'K2', applicationKind: 'INTERNAL' })).toBe(false);
  });
});
