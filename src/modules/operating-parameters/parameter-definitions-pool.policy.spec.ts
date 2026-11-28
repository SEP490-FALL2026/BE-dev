import {
  defaultValues,
  definitionOf,
  parameterOwnerOf,
  rolesMayRead,
  rolesMaySet,
  validateParameterValue,
} from './parameter-definitions.policy';

describe('operating parameter definitions for shared-pool variance and seat purchases', () => {
  it.each([
    ['K2_INVOICE_VARIANCE_THRESHOLD_PERCENT', 'BUDGET', 5, 1, 50, 'percent', '%', 'FINANCE'],
    [
      'SEAT_PURCHASE_INVOICE_DUE_WORKING_DAYS',
      'SUBSCRIPTION',
      5,
      1,
      30,
      'working days',
      'ngày làm việc',
      'SUPER_ADMIN',
    ],
    ['SEAT_PURCHASE_LATE_INVOICE_DAYS', 'SUBSCRIPTION', 95, 1, 365, 'days', 'ngày', 'SUPER_ADMIN'],
  ] as const)(
    'defines %s in %s with default %i (%i..%i %s) owned by %s',
    (key, group, fallback, min, max, unit, unitLabel, owner) => {
      const definition = definitionOf(key);

      expect(definition).toMatchObject({
        key,
        group,
        shape: { kind: 'int', min, max },
        default: fallback,
        unit,
        unitLabel,
      });
      expect(parameterOwnerOf(key)).toBe(owner);
      expect(defaultValues()[key]).toBe(fallback);
      expect(rolesMaySet([owner], key)).toBe(true);
      expect(rolesMaySet([owner === 'FINANCE' ? 'SUPER_ADMIN' : 'FINANCE'], key)).toBe(false);
      expect(rolesMayRead(['SUPER_ADMIN'], key)).toBe(true);
      expect(rolesMayRead(['FINANCE'], key)).toBe(owner === 'FINANCE');

      for (const ok of [min, fallback, max]) {
        expect(validateParameterValue(key, ok, defaultValues())).toEqual({ ok: true });
      }
      for (const bad of [min - 1, max + 1, 0, -1]) {
        expect(validateParameterValue(key, bad, defaultValues())).toEqual({ ok: false, reason: 'OUT_OF_RANGE' });
      }
      for (const wrong of [fallback + 0.5, String(fallback), null]) {
        expect(validateParameterValue(key, wrong, defaultValues())).toEqual({ ok: false, reason: 'WRONG_TYPE' });
      }
    },
  );
});
