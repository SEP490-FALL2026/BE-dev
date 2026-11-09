import type { BusinessDate } from '../../../core/business-date';
import {
  annualCheck,
  defaultReserveOf,
  reserveReasonMissing,
  checkVersionDecision,
  commitmentAttachedAfter,
  decisionOutcomeOf,
  canResubmit,
  canReturn,
  canWithdraw,
  closesAtYearEnd,
  deciderOf,
  isEditable,
  copiedLineOf,
  quartersMismatchAfter,
  patchChangesLine,
  versionDecidedDetail,
  versionLineOverCeiling,
  proposalIsSucceedable,
  quartersMatch,
  totalOf,
  versionSourceOf,
  versionWaitingReason,
  yearEndOfVersion,
  yearHasEnded,
  yearIsOpen,
  type ProposalState,
  type VersionStateName,
} from './budget.policy';

const day = (value: string): BusinessDate => value;

describe('which fiscal years take a proposal (US-06-10 AC-9)', () => {
  it.each([
    ['a year to come', 2027, '2026-06-15', true],
    ['the year that is running', 2026, '2026-06-15', true],
    ['a year that has ended', 2025, '2026-06-15', false],
    ['the last day of a year', 2026, '2026-12-31', true],
    ['the first day after it', 2026, '2027-01-01', false],
  ])('%s', (_name, year, today, open) => {
    expect(yearIsOpen(year, day(today))).toBe(open);
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
      (['DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'SUPERSEDED', 'EXPIRED'] as const).filter(
        (state) => isEditable(state),
      ),
    ).toEqual(['DRAFT', 'CHANGES_REQUESTED']);
  });

  it('a draft that a withdrawn or given-back proposal left behind is detached: it is neither changed nor sent (F36)', () => {
    expect(isEditable('DRAFT', true)).toBe(false);
    expect(isEditable('CHANGES_REQUESTED', true)).toBe(false);
    expect(isEditable('DRAFT', false)).toBe(true);
  });
});

describe('the year that has ended (F62, QĐ-91c)', () => {
  it('has ended once the calendar year after it has begun', () => {
    expect(yearHasEnded(2026, day('2027-01-01'))).toBe(true);
    expect(yearHasEnded(2026, day('2026-12-31'))).toBe(false);
    expect(yearHasEnded(2027, day('2027-04-01'))).toBe(false);
  });

  it('keeps the current version as the reference budget and closes the ones that never became current', () => {
    expect(yearEndOfVersion('APPROVED')).toEqual({ neverCurrent: false });
    expect((['DRAFT', 'SENT', 'CHANGES_REQUESTED'] as const).map((state) => [state, yearEndOfVersion(state)])).toEqual([
      ['DRAFT', { neverCurrent: true }],
      ['SENT', { neverCurrent: true }],
      ['CHANGES_REQUESTED', { neverCurrent: true }],
    ]);
    expect((['REJECTED', 'SUPERSEDED', 'EXPIRED'] as const).map((state) => yearEndOfVersion(state))).toEqual([
      null,
      null,
      null,
    ]);
  });

  it('closes the proposal that was sent or given back and never used, and no other', () => {
    const states: ProposalState[] = ['SUBMITTED', 'WITHDRAWN', 'RETURNED', 'REVIEWED', 'CLOSED_FISCAL_YEAR_ENDED'];

    expect(states.filter(closesAtYearEnd)).toEqual(['SUBMITTED', 'RETURNED']);
  });
});

describe('who decides a version (US-06-11 AC-12, QĐ-93d(1))', () => {
  it('is the spending approver, and nobody in their place', () => {
    expect(deciderOf('approver', 'head')).toEqual({ employeeId: 'approver', approverIsParty: false });
    expect(deciderOf('approver', null)).toEqual({ employeeId: 'approver', approverIsParty: false });
  });

  it('is nobody when the approver sent the proposal behind the version: no substitute takes the place (data of before QĐ-93)', () => {
    expect(deciderOf('approver', 'approver')).toEqual({ employeeId: null, approverIsParty: true });
  });

  it('is nobody while the role that decides has no holder', () => {
    expect(deciderOf(null, 'head')).toEqual({ employeeId: null, approverIsParty: false });
  });
});

