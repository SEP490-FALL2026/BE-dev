import {
  activationsUsed,
  capReached,
  freeLicenses,
  isOverCap,
  judgeDecision,
  judgeMove,
  judgeOpen,
  occupied,
  type OpenActivationFacts,
} from './device-activation.policy';

describe('device-activation.policy', () => {
  describe('counters and occupancy', () => {
    it('computes activationsUsed from initial count plus OPERATION rows only', () => {
      expect(activationsUsed({ initialActivationsUsed: 9, operationActivationCount: 3 })).toBe(12);
    });

    it('detects capReached and isOverCap around maxActivations', () => {
      expect(capReached({ used: 29, maxActivations: 30 })).toBe(false);
      expect(capReached({ used: 30, maxActivations: 30 })).toBe(true);
      expect(isOverCap({ usedAfterOpen: 1, maxActivations: 1 })).toBe(false);
      expect(isOverCap({ usedAfterOpen: 2, maxActivations: 1 })).toBe(true);
    });

    it('computes occupied and freeLicenses including closed unreleased rows', () => {
      const occ = occupied({ openDeviceKeyCount: 20, closedUnreleasedCount: 1 });
      expect(occ).toBe(21);
      expect(freeLicenses({ purchasedQuantity: 25, occupiedCount: occ })).toBe(4);
    });
  });

  describe('judgeOpen', () => {
    const baseFacts = (over: Partial<OpenActivationFacts> = {}): OpenActivationFacts => ({
      planExists: true,
      planKeyBinding: 'DEVICE_KEY',
      licenseKeyId: 'key-1',
      keyExists: true,
      keyPlanId: 'plan-1',
      planId: 'plan-1',
      purchaseKind: 'PERPETUAL',
      purchaseStatus: 'ACTIVE',
      keyWithdrawn: false,
      freeLicenseCount: 1,
      ...over,
    });

    it.each<{ label: string; over: Partial<OpenActivationFacts>; expected: string }>([
      { label: 'missing plan', over: { planExists: false }, expected: 'PLAN_NOT_FOUND' },
      { label: 'account-bound plan', over: { planKeyBinding: 'ACCOUNT' }, expected: 'PLAN_NOT_DEVICE_BOUND' },
      {
        label: 'bundled plan rejects key',
        over: { planKeyBinding: 'DEVICE_BUNDLED', licenseKeyId: 'key-1' },
        expected: 'KEY_NOT_ALLOWED',
      },
      {
        label: 'bundled plan without key passes',
        over: { planKeyBinding: 'DEVICE_BUNDLED', licenseKeyId: null },
        expected: 'OK',
      },
      { label: 'device-key plan requires key', over: { licenseKeyId: null }, expected: 'KEY_REQUIRED' },
      { label: 'missing key', over: { keyExists: false }, expected: 'KEY_NOT_FOUND' },
      { label: 'key of another plan', over: { keyPlanId: 'plan-other' }, expected: 'KEY_NOT_OF_PLAN' },
      { label: 'non-active purchase', over: { purchaseStatus: 'EXPIRED' }, expected: 'PURCHASE_NOT_ACTIVE' },
      { label: 'non-perpetual purchase', over: { purchaseKind: 'SUBSCRIPTION' }, expected: 'PURCHASE_NOT_ACTIVE' },
      { label: 'withdrawn key', over: { keyWithdrawn: true }, expected: 'KEY_WITHDRAWN' },
      { label: 'no free licenses in lot', over: { freeLicenseCount: 0 }, expected: 'LOT_FULL' },
      { label: 'valid device-key activation', over: {}, expected: 'OK' },
    ])('$label -> $expected', ({ over, expected }) => {
      expect(judgeOpen(baseFacts(over))).toBe(expected);
    });
  });

  describe('judgeDecision', () => {
    it.each([
      { isOpen: false, isDeviceKey: true, hasLicenseRelease: true, expected: 'ALREADY_CLOSED' },
      { isOpen: true, isDeviceKey: false, hasLicenseRelease: true, expected: 'RELEASE_NOT_APPLICABLE' },
      { isOpen: true, isDeviceKey: false, hasLicenseRelease: false, expected: 'OK' },
      { isOpen: true, isDeviceKey: true, hasLicenseRelease: true, expected: 'OK' },
      { isOpen: true, isDeviceKey: true, hasLicenseRelease: false, expected: 'OK' },
    ])('open=$isOpen key=$isDeviceKey release=$hasLicenseRelease -> $expected', (input) => {
      expect(judgeDecision(input)).toBe(input.expected);
    });
  });

  describe('judgeMove', () => {
    it.each([
      {
        isOpen: false,
        isDeviceKey: true,
        sourceDeviceId: 'd1',
        targetDeviceId: 'd2',
        keyWithdrawn: false,
        expected: 'ALREADY_CLOSED',
      },
      {
        isOpen: true,
        isDeviceKey: false,
        sourceDeviceId: 'd1',
        targetDeviceId: 'd2',
        keyWithdrawn: false,
        expected: 'NOT_MOVABLE',
      },
      {
        isOpen: true,
        isDeviceKey: true,
        sourceDeviceId: 'd1',
        targetDeviceId: 'd1',
        keyWithdrawn: false,
        expected: 'SAME_DEVICE',
      },
      {
        isOpen: true,
        isDeviceKey: true,
        sourceDeviceId: 'd1',
        targetDeviceId: 'd2',
        keyWithdrawn: true,
        expected: 'KEY_WITHDRAWN',
      },
      {
        isOpen: true,
        isDeviceKey: true,
        sourceDeviceId: 'd1',
        targetDeviceId: 'd2',
        keyWithdrawn: false,
        expected: 'OK',
      },
    ])('open=$isOpen key=$isDeviceKey -> $expected', (input) => {
      expect(judgeMove(input)).toBe(input.expected);
    });
  });
});
