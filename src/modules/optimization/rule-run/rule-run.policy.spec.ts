import {
  RUN_MAX_ATTEMPTS,
  RUN_TAKEOVER_AFTER_MS,
  canTakeOver,
  manualPeriodKeyOf,
  periodKeyOf,
  ruleRunLockName,
  scheduleOf,
} from './rule-run.policy';

describe('rule run policy', () => {
  it('keys a daily run by the day and a weekly run by the ISO week', () => {
    expect(periodKeyOf('DAILY', '2026-11-09')).toBe('2026-11-09');
    expect(periodKeyOf('WEEKLY', '2026-11-09')).toBe('2026-W46');
    expect(periodKeyOf('WEEKLY', '2026-11-15')).toBe('2026-W46');
    expect(periodKeyOf('WEEKLY', '2026-11-16')).toBe('2026-W47');
  });

  it('puts the days around the new year in the week that holds their Thursday', () => {
    expect(periodKeyOf('WEEKLY', '2026-01-01')).toBe('2026-W01');
    expect(periodKeyOf('WEEKLY', '2025-12-29')).toBe('2026-W01');
    expect(periodKeyOf('WEEKLY', '2027-01-01')).toBe('2026-W53');
    expect(periodKeyOf('WEEKLY', '2021-01-03')).toBe('2020-W53');
  });

  it('takes over a run that has been RUNNING for two hours, with an attempt left, and not before', () => {
    const startedAt = new Date('2026-11-09T01:00:00Z');
    const at = (ms: number) => new Date(startedAt.getTime() + ms);

    expect(canTakeOver({ status: 'RUNNING', startedAt, attempt: 1 }, at(RUN_TAKEOVER_AFTER_MS - 1))).toBe(false);
    expect(canTakeOver({ status: 'RUNNING', startedAt, attempt: 1 }, at(RUN_TAKEOVER_AFTER_MS))).toBe(true);
    expect(canTakeOver({ status: 'RUNNING', startedAt, attempt: RUN_MAX_ATTEMPTS - 1 }, at(3 * 3600_000))).toBe(true);
  });

  it('does not take over a run on its last attempt, nor one that completed', () => {
    const startedAt = new Date('2026-11-09T01:00:00Z');
    const later = new Date('2026-11-09T05:00:00Z');

    expect(canTakeOver({ status: 'RUNNING', startedAt, attempt: RUN_MAX_ATTEMPTS }, later)).toBe(false);
    expect(canTakeOver({ status: 'COMPLETED', startedAt, attempt: 1 }, later)).toBe(false);
    expect(canTakeOver({ status: 'FAILED', startedAt, attempt: 1 }, later)).toBe(true);
    expect(canTakeOver({ status: 'FAILED', startedAt, attempt: RUN_MAX_ATTEMPTS }, later)).toBe(false);
  });

  it('reads the schedule parameter, daily unless it says weekly', () => {
    expect(scheduleOf('WEEKLY')).toBe('WEEKLY');
    expect(scheduleOf('DAILY')).toBe('DAILY');
    expect(scheduleOf(undefined)).toBe('DAILY');
  });

  it('AF-01: keys a run by hand by its instant, never as a day or a week the schedule claims', () => {
    const key = manualPeriodKeyOf(new Date('2026-11-10T03:04:05.006Z'));

    expect(key).toBe('MANUAL-2026-11-10T03:04:05.006Z');
    expect(key).not.toBe(periodKeyOf('DAILY', '2026-11-10'));
    expect(manualPeriodKeyOf(new Date('2026-11-10T03:04:05.007Z'))).not.toBe(key);
  });

  it('AF-01: one lock per organization and set of rules, the same for a scheduled run and a run by hand', () => {
    expect(ruleRunLockName('org', 'G1_G2')).toBe('ghost-seat-rule-run:org:G1_G2');
    expect(ruleRunLockName('org', 'G1_G2')).not.toBe(ruleRunLockName('org', 'G3_G4'));
  });
});
