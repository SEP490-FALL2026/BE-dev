import type { BusinessDate } from '../../../core/business-date';
import {
  backwardLines,
  checkVersionDecision,
  canResubmit,
  canReturn,
  canWithdraw,
  incompleteLines,
  isEditable,
  isOverdue,
  kindOfChange,
  quartersMatch,
  totalOf,
  yearIsOpen,
  type LineDraft,
} from './budget.policy';

const day = (value: string): BusinessDate => value;
const full: LineDraft = {
  description: 'Figma Organization',
  amountMinor: 50_000_000n,
  windowFrom: day('2027-03-01'),
  windowTo: day('2027-03-31'),
  servicePeriodMonths: 12,
  repeatCycle: 'ANNUAL',
};

describe('what a line of a proposal must say (US-06-10 AC-2, QĐ-82d)', () => {
  it('has no line to name when every line is complete', () => {
    expect(incompleteLines([full, full])).toEqual([]);
  });

  it('names the line and every field it lacks, all of them at once', () => {
    const miro: LineDraft = { description: 'Miro', amountMinor: 20_000_000n };

    expect(incompleteLines([full, miro, { ...full, repeatCycle: undefined }])).toEqual([
      { line: 2, fields: ['windowFrom', 'windowTo', 'servicePeriodMonths', 'repeatCycle'] },
      { line: 3, fields: ['repeatCycle'] },
    ]);
  });

  it('finds the lines whose window runs backwards', () => {
    expect(backwardLines([full, { ...full, windowFrom: day('2027-04-10'), windowTo: day('2027-04-01') }])).toEqual([2]);
    expect(backwardLines([{ windowFrom: undefined, windowTo: undefined }])).toEqual([]);
  });
});

describe('which fiscal years take a proposal (US-06-10 AC-9)', () => {
  it.each([
    ['a year to come', 2027, '2026-06-15', 1, true],
    ['the year that is running', 2026, '2026-06-15', 1, true],
    ['a year that has ended', 2025, '2026-06-15', 1, false],
    ['the last day of a year', 2026, '2026-12-31', 1, true],
    ['the first day after it', 2026, '2027-01-01', 1, false],
    ['a year that begins in April: March still belongs to the year before', 2026, '2027-03-31', 4, true],
    ['a year that begins in April: April is the next year', 2026, '2027-04-01', 4, false],
  ])('%s', (_name, year, today, startMonth, open) => {
    expect(yearIsOpen(year, day(today), startMonth)).toBe(open);
  });
});

describe('adding up a version', () => {
  it('is the sum of the lines', () => {
    expect(totalOf([{ amountMinor: 50_000_000n }, { amountMinor: 20_000_000n }])).toBe(70_000_000n);
    expect(totalOf([])).toBe(0n);
  });

  it('has a forecast by quarter only when the four quarters add up to the total (US-06-09 AC-6)', () => {
    expect(quartersMatch(80n, [20n, 20n, 20n, 20n])).toBe(true);
    expect(quartersMatch(80n, [20n, 20n, 20n, 15n])).toBe(false);
    expect(quartersMatch(80n, [100n, -20n, 0n, 0n])).toBe(false);
  });
});

describe('what can be done to a proposal that was sent (US-06-10 AC-4, AC-5, AC-6)', () => {
  it.each([
    ['SUBMITTED', true, true, false],
    ['REVIEWED', false, false, false],
    ['WITHDRAWN', false, false, false],
    ['RETURNED', false, false, true],
  ] as const)('%s: withdraw %s, give back %s, send again %s', (state, withdraw, giveBack, again) => {
    expect([canWithdraw(state), canReturn(state), canResubmit(state)]).toEqual([withdraw, giveBack, again]);
  });

  it('a version is changed by Finance only while it is a draft or was sent back to them', () => {
    expect(
      (['DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'SUPERSEDED'] as const).filter(isEditable),
    ).toEqual(['DRAFT', 'CHANGES_REQUESTED']);
  });
});

describe('a change to a line of the current budget (US-06-09 AC-17)', () => {
  const line = { amountMinor: 20_000_000n, windowFrom: day('2026-04-01'), windowTo: day('2026-06-30') };

  it.each([
    ['moving the window', { windowFrom: day('2026-06-01'), windowTo: day('2026-08-31') }, 'WINDOW'],
    ['moving only the end', { windowTo: day('2026-08-31') }, 'WINDOW'],
    ['keeping everything', { amountMinor: 20_000_000n, windowFrom: day('2026-04-01') }, 'NONE'],
    ['changing the amount', { amountMinor: 22_000_000n }, 'AMOUNT'],
    [
      'changing the amount and the window: the amount decides',
      { amountMinor: 1n, windowTo: day('2026-08-31') },
      'AMOUNT',
    ],
    ['giving nothing', {}, 'NONE'],
  ] as const)('%s', (_name, change, kind) => {
    expect(kindOfChange(line, change)).toBe(kind);
  });

  it('a line is overdue the day after its window ends', () => {
    expect(isOverdue({ windowTo: day('2026-06-30') }, day('2026-06-30'))).toBe(false);
    expect(isOverdue({ windowTo: day('2026-06-30') }, day('2026-07-01'))).toBe(true);
  });
});

describe('who may decide a version, and when (US-06-11 AC-7, AC-8, SoD-8)', () => {
  const facts = {
    actorIsDecider: true,
    actorHasConflict: false,
    actorEmployeeId: 'c1',
    createdByEmployeeId: 'f1',
    sentByEmployeeId: 'f1' as string | null,
    state: 'SENT' as 'DRAFT' | 'SENT' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED' | 'SUPERSEDED',
  };

  it('is the spending approver, on a version that was sent and is not theirs', () => {
    expect(checkVersionDecision(facts)).toBeNull();
  });

  it('is nobody else, whoever they are, and that is the first thing told', () => {
    expect(checkVersionDecision({ ...facts, actorIsDecider: false })).toBe('NOT_SPENDING_APPROVER');
    expect(checkVersionDecision({ ...facts, actorIsDecider: false, state: 'DRAFT' })).toBe('NOT_SPENDING_APPROVER');
  });

  it('is told apart when the approver is a party and the substitute decides in their place (US-06-08 AC-11)', () => {
    expect(checkVersionDecision({ ...facts, actorIsDecider: false, actorHasConflict: true })).toBe(
      'CONFLICT_OF_INTEREST',
    );
    expect(checkVersionDecision({ ...facts, actorEmployeeId: 's1', actorIsDecider: true })).toBeNull();
  });

  it('is never a version the approver built or sent', () => {
    expect(checkVersionDecision({ ...facts, createdByEmployeeId: 'c1' })).toBe('OWN_VERSION');
    expect(checkVersionDecision({ ...facts, sentByEmployeeId: 'c1' })).toBe('OWN_VERSION');
  });

  it.each(['DRAFT', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'SUPERSEDED'] as const)(
    'is not a version that is %s',
    (state) => {
      expect(checkVersionDecision({ ...facts, state })).toBe('NOT_SENT');
    },
  );
});
