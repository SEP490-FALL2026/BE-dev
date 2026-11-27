import type { PeriodAdjustment } from '../../../catalog/public/subscription-period.types';
import {
  candidateNotices,
  dataQualityProblemsOf,
  dueNotices,
  noticeRecipients,
  RENEWAL_DAY_LOOKBACK_DAYS,
} from './renewal-adjustment-alerts.policy';

/** An annual period: the point 30 days before the deadline, the red alert 7 days before, the renewal day 5 days after the deadline. */
const annual: PeriodAdjustment = {
  kind: 'NOTICE_DEADLINE',
  deadline: '2026-12-01',
  point: '2026-11-01',
  end: '2026-12-06',
  redAlertOn: '2026-11-24',
  commitment: 'ANNUAL',
};
/** A monthly period: the payment day is the deadline and the renewal day, the point 7 days before. */
const monthly: PeriodAdjustment = {
  kind: 'PAYMENT_DATE',
  deadline: '2026-12-01',
  point: '2026-11-24',
  end: '2026-12-01',
  redAlertOn: null,
  commitment: 'MONTHLY',
};

/** The notices due with every fact favourable to the notice: no case, seats held, ten bought, three needed, renews itself. */
const due = (
  adjustment: PeriodAdjustment,
  today: string,
  overrides: Partial<{
    hasCase: boolean;
    holdsSeats: boolean;
    purchased: number | null;
    target: number;
    autoRenew: boolean;
    eventRecorded: boolean;
  }> = {},
) => {
  const facts = { hasCase: false, holdsSeats: true, purchased: 10, target: 3, autoRenew: true, ...overrides };

  return dueNotices(
    adjustment,
    today,
    facts.hasCase,
    facts.holdsSeats,
    facts.purchased,
    facts.target,
    facts.autoRenew,
    facts.eventRecorded ?? false,
  );
};

describe('the point of adjustment (SBF-20 §4.5, row 1)', () => {
  it('tells the IT Admin from the point to the renewal day, while no case stands for the period', () => {
    expect(due(annual, '2026-10-31')).toEqual([]);
    expect(due(annual, '2026-11-01')).toEqual(['ADJUSTMENT_POINT']);
    expect(due(annual, '2026-11-23')).toEqual(['ADJUSTMENT_POINT']);
    expect(due(annual, '2026-12-06')).toEqual(['ADJUSTMENT_POINT', 'RED_ALERT']);
    expect(due(monthly, '2026-11-24')).toEqual(['ADJUSTMENT_POINT']);
    expect(due(monthly, '2026-12-01')).toContain('ADJUSTMENT_POINT');
  });

  it('tells nothing once a case stands for the period: the IT Admin has recorded', () => {
    expect(due(annual, '2026-11-10', { hasCase: true })).toEqual([]);
    expect(due(monthly, '2026-12-01', { hasCase: true })).toEqual([]);
    expect(due(annual, '2026-12-20', { hasCase: true })).toEqual([]);
  });
});

describe('the red alert of a plan by the year (row 2)', () => {
  it('opens 7 days before the deadline and lasts to the renewal day, besides the notice of the point', () => {
    expect(due(annual, '2026-11-23')).toEqual(['ADJUSTMENT_POINT']);
    expect(due(annual, '2026-11-24')).toEqual(['ADJUSTMENT_POINT', 'RED_ALERT']);
    expect(due(annual, '2026-12-06')).toEqual(['ADJUSTMENT_POINT', 'RED_ALERT']);
  });

  it('follows the red day of the period, not a constant, and never exists for a plan by the month', () => {
    expect(due({ ...annual, redAlertOn: '2026-11-20' }, '2026-11-20')).toEqual(['ADJUSTMENT_POINT', 'RED_ALERT']);
    expect(due(monthly, '2026-12-01')).not.toContain('RED_ALERT');
    expect(due({ ...annual, redAlertOn: null }, '2026-12-01')).toEqual(['ADJUSTMENT_POINT']);
  });

  it('is not raised when a case stands for the period', () => {
    expect(due(annual, '2026-11-30', { hasCase: true })).toEqual([]);
  });
});

describe('the plan by the month that keeps its seats (row 3)', () => {
  it('is told on the payment day only, when no case stands and more seats are bought than the target', () => {
    expect(due(monthly, '2026-11-30')).toEqual(['ADJUSTMENT_POINT']);
    expect(due(monthly, '2026-12-01')).toEqual(['ADJUSTMENT_POINT', 'KEPT']);
    expect(due(monthly, '2026-12-01', { purchased: 3, target: 3 })).toEqual(['ADJUSTMENT_POINT']);
    expect(due(monthly, '2026-12-01', { purchased: 2, target: 3 })).toEqual(['ADJUSTMENT_POINT']);
    expect(due(monthly, '2026-12-01', { purchased: null })).toEqual(['ADJUSTMENT_POINT']);
    expect(due(monthly, '2026-12-01', { hasCase: true })).toEqual([]);
  });

  it('is not a notice of a plan by the year, whose deadline is no payment day', () => {
    expect(due(annual, '2026-12-01')).not.toContain('KEPT');
  });
});

