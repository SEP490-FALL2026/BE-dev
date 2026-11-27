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

  it('SM1-07: the price of a month is the subscription`s for every seat in it, whatever price a commitment recorded: two seats of one month cost the same', () => {
    const asked = { id: 'c-1', costCenterId: 'cc-a' };
    const { rows } = plan({
      subscriptionMonthlyPriceMinor: 350_000n,
      seats: [
        seat({
          assignmentId: 'seat-a',
          commitment: asked,
          held: { from: '2026-01-01', until: null },
          placements: [{ departmentId: A, from: '2026-01-01', to: null }],
        }),
        seat({
          assignmentId: 'seat-b',
          held: { from: '2026-01-01', until: null },
          placements: [{ departmentId: A, from: '2026-01-01', to: null }],
        }),
      ],
      heldByCommitment: new Map([['c-1', 3_600_000n]]),
    });

    expect(rows.map((row) => [row.assignmentId, row.monthlyPriceMinor, row.amountMinor])).toEqual([
      ['seat-a', 350_000n, 350_000n],
      ['seat-b', 350_000n, 350_000n],
    ]);
  });

  it('leaves the Cost Center empty for a department that has none, so the amount is the line "not allocated to a Cost Center"', () => {
    const { rows } = plan({ costCenterOfDepartment: new Map([[A, 'cc-a']]) });

    expect(rows[1]).toMatchObject({ departmentId: B, costCenterId: null, amountMinor: 77_419n });
  });

  it('takes the commitment of the seat down only by the days of the department whose Cost Center is the commitment`s, never by the new department after the transfer', () => {
    const commitment = { id: 'c-1', costCenterId: 'cc-a' };
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

  it('takes no more than the commitment still holds', () => {
    const commitment = { id: 'c-1', costCenterId: 'cc-a' };
    const { rows, takenByCommitment } = plan({
      seats: [seat({ commitment, placements: [{ departmentId: A, from: '2026-01-01', to: null }] })],
      heldByCommitment: new Map([['c-1', 100_000n]]),
    });

    expect(rows).toMatchObject([{ amountMinor: 400_000n, monthlyPriceMinor: 400_000n, appliedMinor: 100_000n }]);
    expect(takenByCommitment).toEqual(new Map([['c-1', 100_000n]]));
  });

  it('charges the same month again with the same rows and applies nothing more: what a row applied before counts as still held', () => {
    const commitment = { id: 'c-1', costCenterId: 'cc-a' };
    const first = plan({ seats: [seat({ commitment })], heldByCommitment: new Map([['c-1', 1_200_000n]]) });
    const prior: PriorRow[] = first.rows.map((row) => ({
      assignmentId: row.assignmentId,
      departmentId: row.departmentId,
      monthlyPriceMinor: row.monthlyPriceMinor,
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

  it('Q-1: a seat that already has a row for the month keeps the price that row recorded, a seat with none takes the current price', () => {
    const prior: PriorRow[] = [
      { assignmentId: 'seat-old', departmentId: A, appliedMinor: 0n, commitmentId: null, monthlyPriceMinor: 500_000n },
    ];

    const { rows } = plan({
      month: '2026-03-01',
      subscriptionMonthlyPriceMinor: 450_000n,
      seats: [
        seat({
          assignmentId: 'seat-old',
          held: { from: '2026-01-01', until: null },
          placements: [{ departmentId: A, from: '2026-01-01', to: null }],
        }),
        seat({
          assignmentId: 'seat-new',
          held: { from: '2026-01-01', until: null },
          placements: [{ departmentId: A, from: '2026-01-01', to: null }],
        }),
      ],
      prior,
    });

    expect(rows.map((row) => [row.assignmentId, row.monthlyPriceMinor, row.amountMinor])).toEqual([
      ['seat-old', 500_000n, 500_000n],
      ['seat-new', 450_000n, 450_000n],
    ]);
  });

  it('Q-1: the recorded price also holds when the line price of the seat is read again (line price of the plan is not applied to an existing row)', () => {
    const prior: PriorRow[] = [
      { assignmentId: 'seat-1', departmentId: A, appliedMinor: 0n, commitmentId: null, monthlyPriceMinor: 500_000n },
    ];

    const { rows } = plan({
      month: '2026-03-01',
      seats: [
        seat({
          monthlyPriceMinor: 800_000n,
          placements: [{ departmentId: A, from: '2026-01-01', to: null }],
          held: { from: '2026-01-01', until: null },
        }),
      ],
      prior,
    });

    expect(rows).toMatchObject([{ monthlyPriceMinor: 500_000n, amountMinor: 500_000n }]);
  });

  it('SM1-06: when the department no longer bears the commitment the row applies nothing, never the commitment of another Cost Center, and what it applied before is returned', () => {
    const commitment = { id: 'c-1', costCenterId: 'cc-b' };
    const prior: PriorRow[] = [
      {
        assignmentId: 'seat-1',
        departmentId: A,
        monthlyPriceMinor: 400_000n,
        appliedMinor: 322_581n,
        commitmentId: 'c-1',
      },
    ];
    const { rows, takenByCommitment, returned } = plan({
      seats: [seat({ commitment })],
      heldByCommitment: new Map([['c-1', 1_000_000n]]),
      prior,
    });

    expect(rows.map((row) => [row.departmentId, row.appliedMinor])).toEqual([
      [A, 0n],
      [B, 77_419n],
    ]);
    expect(takenByCommitment).toEqual(new Map([['c-1', 77_419n]]));
    expect(returned).toEqual([
      { commitmentId: 'c-1', assignmentId: 'seat-1', departmentId: A, amountMinor: 322_581n, reason: 'RECALCULATED' },
    ]);
  });

  it('SM1-06: a row that is no longer asked (the seat was taken back, or its days moved) returns what it applied, and the same month again returns nothing', () => {
    const commitment = { id: 'c-1', costCenterId: 'cc-a' };
    const prior: PriorRow[] = [
      {
        assignmentId: 'seat-1',
        departmentId: A,
        monthlyPriceMinor: 400_000n,
        appliedMinor: 322_581n,
        commitmentId: 'c-1',
      },
      {
        assignmentId: 'seat-gone',
        departmentId: A,
        monthlyPriceMinor: 400_000n,
        appliedMinor: 100_000n,
        commitmentId: 'c-1',
      },
    ];
    const first = plan({
      seats: [seat({ commitment })],
      heldByCommitment: new Map([['c-1', 500_000n]]),
      prior,
    });

    expect(first.rows.map((row) => [row.assignmentId, row.departmentId, row.appliedMinor])).toEqual([
      ['seat-1', A, 322_581n],
      ['seat-1', B, 0n],
    ]);
    expect(first.returned).toEqual([
      {
        commitmentId: 'c-1',
        assignmentId: 'seat-gone',
        departmentId: A,
        amountMinor: 100_000n,
        reason: 'SEAT_NOT_ASKED',
      },
    ]);
    expect(first.takenByCommitment).toEqual(new Map());
  });

  it('SM1-06: what one row returns is held for the rows after it in the same month, so a recalculation never counts a seat-month twice', () => {
    const commitment = { id: 'c-1', costCenterId: 'cc-a' };
    const prior: PriorRow[] = [
      {
        assignmentId: 'seat-a',
        departmentId: A,
        monthlyPriceMinor: 400_000n,
        appliedMinor: 400_000n,
        commitmentId: 'c-1',
      },
    ];
    const onlyA = [{ departmentId: A, from: '2026-01-01', to: null }];
    const { rows, returned, takenByCommitment } = plan({
      seats: [
        seat({ assignmentId: 'seat-a', commitment: null, placements: onlyA }),
        seat({ assignmentId: 'seat-b', commitment, placements: onlyA }),
      ],
      // The commitment holds nothing now: the 400.000 seat-a applied is the only money it can give seat-b.
      heldByCommitment: new Map([['c-1', 0n]]),
      prior,
    });

    expect(rows.map((row) => [row.assignmentId, row.appliedMinor])).toEqual([
      ['seat-a', 0n],
      ['seat-b', 400_000n],
    ]);
    expect(returned).toEqual([
      { commitmentId: 'c-1', assignmentId: 'seat-a', departmentId: A, amountMinor: 400_000n, reason: 'RECALCULATED' },
    ]);
    expect(takenByCommitment).toEqual(new Map([['c-1', 400_000n]]));
  });

  it('applies what is more than before when the commitment holds more now: 100.000 before and 50.000 held make 150.000, 50.000 more', () => {
    const commitment = { id: 'c-1', costCenterId: 'cc-a' };
    const prior: PriorRow[] = [
      {
        assignmentId: 'seat-1',
        departmentId: A,
        monthlyPriceMinor: 400_000n,
        appliedMinor: 100_000n,
        commitmentId: 'c-1',
      },
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

  it('B2-R7: charges each seat at its own line monthlyPriceMinor when subscription header price is null', () => {
    const { rows } = plan({
      subscriptionMonthlyPriceMinor: null,
      seats: [
        seat({
          assignmentId: 'seat-std',
          planId: 'plan-std',
          monthlyPriceMinor: 500_000n,
          held: { from: '2026-10-01', until: null },
          placements: [{ departmentId: A, from: '2026-10-01', to: null }],
        }),
        seat({
          assignmentId: 'seat-prm',
          planId: 'plan-prm',
          monthlyPriceMinor: 2_500_000n,
          held: { from: '2026-10-01', until: null },
          placements: [{ departmentId: A, from: '2026-10-01', to: null }],
        }),
      ],
    });

    expect(rows.map((row) => [row.assignmentId, row.monthlyPriceMinor, row.amountMinor])).toEqual([
      ['seat-std', 500_000n, 500_000n],
      ['seat-prm', 2_500_000n, 2_500_000n],
    ]);
  });

  describe('W3-07 monthly slice capping', () => {
    it('Ca E: caps appliedMinor at remaining monthly slice (500k) even when commitment total holds 6.000.000', () => {
      const commitment = { id: 'c-1', costCenterId: 'cc-a' };
      const { rows, takenByCommitment } = plan({
        month: '2027-07-01',
        subscriptionMonthlyPriceMinor: 550_000n,
        seats: [
          seat({
            commitment,
            held: { from: '2027-01-01', until: null },
            placements: [{ departmentId: A, from: '2027-01-01', to: null }],
          }),
        ],
        heldByCommitment: new Map([['c-1', 6_000_000n]]),
        monthlySliceByCommitment: new Map([['c-1', 500_000n]]),
      });

      expect(rows[0]).toMatchObject({ amountMinor: 550_000n, appliedMinor: 500_000n });
      expect(takenByCommitment).toEqual(new Map([['c-1', 500_000n]]));
    });

    it('applies 0 when monthly-sliced commitment has no slice for the charged month (null)', () => {
      const commitment = { id: 'c-1', costCenterId: 'cc-a' };
      const { rows, takenByCommitment } = plan({
        seats: [seat({ commitment })],
        heldByCommitment: new Map([['c-1', 2_000_000n]]),
        monthlySliceByCommitment: new Map([['c-1', null]]),
      });

      expect(rows.every((row) => row.appliedMinor === 0n)).toBe(true);
      expect(takenByCommitment).toEqual(new Map());
    });

    it('Ca K / F3: allows prior applied amount to be reduced and returned even when slice remaining is 0 after MONTH_END', () => {
      const commitment = { id: 'c-1', costCenterId: 'cc-a' };
      // The row recorded 450.000; the seat is now held only to 22/03 (22 of 31 days) and the price stays the recorded one (Q-1).
      const { rows, returned, takenByCommitment } = plan({
        month: '2027-03-01',
        subscriptionMonthlyPriceMinor: 350_000n,
        seats: [
          seat({
            commitment,
            held: { from: '2027-01-01', until: '2027-03-23' },
            placements: [{ departmentId: A, from: '2027-01-01', to: null }],
          }),
        ],
        heldByCommitment: new Map([['c-1', 4_500_000n]]),
        monthlySliceByCommitment: new Map([['c-1', 0n]]),
        prior: [
          {
            assignmentId: 'seat-1',
            departmentId: A,
            monthlyPriceMinor: 450_000n,
            appliedMinor: 450_000n,
            commitmentId: 'c-1',
          },
        ],
      });

      expect(rows[0]).toMatchObject({ monthlyPriceMinor: 450_000n, amountMinor: 319_355n, appliedMinor: 319_355n });
      expect(returned).toEqual([
        { commitmentId: 'c-1', assignmentId: 'seat-1', departmentId: A, amountMinor: 130_645n, reason: 'RECALCULATED' },
      ]);
      expect(takenByCommitment).toEqual(new Map());
    });
  });
});