describe('what a version waits for (US-06-11 AC-12)', () => {
  it('waits for the spending approver when it was sent and nobody who works holds the role', () => {
    expect(versionWaitingReason('SENT', null)).toBe('NO_SPENDING_APPROVER');
  });

  it('waits for nothing when somebody holds the role, or when it is not waiting for a decision', () => {
    expect(versionWaitingReason('SENT', 'approver')).toBeNull();
    for (const state of ['DRAFT', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED', 'SUPERSEDED', 'EXPIRED'] as const) {
      expect(versionWaitingReason(state, null)).toBeNull();
    }
  });
});

describe('a version made from a proposal that a refusal left reviewed, and a successor of it (F63, spec J.1)', () => {
  const reviewed = { state: 'REVIEWED', succeededAt: null } as const;
  const sources = (state: ProposalState, succeededAt: Date | null, latest: VersionStateName | null) =>
    versionSourceOf({ state, succeededAt }, latest);

  it('is the first version of a proposal that waits, whatever else is there', () => {
    expect(sources('SUBMITTED', null, null)).toBe('FIRST');
    expect(sources('SUBMITTED', null, 'DRAFT')).toBe('FIRST');
  });

  it('is made again from a reviewed proposal only when the latest version made from it was refused and nobody follows it', () => {
    expect(versionSourceOf(reviewed, 'REJECTED')).toBe('AFTER_REFUSAL');
    expect(versionSourceOf(reviewed, 'CHANGES_REQUESTED')).toBeNull();
    expect(versionSourceOf(reviewed, 'APPROVED')).toBeNull();
    expect(versionSourceOf(reviewed, null)).toBeNull();
    expect(sources('REVIEWED', new Date(), 'REJECTED')).toBeNull();
  });

  it.each(['WITHDRAWN', 'RETURNED', 'CLOSED_FISCAL_YEAR_ENDED'] as const)(
    'is not made from a proposal that is %s',
    (state) => {
      expect(sources(state, null, 'REJECTED')).toBeNull();
    },
  );

  it('a proposal is followed by a new one only while it is reviewed, has no successor and its latest version was refused', () => {
    expect(proposalIsSucceedable(reviewed, 'REJECTED')).toBe(true);
    expect(proposalIsSucceedable({ ...reviewed, succeededAt: new Date() }, 'REJECTED')).toBe(false);
    expect(proposalIsSucceedable(reviewed, 'DRAFT')).toBe(false);
    expect(proposalIsSucceedable({ state: 'SUBMITTED', succeededAt: null }, 'REJECTED')).toBe(false);
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

  it('is told apart when the approver is a party to the version: nobody decides it, and they are refused as the party (SoD-8)', () => {
    expect(checkVersionDecision({ ...facts, actorIsDecider: false, actorHasConflict: true })).toBe(
      'CONFLICT_OF_INTEREST',
    );
    expect(checkVersionDecision({ ...facts, actorEmployeeId: 's1', actorIsDecider: false })).toBe(
      'NOT_SPENDING_APPROVER',
    );
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

describe('what the decision of the spending approver on a version of a budget records (US-06-11, F63)', () => {
  it('maps each decision to what the record says and the state the version goes to', () => {
    expect(decisionOutcomeOf('APPROVE')).toEqual({ decision: 'APPROVED', state: 'APPROVED' });
    expect(decisionOutcomeOf('REJECT')).toEqual({ decision: 'REJECTED', state: 'REJECTED' });
    expect(decisionOutcomeOf('REQUEST_CHANGES')).toEqual({ decision: 'CHANGES_REQUESTED', state: 'CHANGES_REQUESTED' });
  });

  const version = { costCenterId: 'cc-1', year: 2027, totalMinor: 5_000n };

  it('says what the version was and what it replaced, the amounts as text, and the reason when one was given', () => {
    expect(versionDecidedDetail(version, { totalMinor: 4_000n }, 'Vượt kế hoạch')).toEqual({
      costCenterId: 'cc-1',
      year: 2027,
      totalMinor: '5000',
      previousTotalMinor: '4000',
      reason: 'Vượt kế hoạch',
    });
  });

  it('has no previous total when nothing was replaced, and no reason when none was given', () => {
    const detail = versionDecidedDetail(version, undefined, undefined);

    expect(detail).toEqual({ costCenterId: 'cc-1', year: 2027, totalMinor: '5000', previousTotalMinor: null });
    expect(detail).not.toHaveProperty('reason');
  });

  it('says of a commitment that was attached to the approved version which request it is for and how much, as text', () => {
    expect(
      commitmentAttachedAfter({ requestId: 'req-1', amountMinor: 700n }, { versionId: 'v-1', ...version }),
    ).toEqual({
      requestId: 'req-1',
      versionId: 'v-1',
      costCenterId: 'cc-1',
      year: 2027,
      amountMinor: '700',
    });
  });
});

describe('whether an adjustment changes what the line of the proposal said (US-06-09 AC-14)', () => {
  const line = {
    description: 'Giấy phép',
    planId: 'plan-1' as string | null,
    seats: 10 as number | null,
    amountMinor: 1_000n,
    lineType: 'RENEW' as const,
  };

  it('changes nothing when the patch gives nothing, or gives what the line already says', () => {
    expect(patchChangesLine(line, {})).toBe(false);
    expect(patchChangesLine(line, { description: 'Giấy phép', seats: 10, amountMinor: 1_000n })).toBe(false);
    expect(patchChangesLine(line, { planId: undefined })).toBe(false);
  });

  it.each([
    ['its words', { description: 'Giấy phép mới' }],
    ['its plan', { planId: 'plan-2' }],
    ['its plan, cleared', { planId: null }],
    ['its seats', { seats: 12 }],
    ['its money', { amountMinor: 1_100n }],
    ['its kind', { lineType: 'CHANGE' as const }],
  ])('changes the line when the patch changes %s', (_label, patch) => {
    expect(patchChangesLine(line, patch)).toBe(true);
  });
});

describe('what a version copies from the line before it, and whether an edit keeps the quarters honest (US-06-09, QĐ-82e)', () => {
  const line = {
    description: 'Giấy phép',
    planId: 'plan-1',
    seats: 10,
    amountMinor: 1_000n,
    financeComment: 'đã có',
    adjustmentReason: 'đổi giá',
    lineType: 'CHANGE' as const,
    zbb: null,
    priorityRank: 2,
  };

  it('copies the line with where it came from, and starts it without a comment of Finance or a reason to adjust it', () => {
    expect(copiedLineOf(line, { proposalId: 'prop-1', proposalPosition: 3 })).toEqual({
      proposalId: 'prop-1',
      proposalPosition: 3,
      description: 'Giấy phép',
      planId: 'plan-1',
      seats: 10,
      amountMinor: 1_000n,
      financeComment: null,
      adjustmentReason: null,
      lineType: 'CHANGE',
      zbb: null,
      priorityRank: 2,
    });
  });

  const version = {
    baseMinor: 800n,
    reserveMinor: 200n,
    quarters: [250n, 250n, 250n, 250n] as [bigint, bigint, bigint, bigint] | null,
  };

  it('is honest while the quarters add up to the base and the reserve, as they are after the edit', () => {
    expect(quartersMismatchAfter(version, {})).toBe(false);
    expect(quartersMismatchAfter(version, { baseMinor: 900n, quarters: [300n, 300n, 300n, 200n] })).toBe(false);
  });

  it('refuses an edit that moves the total and leaves the quarters, or sets quarters that do not add up', () => {
    expect(quartersMismatchAfter(version, { baseMinor: 900n })).toBe(true);
    expect(quartersMismatchAfter(version, { quarters: [1n, 1n, 1n, 1n] })).toBe(true);
  });

  it('has nothing to keep honest when there are no quarters, or when the edit takes them away', () => {
    expect(quartersMismatchAfter({ ...version, quarters: null }, { baseMinor: 5n })).toBe(false);
    expect(quartersMismatchAfter(version, { baseMinor: 5n, quarters: null })).toBe(false);
  });
});

describe('the default reserve of a version (US-06-09 AC-30, QĐ-98)', () => {
  it('is the share of the base rounded to the nearest minor unit', () => {
    expect(defaultReserveOf(1_000_000n, 10)).toBe(100_000n);
    expect(defaultReserveOf(105n, 10)).toBe(11n);
    expect(defaultReserveOf(104n, 10)).toBe(10n);
    expect(defaultReserveOf(500n, 0)).toBe(0n);
  });

  it('asks a reason only of a version that kept its share and differs from it', () => {
    const version = { baseMinor: 1000n, reserveMinor: 100n, reservePercent: 10, reserveReason: null };

    expect(reserveReasonMissing(version)).toBe(false);
    expect(reserveReasonMissing({ ...version, reserveMinor: 150n })).toBe(true);
    expect(reserveReasonMissing({ ...version, reserveMinor: 150n, reserveReason: 'Kế hoạch mua thêm' })).toBe(false);
    expect(reserveReasonMissing({ ...version, reserveMinor: 150n, reservePercent: null })).toBe(false);
  });
});

describe('the annual check of the versions of a year (R-I06, QĐ-103i)', () => {
  const version = (costCenterId: string, number: number, total: bigint, currency = 'VND') => ({
    id: `${costCenterId}-${number}`,
    costCenterId,
    number,
    baseMinor: total - 10n,
    reserveMinor: 10n,
    currency,
  });
  const base = { cycleCurrency: 'VND', availableMinor: 100n };

  it('adds up the newest counted version of each Cost Center and the one being sent', () => {
    const counted = [version('a', 1, 30n), version('a', 2, 40n), version('b', 1, 20n)];

    expect(annualCheck({ ...base, counted, sending: version('c', 1, 40n) })).toEqual({ kind: 'OK', totalMinor: 100n });
  });

  it('puts the version being sent in the place of the counted one of its own Cost Center', () => {
    const counted = [version('a', 3, 90n), version('b', 1, 10n)];

    expect(annualCheck({ ...base, counted, sending: version('a', 4, 50n) })).toEqual({ kind: 'OK', totalMinor: 60n });
  });

  it('says by how much the versions go over, and how little is enough to be over', () => {
    expect(annualCheck({ ...base, counted: [version('a', 1, 60n)], sending: version('b', 1, 41n) })).toEqual({
      kind: 'OVER',
      gapMinor: 1n,
    });
  });

  it('names a version that is not in the currency of the cycle instead of adding it up', () => {
    expect(annualCheck({ ...base, counted: [version('a', 1, 10n, 'USD')], sending: version('b', 1, 10n) })).toEqual({
      kind: 'CURRENCY',
      currency: 'USD',
    });
  });
});

describe('G5-05 the over-the-ceiling flag a version line shows (AC-20, QĐ-109c)', () => {
  const line = (
    patch: Partial<{ lineType: 'RENEW' | 'CHANGE' | 'NEW' | 'CANCEL'; adjustmentReason: string | null }> = {},
  ) => ({
    lineType: 'NEW' as const,
    adjustmentReason: null,
    ...patch,
  });

  it('is the B3 flag of the proposal line while the version line is that line as it was', () => {
    expect(versionLineOverCeiling(line(), 30_000_000n)).toBe(30_000_000n);
    expect(versionLineOverCeiling(line(), null)).toBeNull();
  });

  it('is none once Finance changed the line (an adjustment reason) or made it a Cancel line', () => {
    expect(versionLineOverCeiling(line({ adjustmentReason: 'Cut to 0' }), 30_000_000n)).toBeNull();
    expect(versionLineOverCeiling(line({ lineType: 'CANCEL', adjustmentReason: 'Dropped' }), 30_000_000n)).toBeNull();
    expect(versionLineOverCeiling(line({ lineType: 'CANCEL' }), 30_000_000n)).toBeNull();
  });
});
