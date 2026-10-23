import { PARAMETER_DEFINITIONS, defaultValues, definitionOf, validateParameterValue } from './parameter-definitions';

describe('operating parameter definitions (US-01-04)', () => {
  it('starts every parameter at the default the stories fix (AC-7)', () => {
    const defaults = defaultValues();

    expect(defaults.APPROVAL_SLA_WORKING_DAYS).toBe(2);
    expect(defaults.ACTIVITY_WINDOW_MINUTES).toBe(5);
    expect(defaults.FISCAL_YEAR_START_MONTH).toBe(1);
    expect(defaults.SPEND_SUBMISSION_WAIT_WORKING_DAYS).toBe(2);
    expect(defaults.TRANSFER_REVIEW_WORKING_DAYS).toBe(5);
    expect(defaults.ABRUPT_DEPARTURE_HOLD_WORKING_DAYS).toBe(1);
    expect(defaults.DETECTION_THRESHOLD_DAYS).toEqual([30, 60, 90]);
    expect(defaults.RENEWAL_ALERT_DAYS_BEFORE_DEADLINE).toEqual([15, 7]);
    expect(defaults.RULE_SCHEDULE_G1_G2).toBe('DAILY');
    expect(defaults.RULE_SCHEDULE_G3_G4).toBe('WEEKLY');
  });

  it('has no budget period kind and no high-value threshold: the budget period is the fiscal year (AC-8, AC-14)', () => {
    const keys = PARAMETER_DEFINITIONS.map((definition) => definition.key);

    expect(definitionOf('BUDGET_PERIOD_KIND')).toBeUndefined();
    expect(keys.filter((key) => /BUDGET_PERIOD|HIGH_VALUE|THRESHOLD_PERCENT/.test(key))).toEqual([
      'FORECAST_ERROR_THRESHOLD_PERCENT',
    ]);
    expect(keys).toEqual(expect.arrayContaining(['FISCAL_YEAR_START_MONTH', 'SPEND_SUBMISSION_WAIT_WORKING_DAYS']));
  });

  it('gives every parameter a key, a unit, a description and a default that is itself valid', () => {
    expect(new Set(PARAMETER_DEFINITIONS.map((definition) => definition.key)).size).toBe(PARAMETER_DEFINITIONS.length);
    for (const definition of PARAMETER_DEFINITIONS) {
      expect(definition.description.length).toBeGreaterThan(10);
      expect(validateParameterValue(definition.key, definition.default, defaultValues())).toEqual({ ok: true });
    }
  });

  it('keeps the domains: a forecast error of 50% is refused, one of 25% is not (AC-3)', () => {
    expect(validateParameterValue('FORECAST_ERROR_THRESHOLD_PERCENT', 50, defaultValues())).toEqual({
      ok: false,
      reason: 'OUT_OF_RANGE',
    });
    expect(validateParameterValue('FORECAST_ERROR_THRESHOLD_PERCENT', 9, defaultValues())).toEqual({
      ok: false,
      reason: 'OUT_OF_RANGE',
    });
    expect(validateParameterValue('FORECAST_ERROR_THRESHOLD_PERCENT', 10, defaultValues())).toEqual({ ok: true });
    expect(validateParameterValue('FORECAST_ERROR_THRESHOLD_PERCENT', 40, defaultValues())).toEqual({ ok: true });
  });

  it.each([
    ['a number given as text', 'APPROVAL_SLA_WORKING_DAYS', '3'],
    ['a fraction', 'APPROVAL_SLA_WORKING_DAYS', 2.5],
    ['zero days', 'APPROVAL_SLA_WORKING_DAYS', 0],
    ['no value', 'APPROVAL_SLA_WORKING_DAYS', null],
    ['a month that does not exist', 'FISCAL_YEAR_START_MONTH', 13],
    ['month zero', 'FISCAL_YEAR_START_MONTH', 0],
    ['no waiting days', 'SPEND_SUBMISSION_WAIT_WORKING_DAYS', 0],
    ['more than thirty waiting days', 'SPEND_SUBMISSION_WAIT_WORKING_DAYS', 31],
    ['thresholds out of order', 'DETECTION_THRESHOLD_DAYS', [60, 30, 90]],
    ['thresholds with a repeat', 'DETECTION_THRESHOLD_DAYS', [30, 30, 90]],
    ['two thresholds instead of three', 'DETECTION_THRESHOLD_DAYS', [30, 60]],
    ['alerts that do not fall', 'RENEWAL_ALERT_DAYS_BEFORE_DEADLINE', [7, 15]],
    ['an empty alert list', 'RENEWAL_ALERT_DAYS_BEFORE_DEADLINE', []],
    ['a schedule that is not one', 'RULE_SCHEDULE_G1_G2', 'HOURLY'],
  ])('refuses %s', (_name, key, value) => {
    expect(validateParameterValue(key, value, defaultValues())).toMatchObject({ ok: false });
  });

  it('refuses a withdrawal that comes no later than the reminder (N before M)', () => {
    const current = { ...defaultValues(), INVITATION_REMINDER_DAYS: 5 };

    expect(validateParameterValue('INVITATION_WITHDRAW_DAYS', 5, current)).toEqual({
      ok: false,
      reason: 'INCONSISTENT',
    });
    expect(validateParameterValue('INVITATION_WITHDRAW_DAYS', 6, current)).toEqual({ ok: true });
    expect(
      validateParameterValue('INVITATION_REMINDER_DAYS', 14, { ...defaultValues(), INVITATION_WITHDRAW_DAYS: 14 }),
    ).toEqual({ ok: false, reason: 'INCONSISTENT' });
  });

  it('keeps the largest file between one and fifty megabytes, ten to begin with (US-04-04 AC-10)', () => {
    expect(defaultValues().DOCUMENT_MAX_SIZE_MB).toBe(10);
    expect(validateParameterValue('DOCUMENT_MAX_SIZE_MB', 25, defaultValues())).toEqual({ ok: true });
    for (const value of [0, 51, 1.5, -1]) {
      expect(validateParameterValue('DOCUMENT_MAX_SIZE_MB', value, defaultValues()).ok).toBe(false);
    }
  });

  it('knows its own keys and nothing else', () => {
    expect(definitionOf('APPROVAL_SLA_WORKING_DAYS')?.unit).toBe('working days');
    expect(definitionOf('TIME_ZONE')).toBeUndefined();
    expect(validateParameterValue('TIME_ZONE', 'UTC', defaultValues())).toEqual({ ok: false, reason: 'UNKNOWN_KEY' });
  });
});