describe('after the renewal day (row 4)', () => {
  it('is an incident for a plan that renews itself and the end of a plan that does not, while seats are still held', () => {
    expect(due(annual, '2026-12-06')).not.toContain('AUTO_RENEWAL_INCIDENT');
    expect(due(annual, '2026-12-07')).toEqual(['AUTO_RENEWAL_INCIDENT']);
    expect(due(annual, '2026-12-07', { autoRenew: false })).toEqual(['EXPIRY_MARKED']);
  });

  it('lasts as many days as the pass looks back, and no longer', () => {
    expect(RENEWAL_DAY_LOOKBACK_DAYS).toBe(60);
    expect(due(annual, '2027-02-04')).toEqual(['AUTO_RENEWAL_INCIDENT']);
    expect(due(annual, '2027-02-05')).toEqual([]);
  });

  it('needs seats still held, no case for the period and no event already recorded', () => {
    expect(due(annual, '2026-12-07', { holdsSeats: false })).toEqual([]);
    expect(due(annual, '2026-12-07', { hasCase: true })).toEqual([]);
    expect(due(annual, '2026-12-07', { eventRecorded: true })).toEqual([]);
  });

  it('marks the end of a plan by the month that does not renew itself once its end date has passed (the end is the date)', () => {
    const endsOnItsDate: PeriodAdjustment = {
      ...monthly,
      kind: 'END_DATE',
      deadline: '2026-11-20',
      point: '2026-11-13',
      end: '2026-11-20',
    };
    expect(due(endsOnItsDate, '2026-11-20', { autoRenew: false })).not.toContain('EXPIRY_MARKED');
    expect(due(endsOnItsDate, '2026-11-21', { autoRenew: false })).toEqual(['EXPIRY_MARKED']);
    expect(due(endsOnItsDate, '2026-11-21', { autoRenew: false, holdsSeats: false })).toEqual(['EXPIRY_MARKED']);
  });

  it('never gives an incident to a plan by the month that renews itself: its end rolls on to a day not yet come', () => {
    expect(due(monthly, '2026-11-30')).not.toContain('AUTO_RENEWAL_INCIDENT');
    expect(due(monthly, '2026-12-01')).not.toContain('AUTO_RENEWAL_INCIDENT');
  });
});

describe('the cheap first look (R2-12)', () => {
  it('names the notices a day may bring without the counts of the seats, so they are counted for those only', () => {
    expect(candidateNotices(annual, '2026-10-31', false, true, false)).toEqual([]);
    expect(candidateNotices(annual, '2026-11-24', false, true, false)).toEqual(['ADJUSTMENT_POINT', 'RED_ALERT']);
    expect(candidateNotices(monthly, '2026-12-01', false, true, false)).toEqual(['ADJUSTMENT_POINT', 'KEPT']);
    expect(candidateNotices(annual, '2026-12-07', false, true, false)).toEqual(['AUTO_RENEWAL_INCIDENT']);
    expect(candidateNotices(annual, '2026-12-07', false, false, false)).toEqual(['EXPIRY_MARKED']);
    expect(candidateNotices(annual, '2026-12-07', false, true, true)).toEqual([]);
    expect(candidateNotices(annual, '2026-11-24', true, true, false)).toEqual([]);
  });
});

describe('who is told (SBF-20 §4.6, QĐ-99h, QĐ-98e)', () => {
  const people = { itAdmin: 'it', finance: 'fin', approver: 'boss' };

  it('tells the IT Admin in charge alone of the point and of the kept seats', () => {
    expect(noticeRecipients('ADJUSTMENT_POINT', people)).toEqual(['it']);
    expect(noticeRecipients('KEPT', people)).toEqual(['it']);
  });

  it('tells the IT Admin and Finance of the red alert and of the end, never the spending approver', () => {
    expect(noticeRecipients('RED_ALERT', people)).toEqual(['it', 'fin']);
    expect(noticeRecipients('EXPIRY_MARKED', people)).toEqual(['it', 'fin']);
  });

  it('tells the spending approver of an incident only', () => {
    expect(noticeRecipients('AUTO_RENEWAL_INCIDENT', people)).toEqual(['it', 'fin', 'boss']);
  });

  it('leaves out who is missing and tells a person who holds two roles once', () => {
    expect(noticeRecipients('AUTO_RENEWAL_INCIDENT', { itAdmin: null, finance: 'fin', approver: null })).toEqual([
      'fin',
    ]);
    expect(noticeRecipients('AUTO_RENEWAL_INCIDENT', { itAdmin: 'a', finance: 'a', approver: 'a' })).toEqual(['a']);
    expect(noticeRecipients('RED_ALERT', { itAdmin: null, finance: null, approver: 'boss' })).toEqual([]);
  });
});

describe('the quality of the contract data (§4.2, §4.5 last row)', () => {
  it('warns of no date to count from when the period has no point of adjustment', () => {
    expect(dataQualityProblemsOf(null)).toEqual(['NO_ALERT_ANCHOR']);
  });

  it('warns of no cancellation deadline for a plan by the year counted from its renewal date', () => {
    expect(dataQualityProblemsOf({ ...annual, kind: 'RENEWAL_DATE' })).toEqual(['NO_NOTICE_DEADLINE']);
  });

  it('warns of nothing when the deadline is known, or the plan is by the month, or counted from its end date', () => {
    expect(dataQualityProblemsOf(annual)).toEqual([]);
    expect(dataQualityProblemsOf(monthly)).toEqual([]);
    expect(dataQualityProblemsOf({ ...annual, kind: 'END_DATE' })).toEqual([]);
  });
});
