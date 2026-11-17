import { defaultValues, definitionOf, validateParameterValue } from './parameter-definitions.policy';

/** The three days of the point of adjustment of a subscription (SBF-20, S20-T9b), out of the main spec to keep it under 400 lines. */
describe('operating parameter definitions of the point of adjustment (FR-1.4, FR-8.2)', () => {
  it('S20-T9b (FR-1.4, FR-8.2): the point of adjustment and the red alert are three whole numbers of days, 7, 30 and 7 to begin with', () => {
    const cases: [string, number, number, number][] = [
      ['SUBSCRIPTION_ADJUSTMENT_DAYS_MONTHLY', 7, 1, 28],
      ['SUBSCRIPTION_ADJUSTMENT_DAYS_ANNUAL', 30, 1, 180],
      ['SUBSCRIPTION_RED_ALERT_DAYS_ANNUAL', 7, 1, 90],
    ];

    for (const [key, standard, min, max] of cases) {
      const definition = definitionOf(key);

      expect(definition).toMatchObject({
        group: 'SUBSCRIPTION',
        unit: 'days',
        unitLabel: 'ngày',
        source: 'FR-1.4, FR-8.2',
      });
      expect(definition?.shape).toEqual({ kind: 'int', min, max });
      expect(definition?.owner).toBeUndefined();
      expect(defaultValues()[key]).toBe(standard);
      for (const ok of [min, standard, max]) {
        expect(validateParameterValue(key, ok, defaultValues())).toEqual({ ok: true });
      }
      for (const value of [min - 1, max + 1, -3]) {
        expect(validateParameterValue(key, value, defaultValues())).toEqual({ ok: false, reason: 'OUT_OF_RANGE' });
      }
      for (const value of [7.5, '7', null]) {
        expect(validateParameterValue(key, value, defaultValues())).toEqual({ ok: false, reason: 'WRONG_TYPE' });
      }
    }
  });
});
