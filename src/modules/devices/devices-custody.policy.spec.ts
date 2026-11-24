import {
  custodyOf,
  judgeDeviceActor,
  judgeKeyActivationTarget,
  type DeviceCondition,
  type DeviceCustody,
  type DeviceKeyBindingKind,
} from './devices-custody.policy';

describe('devices-custody.policy', () => {
  describe('custodyOf', () => {
    it.each<{
      label: string;
      voidedAt: Date | null;
      retiredAt: Date | null;
      hasOpenReturnTask: boolean;
      hasOpenRegistration: boolean;
      expected: DeviceCustody;
    }>([
      {
        label: 'voided overrides retired, return task, and open registration',
        voidedAt: new Date('2026-11-23T00:00:00.000Z'),
        retiredAt: new Date('2026-11-23T00:00:00.000Z'),
        hasOpenReturnTask: true,
        hasOpenRegistration: true,
        expected: 'VOIDED',
      },
      {
        label: 'retired overrides return task and open registration',
        voidedAt: null,
        retiredAt: new Date('2026-11-23T00:00:00.000Z'),
        hasOpenReturnTask: true,
        hasOpenRegistration: true,
        expected: 'RETIRED',
      },
      {
        label: 'open return task marks device awaiting return even after registration closes',
        voidedAt: null,
        retiredAt: null,
        hasOpenReturnTask: true,
        hasOpenRegistration: false,
        expected: 'AWAITING_RETURN',
      },
      {
        label: 'open return task overrides open registration',
        voidedAt: null,
        retiredAt: null,
        hasOpenReturnTask: true,
        hasOpenRegistration: true,
        expected: 'AWAITING_RETURN',
      },
      {
        label: 'open registration without return task is assigned',
        voidedAt: null,
        retiredAt: null,
        hasOpenReturnTask: false,
        hasOpenRegistration: true,
        expected: 'ASSIGNED',
      },
      {
        label: 'no flags means in stock',
        voidedAt: null,
        retiredAt: null,
        hasOpenReturnTask: false,
        hasOpenRegistration: false,
        expected: 'IN_STOCK',
      },
    ])('$label -> $expected', ({ voidedAt, retiredAt, hasOpenReturnTask, hasOpenRegistration, expected }) => {
      expect(custodyOf({ voidedAt, retiredAt, hasOpenReturnTask, hasOpenRegistration })).toBe(expected);
    });
  });

  describe('judgeKeyActivationTarget', () => {
    it.each<{
      custody: DeviceCustody;
      condition: DeviceCondition;
      binding: DeviceKeyBindingKind;
      expected: string;
    }>([
      { custody: 'VOIDED', condition: 'BROKEN', binding: 'DEVICE_KEY', expected: 'VOIDED' },
      { custody: 'VOIDED', condition: 'USABLE', binding: 'DEVICE_BUNDLED', expected: 'VOIDED' },
      { custody: 'RETIRED', condition: 'BROKEN', binding: 'DEVICE_KEY', expected: 'ALREADY_RETIRED' },
      { custody: 'RETIRED', condition: 'USABLE', binding: 'DEVICE_BUNDLED', expected: 'ALREADY_RETIRED' },
      { custody: 'AWAITING_RETURN', condition: 'USABLE', binding: 'DEVICE_KEY', expected: 'AWAITING_RETURN' },
      { custody: 'AWAITING_RETURN', condition: 'BROKEN', binding: 'DEVICE_KEY', expected: 'AWAITING_RETURN' },
      { custody: 'AWAITING_RETURN', condition: 'USABLE', binding: 'DEVICE_BUNDLED', expected: 'OK' },
      { custody: 'AWAITING_RETURN', condition: 'IN_REPAIR', binding: 'DEVICE_BUNDLED', expected: 'NOT_USABLE' },
      { custody: 'IN_STOCK', condition: 'IN_REPAIR', binding: 'DEVICE_KEY', expected: 'NOT_USABLE' },
      { custody: 'ASSIGNED', condition: 'BROKEN', binding: 'DEVICE_BUNDLED', expected: 'NOT_USABLE' },
      { custody: 'IN_STOCK', condition: 'USABLE', binding: 'DEVICE_KEY', expected: 'OK' },
      { custody: 'ASSIGNED', condition: 'USABLE', binding: 'DEVICE_BUNDLED', expected: 'OK' },
    ])('$custody / $condition / $binding -> $expected', ({ custody, condition, binding, expected }) => {
      expect(judgeKeyActivationTarget({ custody, condition, binding })).toBe(expected);
    });
  });

  describe('judgeDeviceActor', () => {
    const scope = new Map([
      ['dept-a', { inCharge: 'it-a', substitute: 'sub-a' }],
      ['dept-b', { inCharge: 'it-b', substitute: null }],
      ['dept-empty', { inCharge: null, substitute: null }],
    ]);

    it.each([
      {
        label: 'device in stock allows any IT Admin',
        holderDepartmentId: null,
        recipientDepartmentId: null,
        actor: 'it-random',
        unplacedRequired: false,
        unplacedDesignee: null,
        expected: { allowed: true, bySubstitute: false },
      },
      {
        label: 'in-charge of holder department is allowed without substitute flag',
        holderDepartmentId: 'dept-a',
        recipientDepartmentId: null,
        actor: 'it-a',
        unplacedRequired: false,
        unplacedDesignee: null,
        expected: { allowed: true, bySubstitute: false },
      },
      {
        label: 'appointed substitute of holder department is allowed with bySubstitute',
        holderDepartmentId: 'dept-a',
        recipientDepartmentId: null,
        actor: 'sub-a',
        unplacedRequired: false,
        unplacedDesignee: null,
        expected: { allowed: true, bySubstitute: true },
      },
      {
        label: 'unrelated IT Admin is rejected when department is active',
        holderDepartmentId: 'dept-a',
        recipientDepartmentId: null,
        actor: 'it-b',
        unplacedRequired: false,
        unplacedDesignee: null,
        expected: { allowed: false, reason: 'NOT_IN_CHARGE' },
      },
      {
        label: 'department with no acting IT Admin rejects every IT Admin',
        holderDepartmentId: 'dept-empty',
        recipientDepartmentId: null,
        actor: 'it-a',
        unplacedRequired: false,
        unplacedDesignee: null,
        expected: { allowed: false, reason: 'NOT_IN_CHARGE' },
      },
      {
        label: 'handover from stock checks recipient department',
        holderDepartmentId: null,
        recipientDepartmentId: 'dept-b',
        actor: 'it-b',
        unplacedRequired: false,
        unplacedDesignee: null,
        expected: { allowed: true, bySubstitute: false },
      },
      {
        label: 'cross-department transfer rejects actor who only covers one side',
        holderDepartmentId: 'dept-a',
        recipientDepartmentId: 'dept-b',
        actor: 'it-a',
        unplacedRequired: false,
        unplacedDesignee: null,
        expected: { allowed: false, reason: 'NOT_IN_CHARGE' },
      },
      {
        label: 'cross-department transfer rejects substitute who only covers source department',
        holderDepartmentId: 'dept-a',
        recipientDepartmentId: 'dept-b',
        actor: 'sub-a',
        unplacedRequired: false,
        unplacedDesignee: null,
        expected: { allowed: false, reason: 'NOT_IN_CHARGE' },
      },
      {
        label: 'unplaced work requires designated IT Admin',
        holderDepartmentId: null,
        recipientDepartmentId: null,
        actor: 'it-des',
        unplacedRequired: true,
        unplacedDesignee: 'it-des',
        expected: { allowed: true, bySubstitute: true },
      },
      {
        label: 'unplaced work rejects non-designated IT Admin',
        holderDepartmentId: null,
        recipientDepartmentId: null,
        actor: 'it-a',
        unplacedRequired: true,
        unplacedDesignee: 'it-des',
        expected: { allowed: false, reason: 'NOT_IN_CHARGE' },
      },
    ])(
      '$label',
      ({ holderDepartmentId, recipientDepartmentId, actor, unplacedRequired, unplacedDesignee, expected }) => {
        expect(
          judgeDeviceActor({
            holderDepartmentId,
            recipientDepartmentId,
            actingByDepartment: scope,
            actor,
            unplacedRequired,
            unplacedDesignee,
          }),
        ).toEqual(expected);
      },
    );

    it('marks bySubstitute true when actor is in-charge on one side and substitute on the other', () => {
      const dualScope = new Map([
        ['dept-a', { inCharge: 'it-dual', substitute: null }],
        ['dept-b', { inCharge: 'it-other', substitute: 'it-dual' }],
      ]);
      expect(
        judgeDeviceActor({
          holderDepartmentId: 'dept-a',
          recipientDepartmentId: 'dept-b',
          actingByDepartment: dualScope,
          actor: 'it-dual',
        }),
      ).toEqual({ allowed: true, bySubstitute: true });
    });

    it('enforces placed recipient department even when unplaced holder designation matches actor', () => {
      expect(
        judgeDeviceActor({
          holderDepartmentId: null,
          recipientDepartmentId: 'dept-b',
          actingByDepartment: scope,
          actor: 'it-a',
          unplacedRequired: true,
          unplacedDesignee: 'it-a',
        }),
      ).toEqual({ allowed: false, reason: 'NOT_IN_CHARGE' });

      expect(
        judgeDeviceActor({
          holderDepartmentId: null,
          recipientDepartmentId: 'dept-b',
          actingByDepartment: scope,
          actor: 'it-b',
          unplacedRequired: true,
          unplacedDesignee: 'it-b',
        }),
      ).toEqual({ allowed: true, bySubstitute: true });
    });
  });
});
