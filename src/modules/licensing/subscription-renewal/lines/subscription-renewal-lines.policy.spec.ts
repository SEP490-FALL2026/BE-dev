import {
  computeLineTargets,
  deriveChoiceFromTotals,
  lineAdjustmentLabelOf,
  lineNeedOf,
  lineTargetOf,
  shortfallOf,
  validateOutcomeLines,
  validateProposeLines,
  type LineNeedInputs,
} from './subscription-renewal-lines.policy';

function makeLine(extra: Partial<LineNeedInputs> = {}): LineNeedInputs {
  return {
    subscriptionLineId: 'line-std',
    planId: 'plan-std',
    seatsToday: 12,
    seatsAtDeadline: 12,
    minimumSeats: null,
    heldPastRenewal: 11,
    pendingContinuations: 0,
    approvedAwaitingGrantForLine: 0,
    ...extra,
  };
}

describe('subscription-renewal-lines.policy (W3-21 per-line target, shortfall, R-LATE)', () => {
  it('computes line need, target, and shortfall accurately (including all-zero cancel safety)', () => {
    expect(lineNeedOf({ heldPastRenewal: 8, pendingContinuations: 2, approvedAwaitingGrantForLine: 1 })).toBe(11);
    expect(lineTargetOf(0, 5)).toBe(0);
    expect(lineTargetOf(3, 5)).toBe(5);
    expect(lineTargetOf(11, 5)).toBe(11);
    expect(shortfallOf([0, 0], 10)).toBe(0);
    expect(shortfallOf([4, 0], 5)).toBe(1);
    expect(shortfallOf([11, 2], 5)).toBe(0);
  });

  const CASES: {
    name: string;
    lines: LineNeedInputs[];
    minimumSeatsTotal: number | null;
    commitment: 'MONTHLY' | 'ANNUAL';
    deadline: string;
    today: string;
    proposed: { subscriptionLineId: string; quantity: number }[];
    holder?: string;
    holderNote?: string;
    note?: string;
    expectedProblem: string | null;
    expectedTarget?: number[];
    expectedShortfall?: number;
    expectedChoice?: string;
    expectedDetailsLineMinimum?: number;
  }[] = [
    {
      name: '2A-1: Standard 11, Premium 2, minTotal 5 -> exact proposal (11, 2) accepted as REDUCE 13',
      lines: [
        makeLine({ subscriptionLineId: 'line-std', seatsToday: 12, heldPastRenewal: 11 }),
        makeLine({ subscriptionLineId: 'line-prm', planId: 'plan-prm', seatsToday: 2, heldPastRenewal: 2 }),
      ],
      minimumSeatsTotal: 5,
      commitment: 'ANNUAL',
      deadline: '2027-06-01',
      today: '2027-05-02',
      proposed: [
        { subscriptionLineId: 'line-std', quantity: 11 },
        { subscriptionLineId: 'line-prm', quantity: 2 },
      ],
      expectedProblem: null,
      expectedTarget: [11, 2],
      expectedShortfall: 0,
      expectedChoice: 'REDUCE',
    },
    {
      name: '2A-2: Proposal (12, 2) before deadline fails LINE_QUANTITY_NOT_TARGET',
      lines: [
        makeLine({ subscriptionLineId: 'line-std', seatsToday: 12, heldPastRenewal: 11 }),
        makeLine({ subscriptionLineId: 'line-prm', planId: 'plan-prm', seatsToday: 2, heldPastRenewal: 2 }),
      ],
      minimumSeatsTotal: 5,
      commitment: 'ANNUAL',
      deadline: '2027-06-01',
      today: '2027-05-02',
      proposed: [
        { subscriptionLineId: 'line-std', quantity: 12 },
        { subscriptionLineId: 'line-prm', quantity: 2 },
      ],
      expectedProblem: 'LINE_QUANTITY_NOT_TARGET',
    },
    {
      name: 'R-LATE refuse: after deadline proposal 11 < seats(deadline)=12 returns REDUCTION_AFTER_DEADLINE minimum 12',
      lines: [
        makeLine({ subscriptionLineId: 'line-std', seatsToday: 12, seatsAtDeadline: 12, heldPastRenewal: 11 }),
        makeLine({
          subscriptionLineId: 'line-prm',
          planId: 'plan-prm',
          seatsToday: 2,
          seatsAtDeadline: 2,
          heldPastRenewal: 2,
        }),
      ],
      minimumSeatsTotal: 5,
      commitment: 'ANNUAL',
      deadline: '2027-06-01',
      today: '2027-06-05',
      proposed: [
        { subscriptionLineId: 'line-std', quantity: 11 },
        { subscriptionLineId: 'line-prm', quantity: 2 },
      ],
      expectedProblem: 'REDUCTION_AFTER_DEADLINE',
      expectedDetailsLineMinimum: 12,
    },
    {
      name: 'R-LATE allow keep: after deadline proposal (12, 2) matching seats(deadline) succeeds as RENEW',
      lines: [
        makeLine({ subscriptionLineId: 'line-std', seatsToday: 12, seatsAtDeadline: 12, heldPastRenewal: 11 }),
        makeLine({
          subscriptionLineId: 'line-prm',
          planId: 'plan-prm',
          seatsToday: 2,
          seatsAtDeadline: 2,
          heldPastRenewal: 2,
        }),
      ],
      minimumSeatsTotal: 5,
      commitment: 'ANNUAL',
      deadline: '2027-06-01',
      today: '2027-06-05',
      proposed: [
        { subscriptionLineId: 'line-std', quantity: 12 },
        { subscriptionLineId: 'line-prm', quantity: 2 },
      ],
      expectedProblem: null,
      expectedChoice: 'RENEW',
    },
    {
      name: 'R-LATE allow increase: after deadline proposal (13, 2) > seats(deadline) succeeds as INCREASE',
      lines: [
        makeLine({ subscriptionLineId: 'line-std', seatsToday: 12, seatsAtDeadline: 12, heldPastRenewal: 11 }),
        makeLine({
          subscriptionLineId: 'line-prm',
          planId: 'plan-prm',
          seatsToday: 2,
          seatsAtDeadline: 2,
          heldPastRenewal: 2,
        }),
      ],
      minimumSeatsTotal: 5,
      commitment: 'ANNUAL',
      deadline: '2027-06-01',
      today: '2027-06-05',
      proposed: [
        { subscriptionLineId: 'line-std', quantity: 13 },
        { subscriptionLineId: 'line-prm', quantity: 2 },
      ],
      expectedProblem: null,
      expectedChoice: 'INCREASE',
    },
    {
      name: '2D: target (4, 0), minTotal 5 -> shortfall 1, holder=Standard gets 5, Premium 0',
      lines: [
        makeLine({ subscriptionLineId: 'line-std', seatsToday: 10, heldPastRenewal: 4 }),
        makeLine({ subscriptionLineId: 'line-prm', planId: 'plan-prm', seatsToday: 2, heldPastRenewal: 0 }),
      ],
      minimumSeatsTotal: 5,
      commitment: 'ANNUAL',
      deadline: '2027-06-01',
      today: '2027-05-02',
      proposed: [
        { subscriptionLineId: 'line-std', quantity: 5 },
        { subscriptionLineId: 'line-prm', quantity: 0 },
      ],
      holder: 'line-std',
      holderNote: 'Vendor minimum total 5 seats',
      expectedProblem: null,
      expectedTarget: [4, 0],
      expectedShortfall: 1,
      expectedChoice: 'REDUCE',
    },
    {
      name: '2D missing evidence: shortfall > 0 without holder/note refuses VENDOR_MINIMUM_EVIDENCE_REQUIRED',
      lines: [
        makeLine({ subscriptionLineId: 'line-std', seatsToday: 10, heldPastRenewal: 4 }),
        makeLine({ subscriptionLineId: 'line-prm', planId: 'plan-prm', seatsToday: 2, heldPastRenewal: 0 }),
      ],
      minimumSeatsTotal: 5,
      commitment: 'ANNUAL',
      deadline: '2027-06-01',
      today: '2027-05-02',
      proposed: [
        { subscriptionLineId: 'line-std', quantity: 5 },
        { subscriptionLineId: 'line-prm', quantity: 0 },
      ],
      expectedProblem: 'VENDOR_MINIMUM_EVIDENCE_REQUIRED',
    },
    {
      name: '2E: approved request awaiting grant routed via chooseLine raises Premium target from 2 to 3',
      lines: [
        makeLine({ subscriptionLineId: 'line-std', seatsToday: 12, heldPastRenewal: 11 }),
        makeLine({
          subscriptionLineId: 'line-prm',
          planId: 'plan-prm',
          seatsToday: 2,
          heldPastRenewal: 2,
          approvedAwaitingGrantForLine: 1,
        }),
      ],
      minimumSeatsTotal: 5,
      commitment: 'ANNUAL',
      deadline: '2027-06-01',
      today: '2027-05-02',
      proposed: [
        { subscriptionLineId: 'line-std', quantity: 11 },
        { subscriptionLineId: 'line-prm', quantity: 3 },
      ],
      expectedProblem: null,
      expectedTarget: [11, 3],
      expectedChoice: 'RENEW',
    },
    {
      name: 'Line minimum_seats raises target above need and requires evidence note',
      lines: [makeLine({ subscriptionLineId: 'line-std', seatsToday: 5, heldPastRenewal: 2, minimumSeats: 4 })],
      minimumSeatsTotal: null,
      commitment: 'MONTHLY',
      deadline: '2027-06-01',
      today: '2027-05-28',
      proposed: [{ subscriptionLineId: 'line-std', quantity: 4 }],
      note: '   ',
      expectedProblem: 'VENDOR_MINIMUM_EVIDENCE_REQUIRED',
    },
    {
      name: 'Monthly plan past deadline still checks target (R-LATE applies to 12-month commitment only)',
      lines: [makeLine({ subscriptionLineId: 'line-std', seatsToday: 5, seatsAtDeadline: 5, heldPastRenewal: 3 })],
      minimumSeatsTotal: null,
      commitment: 'MONTHLY',
      deadline: '2027-06-01',
      today: '2027-06-02',
      proposed: [{ subscriptionLineId: 'line-std', quantity: 3 }],
      expectedProblem: null,
      expectedChoice: 'REDUCE',
    },
  ];

  it.each(CASES)('$name', (tc) => {
    const computed = computeLineTargets(tc.lines, tc.minimumSeatsTotal);
    if (tc.expectedTarget) expect(computed.lines.map((l) => l.target)).toEqual(tc.expectedTarget);
    if (tc.expectedShortfall !== undefined) expect(computed.shortfall).toBe(tc.expectedShortfall);

    const verdict = validateProposeLines({
      targets: computed.lines,
      shortfall: computed.shortfall,
      adjustment: { commitment: tc.commitment, deadline: tc.deadline },
      today: tc.today,
      proposedLines: tc.proposed,
      minimumTotalHolderLineId: tc.holder,
      minimumTotalNote: tc.holderNote,
      note: tc.note,
    });

    if (tc.expectedProblem === null) {
      expect('accepted' in verdict).toBe(true);
      if ('accepted' in verdict && tc.expectedChoice) {
        expect(verdict.accepted.choice).toBe(tc.expectedChoice);
      }
    } else {
      expect('refusal' in verdict).toBe(true);
      if ('refusal' in verdict) {
        expect(verdict.refusal.problem).toBe(tc.expectedProblem);
        if (tc.expectedDetailsLineMinimum !== undefined) {
          expect(verdict.refusal.details).toEqual({
            lines: [{ subscriptionLineId: 'line-std', minimum: tc.expectedDetailsLineMinimum }],
          });
        }
      }
    }
  });

  it('validates outcome lines against proposed lines and derives adjustment labels', () => {
    const mismatch = validateOutcomeLines(
      new Map([
        ['line-std', 11],
        ['line-prm', 2],
      ]),
      [
        { subscriptionLineId: 'line-std', quantity: 11 },
        { subscriptionLineId: 'line-prm', quantity: 3 },
      ],
    );
    expect(mismatch?.problem).toBe('QUANTITY_INVALID');
    expect(mismatch?.details).toEqual({
      lines: [{ subscriptionLineId: 'line-prm', proposed: 2, quantity: 3 }],
    });

    expect(deriveChoiceFromTotals(0, 5)).toEqual({ choice: 'CANCEL', quantity: null });
    expect(lineAdjustmentLabelOf({ point: '2027-05-02', deadline: '2027-06-01' }, '2027-05-10', 12, 11)).toBe(
      'REDUCIBLE',
    );
    expect(lineAdjustmentLabelOf({ point: '2027-05-02', deadline: '2027-06-01' }, '2027-06-05', 12, 11)).toBe(
      'LOCKED_UNTIL',
    );
    expect(lineAdjustmentLabelOf({ point: '2027-05-02', deadline: '2027-06-01' }, '2027-05-10', 11, 11)).toBeNull();
  });

  it('F-13 Ca 2D: adds shortfall to lineDecisions.target on minimumTotalHolderLineId so vendor-forced seat is not counted as missed (KPI-4 / label 1)', () => {
    const computed = computeLineTargets(
      [
        makeLine({ subscriptionLineId: 'line-std', seatsToday: 10, heldPastRenewal: 4 }),
        makeLine({ subscriptionLineId: 'line-prm', planId: 'plan-prm', seatsToday: 2, heldPastRenewal: 0 }),
      ],
      5,
    );
    const verdict = validateProposeLines({
      targets: computed.lines,
      shortfall: computed.shortfall,
      adjustment: { commitment: 'ANNUAL', deadline: '2027-06-01' },
      today: '2027-05-02',
      proposedLines: [
        { subscriptionLineId: 'line-std', quantity: 5 },
        { subscriptionLineId: 'line-prm', quantity: 0 },
      ],
      minimumTotalHolderLineId: 'line-std',
      minimumTotalNote: 'Vendor minimum total 5 seats',
    });

    expect('accepted' in verdict).toBe(true);
    if ('accepted' in verdict) {
      expect(verdict.accepted.lineDecisions).toEqual([
        { subscriptionLineId: 'line-std', seatsNeeded: 4, target: 5, recordedQuantity: 5 },
        { subscriptionLineId: 'line-prm', seatsNeeded: 0, target: 0, recordedQuantity: 0 },
      ]);
    }
  });
});
