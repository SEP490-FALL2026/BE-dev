import type { DemoRunContext } from '../demo-run.types';
import { SHARED_DEMO_V4 } from '../fixture/shared-demo-v4';
import { grantedOnOf, lineOf } from './baseline.steps';

/**
 * The seat file is read by the seat baseline import, which takes personal seats only (`QĐ-110m`): a service account is refused with
 * `SERVICE_ACCOUNT_NOT_SUPPORTED` and a machine account is flagged after the seat is granted, never written by the import.
 */
describe('the lines of the baseline seat file', () => {
  const ctx = { fixture: SHARED_DEMO_V4, today: '2026-11-10' } as unknown as DemoRunContext;

  it('writes every seat of the dataset as a personal seat of a declared person, the only kind the import accepts', () => {
    const people = SHARED_DEMO_V4.people.map((person) => person.code);

    for (const seat of SHARED_DEMO_V4.seats) {
      const [employeeCode, accountIdentifier, kind] = lineOf(ctx, seat).split(',');

      expect(people).toContain(employeeCode);
      expect(accountIdentifier).toMatch(/^[^@\s]+@[^@\s]+$/);
      expect(kind).toBe('personal');
    }
  });
});

/** Q-C (ii): the seats of the people of T1 are granted at different days so the spending of a department grows month by month; a day is never before the subscription or the person exists. */
describe('the day a baseline seat was granted (T8)', () => {
  const ctxOn = (today: string) => ({ fixture: SHARED_DEMO_V4, today }) as unknown as DemoRunContext;
  const seat = (subscription: string, holder: string) =>
    SHARED_DEMO_V4.seats.find((s) => s.subscription === subscription && s.holder === holder)!;

  it('counts back from today by the days of the seat, 130 for a seat that names none', () => {
    expect(grantedOnOf(ctxOn('2026-11-17'), seat('jira', 'NV-DEV1'))).toBe('2026-07-10');
    expect(grantedOnOf(ctxOn('2026-11-17'), seat('m365-basic', 'NV-DEV5'))).toBe('2026-01-21');
  });

  it('never grants a seat before its subscription starts: the annual ones started late in the year', () => {
    const early = { subscription: 'claude-team', holder: 'NV-DEV5', grantedDaysAgo: 300 };
    expect(grantedOnOf(ctxOn('2026-11-17'), early)).toBe('2026-05-01');
    const standard = { subscription: 'm365-standard', holder: 'NV-FINH', grantedDaysAgo: 340 };
    expect(grantedOnOf(ctxOn('2026-11-17'), standard) >= '2026-03-17').toBe(true);
    const premium = { subscription: 'confluence-premium', holder: 'NV-ITOH', grantedDaysAgo: 340 };
    expect(grantedOnOf(ctxOn('2026-11-17'), premium)).toBe('2026-01-26');
  });

  it('never grants a seat before the person was hired (400 days ago)', () => {
    const old = { subscription: 'jira', holder: 'NV-DEV1', grantedDaysAgo: 900 };

    expect(grantedOnOf(ctxOn('2026-11-17'), old)).toBe('2026-01-01');
  });

  it.each(['2026-10-01', '2026-11-17', '2026-12-31'])(
    'puts no seat that ends before today earlier than the day it ends on %s',
    (today) => {
      for (const declared of SHARED_DEMO_V4.seats.filter((s) => s.endInDays !== undefined)) {
        const end = new Date(`${today}T00:00:00Z`).getTime() + declared.endInDays! * 86_400_000;

        expect(new Date(`${grantedOnOf(ctxOn(today), declared)}T00:00:00Z`).getTime()).toBeLessThanOrEqual(end);
      }
    },
  );

  it('writes the granted day of every seat into its line of the file', () => {
    const line = lineOf(ctxOn('2026-11-17'), seat('m365-basic', 'NV-DEV5')).split(',');

    expect(line[3]).toBe(grantedOnOf(ctxOn('2026-11-17'), seat('m365-basic', 'NV-DEV5')));
  });
});
