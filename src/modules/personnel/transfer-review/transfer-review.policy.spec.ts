import {
  HEAD_DECISIONS,
  isNoteAllowed,
  isReviewOverdue,
  mayDecide,
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

describe('the decision and its note (US-03-07 AC-3, AC-4, AC-5)', () => {
  it('allows three decisions', () => {
    expect(HEAD_DECISIONS).toEqual(['STILL_NEEDED', 'NOT_NEEDED', 'NEEDS_NEW_TOOL']);
  });

  it.each([
    ['no note with any decision', 'STILL_NEEDED', undefined, true],
    ['a note with a new tool', 'NEEDS_NEW_TOOL', 'Cần bản Figma Pro cho dự án mới', true],
    ['a note of 500 characters', 'NEEDS_NEW_TOOL', 'x'.repeat(500), true],
    ['a note of 501 characters', 'NEEDS_NEW_TOOL', 'x'.repeat(501), false],
    ['a blank note', 'NEEDS_NEW_TOOL', '   ', false],
    ['a note with the tool still needed', 'STILL_NEEDED', 'why', false],
    ['a note with the tool not needed', 'NOT_NEEDED', 'why', false],
  ] as const)('%s', (_name, decision, note, allowed) => {
    expect(isNoteAllowed(decision, note)).toBe(allowed);
  });

  it('completes the review when no line waits (AC-13)', () => {
    expect(statusAfterDecision(1)).toBe('OPEN');
    expect(statusAfterDecision(0)).toBe('COMPLETED');
  });
});
