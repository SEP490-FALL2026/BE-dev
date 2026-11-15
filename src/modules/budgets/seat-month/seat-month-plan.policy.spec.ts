import { planSeatMonth, type PriorRow, type SeatToCharge } from './seat-month-plan.policy';

const A = 'dept-a';
const B = 'dept-b';
const CC = new Map([
  [A, 'cc-a'],
  [B, 'cc-b'],
]);

const seat = (over: Partial<SeatToCharge> = {}): SeatToCharge => ({
  assignmentId: 'seat-1',
  employeeId: 'emp-1',
  fixedDepartmentId: null,
  held: { from: '2026-03-01', until: null },
  placements: [
    { departmentId: A, from: '2026-01-01', to: '2026-10-26' },
    { departmentId: B, from: '2026-10-26', to: null },
  ],
  commitment: null,
  ...over,
});
const plan = (over: Partial<Parameters<typeof planSeatMonth>[0]> = {}) =>
  planSeatMonth({
    month: '2026-10-01',
    subscriptionMonthlyPriceMinor: 400_000n,
    seats: [seat()],
    costCenterOfDepartment: CC,
    heldByCommitment: new Map(),
    prior: [],
    ...over,
  });

describe('the plan of a month of a subscription (SM-1.4; T-SM1)', () => {
  it('T-SM1: a seat moved on 26/10/2026 is two rows, 25/31 for the old department and 6/31 for the new one, each with its Cost Center', () => {
    const { rows } = plan();

    expect(rows.map((row) => [row.departmentId, row.costCenterId, row.days, row.amountMinor])).toEqual([
      [A, 'cc-a', 25, 322_581n],
      [B, 'cc-b', 6, 77_419n],
    ]);
  });

  it('leaves the Cost Center empty for a department that has none, so the amount is the line "not allocated to a Cost Center"', () => {
    const { rows } = plan({ costCenterOfDepartment: new Map([[A, 'cc-a']]) });

    expect(rows[1]).toMatchObject({ departmentId: B, costCenterId: null, amountMinor: 77_419n });
  });

  it('takes the commitment of the seat down only by the days of the department whose Cost Center is the commitment`s, never by the new department after the transfer', () => {
    const commitment = { id: 'c-1', costCenterId: 'cc-a', seatMonthlyMinor: 400_000n };
    const { rows, takenByCommitment } = plan({
      seats: [seat({ commitment })],
      heldByCommitment: new Map([['c-1', 1_200_000n]]),
    });

    expect(rows.map((row) => [row.departmentId, row.appliedMinor, row.commitmentId])).toEqual([
      [A, 322_581n, 'c-1'],
      [B, 0n, null],
    ]);
    expect(takenByCommitment).toEqual(new Map([['c-1', 322_581n]]));
  });

  it('takes no more than the commitment still holds, and uses the price on the commitment before the price of the subscription', () => {
    const commitment = { id: 'c-1', costCenterId: 'cc-a', seatMonthlyMinor: 300_000n };
    const { rows, takenByCommitment } = plan({
      seats: [seat({ commitment, placements: [{ departmentId: A, from: '2026-01-01', to: null }] })],
      heldByCommitment: new Map([['c-1', 100_000n]]),
    });

    expect(rows).toMatchObject([{ amountMinor: 300_000n, monthlyPriceMinor: 300_000n, appliedMinor: 100_000n }]);
    expect(takenByCommitment).toEqual(new Map([['c-1', 100_000n]]));
  });

  it('charges the same month again with the same rows and applies nothing more: what a row applied before counts as still held', () => {
    const commitment = { id: 'c-1', costCenterId: 'cc-a', seatMonthlyMinor: null };
    const first = plan({ seats: [seat({ commitment })], heldByCommitment: new Map([['c-1', 1_200_000n]]) });
    const prior: PriorRow[] = first.rows.map((row) => ({
      assignmentId: row.assignmentId,
      departmentId: row.departmentId,
      appliedMinor: row.appliedMinor,
      commitmentId: row.commitmentId,
    }));

    // After the first pass the commitment holds 1.200.000 - 322.581.
    const again = plan({
      seats: [seat({ commitment })],
      heldByCommitment: new Map([['c-1', 1_200_000n - 322_581n]]),
      prior,
    });

    expect(again.rows).toEqual(first.rows);
    expect(again.takenByCommitment).toEqual(new Map());
  });

  it('never applies less than a row applied before, even when its department no longer bears the commitment (an expense does not come back)', () => {
    const commitment = { id: 'c-1', costCenterId: 'cc-b', seatMonthlyMinor: 400_000n };
    const prior: PriorRow[] = [
      { assignmentId: 'seat-1', departmentId: A, appliedMinor: 322_581n, commitmentId: 'c-1' },
    ];
    const { rows, takenByCommitment } = plan({
      seats: [seat({ commitment })],
      heldByCommitment: new Map([['c-1', 1_000_000n]]),
      prior,
    });

    expect(rows.map((row) => [row.departmentId, row.appliedMinor])).toEqual([
      [A, 322_581n],
      [B, 77_419n],
    ]);
    expect(takenByCommitment).toEqual(new Map([['c-1', 77_419n]]));
  });

  it('applies what is more than before when the commitment holds more now: 100.000 before and 50.000 held make 150.000, 50.000 more', () => {
    const commitment = { id: 'c-1', costCenterId: 'cc-a', seatMonthlyMinor: 400_000n };
    const prior: PriorRow[] = [
      { assignmentId: 'seat-1', departmentId: A, appliedMinor: 100_000n, commitmentId: 'c-1' },
    ];
    const { rows, takenByCommitment } = plan({
      seats: [seat({ commitment })],
      heldByCommitment: new Map([['c-1', 50_000n]]),
      prior,
    });

    expect(rows[0]).toMatchObject({ departmentId: A, appliedMinor: 150_000n });
    expect(takenByCommitment).toEqual(new Map([['c-1', 50_000n]]));
  });

  it('gives a seat with no price at all no row: its days fall to the pool line', () => {
    expect(plan({ subscriptionMonthlyPriceMinor: null }).rows).toEqual([]);
  });

  it('charges a service account to the department that owns it for every day', () => {
    const { rows } = plan({ seats: [seat({ fixedDepartmentId: B })] });

    expect(rows).toMatchObject([{ departmentId: B, days: 31, amountMinor: 400_000n }]);
  });
});
