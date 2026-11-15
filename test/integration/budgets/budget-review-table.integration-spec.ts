import { randomUUID } from 'node:crypto';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import {
  BudgetReviewRepo,
  type NewReviewLine,
  type NewReviewPeriod,
} from '../../../src/modules/budgets/review/budget-review.repo';
import { BudgetHarness } from '../../support/budget-harness';

const h = new BudgetHarness();

describe('the tables of the review periods keep a picture that is never changed (RV-1.2; QĐ-111ae, R-2)', () => {
  let organizationId: string;
  let repo: BudgetReviewRepo;
  let runner: TransactionRunner;
  let year = 2040;

  beforeAll(async () => {
    await h.start();
    organizationId = (await h.ctx.sql.query<{ id: string }>(`SELECT id FROM organizations LIMIT 1`)).rows[0].id;
    repo = h.ctx.app.get(BudgetReviewRepo, { strict: false });
    runner = h.ctx.app.get(TransactionRunner, { strict: false });
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const period = (over: Partial<NewReviewPeriod> = {}): NewReviewPeriod => ({
    organizationId,
    year,
    month: 6,
    kind: 'QUARTER',
    currency: 'VND',
    snapshotByEmployeeId: randomUUID(),
    snapshotAt: new Date('2040-07-07T02:00:00.000Z'),
    companySpentMinor: 900_000_000n,
    sharedPoolUnallocatedMinor: 1_200_000n,
    sharedPoolReserveMinor: 5_000_000n,
    annualCeilingMinor: 2_000_000_000n,
    ...over,
  });
  const line = (over: Partial<NewReviewLine> = {}): NewReviewLine => ({
    costCenterId: randomUUID(),
    baseMinor: 300_000_000n,
    reserveMinor: 30_000_000n,
    spentMinor: 168_000_000n,
    committedMinor: 135_000_000n,
    pendingSpendMinor: 0n,
    remainingMinor: -3_000_000n,
    invoiceBasisMinor: 160_000_000n,
    invoiceActualMinor: 168_000_000n,
    variancePpm: 50_000n,
    priceIncreaseMinor: 0n,
    forecastMinor: 309_750_000n,
    paceBasisPoints: 11_200n,
    light: 'YELLOW',
    ...over,
  });
  const write = (header: NewReviewPeriod, lines: NewReviewLine[]) => runner.run((tx) => repo.insert(tx, header, lines));
  const nextYear = () => {
    year += 1;
    return year;
  };

  it('writes the period with its lines and reads them back figure for figure', async () => {
    const header = period({ year: nextYear() });
    const lines = [line(), line({ light: 'GREEN', forecastMinor: 100n, paceBasisPoints: null })];
    const created = await write(header, lines);

    expect(created).toMatchObject({ state: 'SNAPSHOT', kind: 'QUARTER', year: header.year, month: 6 });
    const read = await repo.findByMonth(organizationId, header.year, 6);
    expect(read?.companySpentMinor).toBe(900_000_000n);
    const { rows, total } = await repo.linesPage({ periodId: created.id, skip: 0, take: 10 });
    expect(total).toBe(2);
    expect(rows.map((row) => row.light)).toEqual(['YELLOW', 'GREEN']);
    expect(rows[0]).toMatchObject({ forecastMinor: 309_750_000n, variancePpm: 50_000n, paceBasisPoints: 11_200n });
    expect((await repo.lightCountsOf([created.id])).get(created.id)).toEqual({ GREEN: 1, YELLOW: 1, RED: 0, UNDER: 0 });
  });

  it('refuses a second period for the same month, and accepts the same month of another year', async () => {
    const header = period({ year: nextYear() });
    await write(header, []);

    await expect(write(header, [])).rejects.toThrow(/Unique constraint failed/);
    await expect(write({ ...header, year: nextYear() }, [])).resolves.toBeDefined();
  });

  it('orders a page of lines by the light that needs the eye, red first, and gives a manager only the Cost Centers of their scope', async () => {
    const created = await write(period({ year: nextYear() }), [
      line({ light: 'GREEN' }),
      line({ light: 'UNDER' }),
      line({ light: 'RED' }),
      line({ light: 'YELLOW' }),
    ]);

    const all = await repo.linesPage({ periodId: created.id, skip: 0, take: 10 });
    expect(all.rows.map((row) => row.light)).toEqual(['RED', 'YELLOW', 'UNDER', 'GREEN']);
    const second = await repo.linesPage({ periodId: created.id, skip: 2, take: 1 });
    expect(second.rows.map((row) => row.light)).toEqual(['UNDER']);
    expect(second.total).toBe(4);
    const own = [all.rows[1].costCenterId];
    expect((await repo.linesPage({ periodId: created.id, costCenterIds: own, skip: 0, take: 10 })).rows).toHaveLength(
      1,
    );
    expect(await repo.linesPage({ periodId: created.id, costCenterIds: [], skip: 0, take: 10 })).toEqual({
      rows: [],
      total: 0,
    });
  });

  it('refuses to change any figure of a line, to remove a line, and to change or remove the figures of a period', async () => {
    const created = await write(period({ year: nextYear() }), [line()]);
    const columns = [
      ['spent_minor', '1'],
      ['committed_minor', '1'],
      ['pending_spend_minor', '1'],
      ['base_minor', '1'],
      ['reserve_minor', '1'],
      ['remaining_minor', '1'],
      ['forecast_minor', '1'],
      ['variance_ppm', '1'],
      ['invoice_net_minor', '1'],
      ['price_increase_minor', '1'],
      ['pace_basis_points', 'NULL'],
      ['light', `'GREEN'`],
    ];
    for (const [column, value] of columns) {
      await expect(
        h.ctx.sql.query(`UPDATE budget_review_lines SET ${column} = ${value} WHERE period_id = $1`, [created.id]),
      ).rejects.toThrow(/never change/);
    }
    await expect(h.ctx.sql.query(`DELETE FROM budget_review_lines WHERE period_id = $1`, [created.id])).rejects.toThrow(
      /keeps its picture/,
    );
    await expect(h.ctx.sql.query(`TRUNCATE budget_review_lines`)).rejects.toThrow(/keeps its picture/);
    for (const set of [
      'company_spent_minor = 1',
      'shared_pool_unallocated_minor = 1',
      'shared_pool_reserve_minor = NULL',
      'annual_ceiling_minor = 1',
      'snapshot_at = now()',
    ]) {
      await expect(
        h.ctx.sql.query(`UPDATE budget_review_periods SET ${set} WHERE id = $1`, [created.id]),
      ).rejects.toThrow(/never change/);
    }
    await expect(h.ctx.sql.query(`DELETE FROM budget_review_periods WHERE id = $1`, [created.id])).rejects.toThrow(
      /keeps its picture/,
    );
    const [kept] = (await repo.linesPage({ periodId: created.id, skip: 0, take: 1 })).rows;
    expect(kept.forecastMinor).toBe(309_750_000n);
  });

  it('signs once: the state moves from the picture to signed with who and when, a second signature finds nothing to sign, and a signed period does not change again', async () => {
    const created = await write(period({ year: nextYear(), month: 4, kind: 'MONTH' }), [line()]);
    const by = { employeeId: randomUUID(), at: new Date('2040-05-08T03:00:00.000Z'), note: 'Reviewed' };

    expect(await runner.run((tx) => repo.sign(tx, created.id, by))).toBe(true);
    expect(await runner.run((tx) => repo.sign(tx, created.id, by))).toBe(false);
    expect(await repo.findById(created.id)).toMatchObject({
      state: 'SIGNED',
      signedByEmployeeId: by.employeeId,
      signedAt: by.at,
      note: 'Reviewed',
    });
    await expect(
      h.ctx.sql.query(`UPDATE budget_review_periods SET note = 'x' WHERE id = $1`, [created.id]),
    ).rejects.toThrow(/signed review period does not change/);
  });

  it('moves a quarterly period forward only: the picture, then the explanations, then signed, never back', async () => {
    const created = await write(period({ year: nextYear() }), []);
    await h.ctx.sql.query(`UPDATE budget_review_periods SET state = 'AWAITING_EXPLANATIONS' WHERE id = $1`, [
      created.id,
    ]);

    await expect(
      h.ctx.sql.query(`UPDATE budget_review_periods SET state = 'SNAPSHOT' WHERE id = $1`, [created.id]),
    ).rejects.toThrow(/moves forward only/);
    expect(
      await runner.run((tx) => repo.sign(tx, created.id, { employeeId: randomUUID(), at: new Date(), note: null })),
    ).toBe(true);
  });

  it('refuses what cannot be: a quarter that is not March, June or September, a month in a quarter, a signature half written, the explanations of a month', async () => {
    await expect(write(period({ year: nextYear(), month: 4, kind: 'QUARTER' }), [])).rejects.toThrow(
      /budget_review_periods_kind_check/,
    );
    await expect(write(period({ year: nextYear(), month: 6, kind: 'MONTH' }), [])).rejects.toThrow(
      /budget_review_periods_kind_check/,
    );
    await expect(write(period({ year: nextYear(), month: 13, kind: 'MONTH' }), [])).rejects.toThrow(
      /budget_review_periods_month_check/,
    );
    const month = await write(period({ year: nextYear(), month: 4, kind: 'MONTH' }), []);
    await expect(
      h.ctx.sql.query(`UPDATE budget_review_periods SET state = 'AWAITING_EXPLANATIONS' WHERE id = $1`, [month.id]),
    ).rejects.toThrow(/budget_review_periods_awaiting_check/);
    await expect(
      h.ctx.sql.query(`UPDATE budget_review_periods SET state = 'SIGNED' WHERE id = $1`, [month.id]),
    ).rejects.toThrow(/budget_review_periods_signed_check/);
    await expect(write(period({ year: nextYear() }), [line({ light: 'PURPLE' as never })])).rejects.toThrow(
      /budget_review_lines_light_check/,
    );
  });
});
