import { randomUUID } from 'node:crypto';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { SeatMonthRepo, type NewSeatMonthCharge } from '../../../src/modules/budgets/seat-month/seat-month.repo';
import { BudgetHarness } from '../../support/budget-harness';

const h = new BudgetHarness();

describe('the table of seat-months keeps one row for a seat, a month and a department (SM-1.2)', () => {
  let organizationId: string;
  let repo: SeatMonthRepo;
  let runner: TransactionRunner;

  beforeAll(async () => {
    await h.start();
    organizationId = (await h.ctx.sql.query<{ id: string }>(`SELECT id FROM organizations LIMIT 1`)).rows[0].id;
    repo = h.ctx.app.get(SeatMonthRepo, { strict: false });
    runner = h.ctx.app.get(TransactionRunner, { strict: false });
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const row = (over: Partial<NewSeatMonthCharge> = {}): NewSeatMonthCharge => ({
    organizationId,
    subscriptionId: randomUUID(),
    assignmentId: randomUUID(),
    employeeId: randomUUID(),
    departmentId: randomUUID(),
    costCenterId: randomUUID(),
    month: '2026-10-01',
    days: 25,
    daysInMonth: 31,
    monthlyPriceMinor: 400_000n,
    amountMinor: 322_581n,
    commitmentId: null,
    appliedMinor: 0n,
    computedAt: new Date('2026-11-01T01:00:00.000Z'),
    ...over,
  });
  const write = (rows: NewSeatMonthCharge[]) => runner.run((tx) => repo.insertMany(tx, rows));

  it('refuses a second row for the same seat, month and department, and accepts the same seat in another department or month', async () => {
    const first = row();
    await write([first]);

    await expect(write([{ ...first, amountMinor: 1n }])).rejects.toThrow(
      /Unique constraint failed on the fields: \(`assignment_id`, `month`, `department_id`\)/,
    );
    await expect(
      write([
        { ...first, departmentId: randomUUID(), days: 6, amountMinor: 77_419n },
        { ...first, month: '2026-11-01', daysInMonth: 30, days: 30, amountMinor: 400_000n },
      ]),
    ).resolves.toBeUndefined();
  });

  it('replaces the rows of a subscription and a month together: written again, they are the same rows and no other month is touched', async () => {
    const subscriptionId = randomUUID();
    const otherMonth = row({ subscriptionId, month: '2026-09-01', daysInMonth: 30, days: 30, amountMinor: 400_000n });
    const rows = [row({ subscriptionId }), row({ subscriptionId, amountMinor: 77_419n, days: 6 })];
    await write([otherMonth, ...rows]);

    await runner.run(async (tx) => {
      await repo.lockMonthOf(tx, subscriptionId, '2026-10-01');
      await repo.deleteOfSubscriptionMonth(tx, subscriptionId, '2026-10-01');
      await repo.insertMany(
        tx,
        rows.map((one) => ({ ...one, assignmentId: randomUUID() })),
      );
    });

    const kept = await runner.run((tx) => repo.ofSubscriptionMonth(tx, subscriptionId, '2026-10-01'));
    const september = await runner.run((tx) => repo.ofSubscriptionMonth(tx, subscriptionId, '2026-09-01'));
    expect(kept).toHaveLength(2);
    expect(kept.map((one) => one.amountMinor).sort((a, b) => Number(a - b))).toEqual([77_419n, 322_581n]);
    expect(september).toHaveLength(1);
    expect(await repo.countOfMonth('2026-09-01')).toBeGreaterThanOrEqual(1);
  });

  it('refuses what cannot be: a day that is not the first of a month, more days than the month has, an amount taken from a commitment that is not there or that is more than the amount', async () => {
    await expect(write([row({ month: '2026-10-02' })])).rejects.toThrow(/seat_month_charges_month_check/);
    await expect(write([row({ days: 32, daysInMonth: 31 })])).rejects.toThrow(/seat_month_charges_days_check/);
    await expect(write([row({ days: 0 })])).rejects.toThrow(/seat_month_charges_days_check/);
    await expect(write([row({ appliedMinor: 1n })])).rejects.toThrow(/seat_month_charges_applied_check/);
    await expect(write([row({ amountMinor: -1n })])).rejects.toThrow(/seat_month_charges_amount_check/);
    await expect(write([row({ commitmentId: randomUUID() })])).rejects.toThrow(/seat_month_charges_commitment_id_fkey/);
  });
});
