import {
  canMove,
  closeReasonOfEndedSeat,
  countsInKpi5,
  isReclaimable,
  kpi5Of,
  settlementOf,
  type Kpi5Row,
} from './ghost-seat-state.policy';

describe('ghost seat state policy', () => {
  it('moves a recommendation along OPEN, RECLAIM_DECIDED, CLOSED and back to OPEN when the reclaim closes as failed', () => {
    expect(canMove('OPEN', 'RECLAIM_DECIDED')).toBe(true);
    expect(canMove('RECLAIM_DECIDED', 'OPEN')).toBe(true);
    expect(canMove('RECLAIM_DECIDED', 'CLOSED')).toBe(true);
    expect(canMove('OPEN', 'CLOSED')).toBe(true);
  });

  it('never moves a closed recommendation', () => {
    for (const to of ['OPEN', 'PAUSED', 'RECLAIM_DECIDED', 'CLOSED'] as const)
      expect(canMove('CLOSED', to)).toBe(false);
  });

  it('BR-MF5-01: only an open G2 can be reclaimed by the IT Admin (G1, a decided G2 and a closed one cannot)', () => {
    expect(isReclaimable({ group: 'G2', state: 'OPEN' })).toBe(true);
    expect(isReclaimable({ group: 'G1', state: 'OPEN' })).toBe(false);
    expect(isReclaimable({ group: 'G2', state: 'RECLAIM_DECIDED' })).toBe(false);
    expect(isReclaimable({ group: 'G2', state: 'CLOSED' })).toBe(false);
    expect(isReclaimable({ group: 'G4', state: 'OPEN' })).toBe(false);
  });

  it('closes ACCEPTED when the task carries the reason of the recommendation, SEAT_ENDED otherwise', () => {
    expect(closeReasonOfEndedSeat(true)).toBe('ACCEPTED');
    expect(closeReasonOfEndedSeat(false)).toBe('SEAT_ENDED');
  });

  it('DA6-39: the watch tier of G3/G4 is not in the denominator of KPI-5; G1 and G2 are', () => {
    expect(countsInKpi5({ group: 'G1', tier: null })).toBe(true);
    expect(countsInKpi5({ group: 'G2', tier: 'ACTION' })).toBe(true);
    expect(countsInKpi5({ group: 'G3', tier: 'REVIEW' })).toBe(true);
    expect(countsInKpi5({ group: 'G4', tier: 'MONITOR' })).toBe(false);
  });

  it('KPI-5: 10 made (2 of them in the watch tier), 2 KEPT, 1 NEGATED of the watch tier, 1 SUPERSEDED gives 3 of 8, 37.5 %', () => {
    const open = (group: Kpi5Row['group'], tier: Kpi5Row['tier']): Kpi5Row => ({
      group,
      tier,
      state: 'OPEN',
      closeReason: null,
    });
    const closed = (group: Kpi5Row['group'], tier: Kpi5Row['tier'], closeReason: Kpi5Row['closeReason']): Kpi5Row => ({
      group,
      tier,
      state: 'CLOSED',
      closeReason,
    });
    const rows: Kpi5Row[] = [
      closed('G3', 'REVIEW', 'KEPT'),
      closed('G3', 'ACTION', 'KEPT'),
      closed('G4', 'MONITOR', 'NEGATED'),
      closed('G2', 'ACTION', 'SUPERSEDED'),
      open('G1', null),
      open('G1', null),
      open('G2', 'ACTION'),
      open('G3', 'REVIEW'),
      open('G4', 'ACTION'),
      open('G4', 'MONITOR'),
    ];

    const figure = kpi5Of(rows);

    expect(figure).toMatchObject({ denominator: 8, numerator: 3, ratePercent: 37.5 });
    expect(figure.byGroup.G3).toEqual({ denominator: 3, numerator: 2, ratePercent: 66.7 });
  });

  it('KPI-5: gives no rate when nothing was recommended', () => {
    expect(kpi5Of([])).toEqual({ denominator: 0, numerator: 0, ratePercent: null, byGroup: {} });
  });

  describe('settlement of a recommendation about a seat', () => {
    const decided = { group: 'G2', state: 'RECLAIM_DECIDED' } as const;

    it('DA6-02: a claim of the task (IN_PROGRESS) changes nothing', () => {
      expect(
        settlementOf({
          ...decided,
          seatStillOpen: true,
          task: { status: 'IN_PROGRESS', referencesRecommendation: true },
        }),
      ).toEqual({ kind: 'KEEP' });
    });

    it('closes ACCEPTED when the seat ended and the completed task carries the reason, SEAT_ENDED when it does not', () => {
      expect(
        settlementOf({
          ...decided,
          seatStillOpen: false,
          task: { status: 'COMPLETED', referencesRecommendation: true },
        }),
      ).toEqual({ kind: 'CLOSE', reason: 'ACCEPTED' });
      expect(
        settlementOf({
          ...decided,
          seatStillOpen: false,
          task: { status: 'COMPLETED', referencesRecommendation: false },
        }),
      ).toEqual({ kind: 'CLOSE', reason: 'SEAT_ENDED' });
      expect(settlementOf({ group: 'G2', state: 'OPEN', seatStillOpen: false, task: null })).toEqual({
        kind: 'CLOSE',
        reason: 'SEAT_ENDED',
      });
    });

    it('DA6-27: a K1 seat whose access runs on stays decided until the assignment ends', () => {
      expect(
        settlementOf({
          ...decided,
          seatStillOpen: true,
          task: { status: 'COMPLETED', referencesRecommendation: true },
        }),
      ).toEqual({ kind: 'KEEP' });
    });

    it('US-07-05 AC-15: a G2 whose reclaim was closed as failed is open again; a G4 is left to its own item', () => {
      const failed = { status: 'CLOSED_FAILED', referencesRecommendation: true };

      expect(settlementOf({ ...decided, seatStillOpen: true, task: failed })).toEqual({ kind: 'REOPEN' });
      expect(settlementOf({ group: 'G4', state: 'RECLAIM_DECIDED', seatStillOpen: true, task: failed })).toEqual({
        kind: 'KEEP',
      });
    });

    it('DA6-38: leaves a paused recommendation and a closed one to their owners', () => {
      expect(settlementOf({ group: 'G3', state: 'PAUSED', seatStillOpen: false, task: null })).toEqual({
        kind: 'KEEP',
      });
      expect(settlementOf({ group: 'G2', state: 'CLOSED', seatStillOpen: false, task: null })).toEqual({
        kind: 'KEEP',
      });
    });
  });
});
