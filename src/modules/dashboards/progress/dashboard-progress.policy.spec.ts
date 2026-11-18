import { progressOf, type ProgressFacts } from './dashboard-progress.policy';

const facts: ProgressFacts = {
  personnel: {
    calendar: { from: '2026-11-16', to: '2026-11-30' },
    departures: {
      upcoming: 3,
      awaitingRevocation: 2,
      revocationOverdue: 1,
      closedThisMonth: 4,
      itHandoverPending: 1,
      mailboxLockPending: 2,
    },
    transfers: { inGrace: 5, graceEndingSoon: 2, revoking: 1 },
  },
  seats: { returned: 6, reused: 3 },
  plansBelowMinimum: 2,
};

describe('progressOf (SPEC P21)', () => {
  it('counts every number and keeps the zero of a thing that does not exist', () => {
    const progress = progressOf({
      ...facts,
      personnel: {
        ...facts.personnel,
        departures: { ...facts.personnel.departures, closedThisMonth: 0 },
      },
    });

    expect(progress.departures.closedThisMonth).toEqual({
      state: 'COUNTED',
      count: 0,
      sourceOperationId: null,
      reason: null,
    });
  });

  it('gives the calendar window the client reads the rows with', () => {
    expect(progressOf(facts).calendar).toEqual({ from: '2026-11-16', to: '2026-11-30' });
  });

  it('names the departure list only for the two counts the list answers exactly, the others name none', () => {
    const { departures } = progressOf(facts);

    expect(departures.upcoming).toMatchObject({ count: 3, sourceOperationId: 'offboardingCaseList' });
    expect(departures.revocationOverdue).toMatchObject({ count: 1, sourceOperationId: 'offboardingCaseList' });
    for (const other of [
      departures.awaitingRevocation,
      departures.closedThisMonth,
      departures.itHandoverPending,
      departures.mailboxLockPending,
    ]) {
      expect(other.sourceOperationId).toBeNull();
    }
  });

  it('maps the transfers, the seats of the pools and the plans short of admins', () => {
    const progress = progressOf(facts);

    expect(progress.transfers.inGrace.count).toBe(5);
    expect(progress.transfers.graceEndingSoon.count).toBe(2);
    expect(progress.transfers.revoking.count).toBe(1);
    expect(progress.seatsReturned.thisMonth.count).toBe(6);
    expect(progress.seatsReturned.reusedThisMonth.count).toBe(3);
    expect(progress.plansBelowVendorAdminMinimum.count).toBe(2);
  });
});
