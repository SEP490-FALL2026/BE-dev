import type { HeadDecision } from './transfer-review.types';
import {
  HEAD_DECISIONS,
  isChangeOfMind,
  isReviewOverdue,
  mayDecide,
  mayRecordDecision,
  overdueDaysOf,
  reviewDueOn,
  statusAfterDecision,
  waitingReasonOf,
} from './transfer-review.policy';

const NONE: ReadonlySet<string> = new Set();

describe('the deadline of a review (US-03-07 AC-2, OQ-A-17 b)', () => {
  it('does not count the day the transfer took effect: Friday 16/10 with five working days is due on Friday 23/10', () => {
    expect(reviewDueOn('2026-10-16', 5, NONE)).toBe('2026-10-23');
  });

  it('skips the weekend and the days nobody works', () => {
    expect(reviewDueOn('2026-10-12', 5, NONE)).toBe('2026-10-19');
    expect(reviewDueOn('2026-10-12', 5, new Set(['2026-10-14']))).toBe('2026-10-20');
  });

  it('counts from the next working day when the transfer takes effect on a Saturday', () => {
    expect(reviewDueOn('2026-10-17', 5, NONE)).toBe('2026-10-23');
  });
});

describe('a late review (US-03-07 AC-6, AC-12)', () => {
  it.each([
    ['open, on the last day', 'OPEN', '2026-10-23', '2026-10-23', false, 0],
    ['open, the day after', 'OPEN', '2026-10-23', '2026-10-24', true, 1],
    ['open, a week after', 'OPEN', '2026-10-23', '2026-10-30', true, 7],
    ['completed, long after', 'COMPLETED', '2026-10-23', '2026-11-30', false, 0],
    ['superseded, long after', 'SUPERSEDED', '2026-10-23', '2026-11-30', false, 0],
  ] as const)('%s', (_name, status, dueOn, today, overdue, days) => {
    expect(isReviewOverdue(status, dueOn, today)).toBe(overdue);
    expect(overdueDaysOf(status, dueOn, today)).toBe(days);
  });
});

describe('who decides (US-03-07 AC-7, AC-9)', () => {
  it('is the head of the department today, and nobody else', () => {
    expect(mayDecide('h2', 'h2')).toBe(true);
    expect(mayDecide('h2', 'h1')).toBe(false);
    expect(mayDecide('h2', 'it-admin')).toBe(false);
  });

  it('is nobody while the department has no head, and the review waits', () => {
    expect(mayDecide(null, 'h2')).toBe(false);
    expect(waitingReasonOf('OPEN', null)).toBe('NO_HEAD');
    expect(waitingReasonOf('OPEN', 'h6')).toBeNull();
    expect(waitingReasonOf('COMPLETED', null)).toBeNull();
  });
});

describe('the one decision that may be taken back (T-6, F43)', () => {
  const ALL: HeadDecision[] = ['STILL_NEEDED', 'NOT_NEEDED'];

  it('lets a line that waits take any decision', () => {
    for (const next of ALL) expect(mayRecordDecision('PENDING', next)).toBe(true);
  });

  it('lets "still needed" become "no longer needed" and nothing else', () => {
    expect(isChangeOfMind('STILL_NEEDED', 'NOT_NEEDED')).toBe(true);
    expect(mayRecordDecision('STILL_NEEDED', 'NOT_NEEDED')).toBe(true);
    expect(isChangeOfMind('STILL_NEEDED', 'STILL_NEEDED')).toBe(false);
    expect(mayRecordDecision('STILL_NEEDED', 'STILL_NEEDED')).toBe(false);
  });

  it.each(['NOT_NEEDED', 'NEEDS_NEW_TOOL'] as const)(
    'keeps "%s" final: it is never taken back, not even to the same answer',
    (current) => {
      for (const next of ALL) {
        expect(isChangeOfMind(current, next)).toBe(false);
        expect(mayRecordDecision(current, next)).toBe(false);
      }
    },
  );

  it('is not a change when the line waits: the first decision of a line is not a change of mind', () => {
    expect(isChangeOfMind('PENDING', 'NOT_NEEDED')).toBe(false);
  });
});

describe('the decision and its reason (US-03-07 AC-3, AC-4, AC-5)', () => {
  it('allows two decisions: NEEDS_NEW_TOOL is retired and only read from the lines written before', () => {
    expect(HEAD_DECISIONS).toEqual(['STILL_NEEDED', 'NOT_NEEDED']);
  });

  it('completes the review when no line waits (AC-13)', () => {
    expect(statusAfterDecision(1)).toBe('OPEN');
    expect(statusAfterDecision(0)).toBe('COMPLETED');
  });
});
