import type { BusinessDate } from '../../../core/business-date';
import {
  adjustmentDeltasOf,
  belowCarriedOver,
  carriedOverShortfall,
  versionAttachmentMissing,
  versionFiguresOf,
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
  versionDecidedDetail,
  proposalIsSucceedable,
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
  it('maps each decision to what the record says and the state the version goes to: approve, or return it to Finance (QĐ-111ad)', () => {
    expect(decisionOutcomeOf('APPROVE')).toEqual({ decision: 'APPROVED', state: 'APPROVED' });
    expect(decisionOutcomeOf('RETURN')).toEqual({ decision: 'CHANGES_REQUESTED', state: 'CHANGES_REQUESTED' });
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

describe('the default reserve of a version (US-06-09 AC-30, QĐ-98)', () => {
  it('is the share of the base rounded to the nearest minor unit', () => {
    expect(defaultReserveOf(1_000_000n, 10)).toBe(100_000n);
    expect(defaultReserveOf(105n, 10)).toBe(11n);
    expect(defaultReserveOf(104n, 10)).toBe(10n);
    expect(defaultReserveOf(500n, 0)).toBe(0n);
  });

  it('asks a reason of a version whose reserve is not the default share of the organization, and of nothing else', () => {
    const version = { baseMinor: 1000n, reserveMinor: 100n, reservePercent: 10, reserveReason: null };

    expect(reserveReasonMissing(version, 10)).toBe(false);
    expect(reserveReasonMissing({ ...version, reserveMinor: 150n }, 10)).toBe(true);
    expect(reserveReasonMissing({ ...version, reserveMinor: 150n, reserveReason: 'Kế hoạch mua thêm' }, 10)).toBe(
      false,
    );
    expect(reserveReasonMissing({ ...version, reserveMinor: 150n, reservePercent: null }, 10)).toBe(false);
  });

  it('compares with the default share of the organization, never with the share the version itself holds: a chosen 15 % against a default of 10 % asks a reason (FIX-LB3 LBG-02)', () => {
    const chosen = { baseMinor: 1000n, reserveMinor: 150n, reservePercent: 15, reserveReason: null };

    expect(reserveReasonMissing(chosen, 10)).toBe(true);
    expect(reserveReasonMissing({ ...chosen, reserveReason: 'Mua thêm vào mùa thu' }, 10)).toBe(false);
    // The reserve that is the default share asks nothing, whatever share the version holds.
    expect(reserveReasonMissing({ ...chosen, reserveMinor: 100n }, 10)).toBe(false);
    // The default of the organization is the one that counts when it is read: a version made at 10 % is not the default once it is 12 %.
    expect(reserveReasonMissing({ ...chosen, reserveMinor: 100n, reservePercent: 10 }, 12)).toBe(true);
    expect(reserveReasonMissing({ ...chosen, reserveMinor: 120n, reservePercent: 12 }, 12)).toBe(false);
  });
});

describe('the figures of a version as Finance gives them (QĐ-111ac, BG-2.5)', () => {
  it('fills the base in with what the Cost Center carries into the year when Finance gives none', () => {
    expect(versionFiguresOf({ carriedOverMinor: 123_000_000n, defaultPercent: 10 })).toEqual({
      baseMinor: 123_000_000n,
      reserveMinor: 12_300_000n,
      reservePercent: 10,
    });
    expect(versionFiguresOf({ baseMinor: 0n, carriedOverMinor: 123_000_000n, defaultPercent: 10 }).baseMinor).toBe(0n);
  });

  it('takes the reserve as a share Finance chooses, or as an amount kept against the default share', () => {
    expect(
      versionFiguresOf({ baseMinor: 1_000n, reservePercent: 15, carriedOverMinor: 0n, defaultPercent: 10 }),
    ).toEqual({
      baseMinor: 1_000n,
      reserveMinor: 150n,
      reservePercent: 15,
    });
    expect(versionFiguresOf({ baseMinor: 1_000n, reserveMinor: 7n, carriedOverMinor: 0n, defaultPercent: 10 })).toEqual(
      {
        baseMinor: 1_000n,
        reserveMinor: 7n,
        reservePercent: 10,
      },
    );
  });

  describe('the red flag: the budget of the department, its base and its reserve, is below what is carried into the year (QĐ-111ac, C-09, QT §4.6)', () => {
    const M = 1_000_000n;

    it('is down when the base alone is below what is carried over but the base and the reserve cover it: 850 + 85 against 900 (FIX-LB3 LBG-01)', () => {
      const version = { baseMinor: 850n * M, reserveMinor: 85n * M };

      expect(belowCarriedOver(version, 900n * M)).toBe(false);
      expect(carriedOverShortfall(version, 900n * M)).toBe(0n);
    });

    it('is up, with the amount that is missing, when the base and the reserve do not cover it: the example of the process, 800 + 80 against 900 is 20 short', () => {
      const version = { baseMinor: 800n * M, reserveMinor: 80n * M };

      expect(belowCarriedOver(version, 900n * M)).toBe(true);
      expect(carriedOverShortfall(version, 900n * M)).toBe(20n * M);
    });

    it('does not count a budget that equals what is carried over, nor one when nothing is carried over', () => {
      expect(belowCarriedOver({ baseMinor: 900n * M, reserveMinor: 0n }, 900n * M)).toBe(false);
      expect(belowCarriedOver({ baseMinor: 899n * M, reserveMinor: 1n * M }, 900n * M)).toBe(false);
      expect(belowCarriedOver({ baseMinor: 0n, reserveMinor: 0n }, 0n)).toBe(false);
      expect(carriedOverShortfall({ baseMinor: 0n, reserveMinor: 0n }, 0n)).toBe(0n);
      expect(belowCarriedOver({ baseMinor: 899n * M, reserveMinor: 0n }, 900n * M)).toBe(true);
      expect(carriedOverShortfall({ baseMinor: 899n * M, reserveMinor: 0n }, 900n * M)).toBe(1n * M);
    });
  });

  it('sends a version only with one file at least that explains it', () => {
    expect(versionAttachmentMissing(0)).toBe(true);
    expect(versionAttachmentMissing(1)).toBe(false);
  });
});

describe('what the approved adjustments add to the base of a Cost Center (AD-1, QĐ-111bh)', () => {
  const A = 'a';
  const B = 'b';
  const C = 'c';

  it('adds to the one that receives, takes from the one that gives, and leaves a Cost Center with no budget out', () => {
    const rows = [
      { fromCostCenterId: A, toCostCenterId: B, amountMinor: 20n, createdVersionId: null },
      { fromCostCenterId: null, toCostCenterId: B, amountMinor: 5n, createdVersionId: null },
      { fromCostCenterId: A, toCostCenterId: null, amountMinor: 3n, createdVersionId: null },
      { fromCostCenterId: null, toCostCenterId: C, amountMinor: 9n, createdVersionId: null },
    ];

    const deltas = adjustmentDeltasOf(
      rows,
      new Map([
        [A, 'va'],
        [B, 'vb'],
      ]),
    );

    expect(deltas.get(A)).toBe(-23n);
    expect(deltas.get(B)).toBe(25n);
    expect(deltas.has(C)).toBe(false);
  });

  it('counts once the adjustment that made the version of the Cost Center: its amount is already the base of that version (R-48)', () => {
    const rows = [
      { fromCostCenterId: A, toCostCenterId: B, amountMinor: 20n, createdVersionId: 'vb' },
      { fromCostCenterId: null, toCostCenterId: B, amountMinor: 5n, createdVersionId: null },
    ];

    const deltas = adjustmentDeltasOf(
      rows,
      new Map([
        [A, 'va'],
        [B, 'vb'],
      ]),
    );

    expect(deltas.get(B)).toBe(5n);
    expect(deltas.get(A)).toBe(-20n);
  });

  it('counts the adjustment that made the version of another Cost Center against the one that gives', () => {
    const rows = [{ fromCostCenterId: A, toCostCenterId: B, amountMinor: 20n, createdVersionId: 'vb' }];

    expect(adjustmentDeltasOf(rows, new Map([[A, 'va']])).get(A)).toBe(-20n);
  });
});
