import request from 'supertest';
import type { TableRowWire, BudgetSummaryWire } from '../../../src/modules/budgets/budget/budget.dto';
import { BudgetViewRepo } from '../../../src/modules/budgets/budget-view/budget-view.repo';
import { CommitmentRepo } from '../../../src/modules/budgets/budget/commitment.repo';
import { BudgetViewsHarness } from '../../support/budget-views-harness';
import { PgRelay } from '../../support/pg-relay';
import { QueryCounter, dataStatements } from '../../support/query-count';

const h = new BudgetViewsHarness();

describe('BR-MF4-05 budgetTable commitment-only years over PostgreSQL', () => {
  let serial = 0;
  let relay: PgRelay;
  let counter: QueryCounter;
  beforeAll(async () => {
    await h.start({
      appDatabaseUrl: async (directUrl) => {
        const url = new URL(directUrl);
        relay = await PgRelay.start(url.hostname, Number(url.port || 5432));
        url.port = String(relay.port);
        return url.toString();
      },
    });
    counter = QueryCounter.on(relay);
    await h.withApprover();
  }, 240000);
  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });
  const unit = () => h.departmentWithHead(`BV-T${++serial}`);
  const rows = async (year: number) =>
    h.dataOf<{ items: TableRowWire[] }>(await h.table(h.finance, { year, pageSize: 100 }).expect(200)).items;

  it('includes NO_BUDGET rows once in page and total, without changing attached-only spend-check totals', async () => {
    const u = await unit();
    const year = h.year + 5;
    await h.unattached(u, year, 30);
    await h.unattached(u, year, 10);
    const page = h.dataOf<{ items: TableRowWire[]; pagination: { totalItems: number } }>(
      await h.table(h.boss.account, { year, pageSize: 1 }).expect(200),
    );
    expect(page.pagination.totalItems).toBe(1);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      costCenter: { id: u.department.unitId },
      status: 'NO_BUDGET',
      versionId: null,
      number: null,
      base: null,
      reserve: null,
      total: null,
      committed: { amount: '40' },
      remainingBase: null,
      remainingWithReserve: null,
      overBudget: false,
    });
    const repo = h.ctx.app.get(CommitmentRepo, { strict: false });
    expect(
      (await repo.totals([{ costCenterId: u.department.unitId, year }])).get(`${u.department.unitId}:${year}`),
    ).toBeUndefined();
    const empty = h.dataOf<{ items: TableRowWire[]; pagination: { totalItems: number } }>(
      await h.table(h.finance, { year, page: 2, pageSize: 1 }).expect(200),
    );
    expect(empty.items).toEqual([]);
    expect(empty.pagination.totalItems).toBe(1);
    const summary = h.dataOf<BudgetSummaryWire>(await h.summary(h.boss.account, { year }).expect(200));
    expect(summary.annualCeiling).toBeNull();
    expect(summary.sharedPoolReserve).toBeNull();
    expect(summary.totals[h.reporting]).toMatchObject({
      total: { amount: '0' },
      committed: { amount: '40' },
      costCenterCount: 1,
      overBudgetCount: 0,
    });
  });

  it('BR-MF4-05 counts late invoices at organization-local 1 January, including NO_BUDGET rows, without moving expense to next year', async () => {
    const u = await unit();
    const year = h.year;
    await h.ctx.sql.query("UPDATE organizations SET time_zone = 'Asia/Bangkok'");
    const commitment = await h.unattached(u, year, 100);
    await h.invoiceAt(commitment, 11, `${year}-12-31T23:59:59+07:00`);
    await h.invoiceAt(commitment, 13, `${year + 1}-01-01T00:00:00+07:00`);
    const row = (await rows(year)).find((entry) => entry.costCenter.id === u.department.unitId);
    expect(row).toMatchObject({
      status: 'NO_BUDGET',
      committed: { amount: '76' },
      spent: { amount: '24' },
      priorPeriodAdjustment: { amount: '13' },
    });
    expect((await rows(year + 1)).some((entry) => entry.costCenter.id === u.department.unitId)).toBe(false);
  });

  it('BR-MF4-01 summary exposes annual ceiling and shared reserve for an existing cycle', async () => {
    const summary = h.dataOf<BudgetSummaryWire>(await h.summary(h.finance, { year: h.next }).expect(200));
    expect(summary.annualCeiling).toEqual({ amount: '100000000000000', currency: h.reporting });
    expect(summary.sharedPoolReserve).toEqual({ amount: '0', currency: h.reporting });
  });

  it('BR-MF4-05 uses the same number of SQL statements for one row and many, without loading budget lines', async () => {
    const year = h.year + 6;
    await h.unattached(await unit(), year, 10);
    await h.unattached(await unit(), year, 20);
    const one = await counter.run(async () => h.table(h.finance, { year, pageSize: 1 }).expect(200));
    const many = await counter.run(async () => h.table(h.finance, { year, pageSize: 100 }).expect(200));
    expect(h.dataOf<{ items: unknown[] }>(one.result).items).toHaveLength(1);
    expect(h.dataOf<{ items: unknown[] }>(many.result).items).toHaveLength(2);
    expect(dataStatements(many.statements)).toHaveLength(dataStatements(one.statements).length);
    expect(many.statements.join('\n')).not.toMatch(/budget_version_lines|budget_proposal_lines/);
  });

  it('BR-MF4-05 reference rows retain closed-year budgets and exclude versions which never became current', async () => {
    const approved = await unit();
    const version = await h.budgetFor(approved, { total: 100 });
    const unsent = await unit();
    const proposal = await h.budgetProposed(unsent.head, unsent.department.unitId, undefined, h.year);
    const draft = await h.built(proposal.id);
    await h.ctx.sql.query(
      "UPDATE budget_versions SET state = 'EXPIRED', never_current = false, expired_at = now() WHERE id = $1",
      [version.id],
    );
    await h.ctx.sql.query(
      "UPDATE budget_versions SET state = 'EXPIRED', never_current = true, expired_at = now() WHERE id = $1",
      [draft.id],
    );
    const repo = h.ctx.app.get(BudgetViewRepo, { strict: false });
    const figures = await repo.rows(h.year);
    expect(figures.find((entry) => entry.costCenterId === approved.department.unitId)?.versionId).toBe(version.id);
    expect(figures.some((entry) => entry.costCenterId === unsent.department.unitId)).toBe(false);
  });

  it('BR-MF4-05 baseline identifies ownership basis and package preserves head/baseline eligibility', async () => {
    const u = await unit();
    await h.ctx.sql.query(
      `INSERT INTO budget_department_ceilings
      (cycle_id, department_id, signed_commitments_minor, planned_seats_minor, priority_minor, total_minor, published_total_minor)
      SELECT id, $1, 0, 0, 0, 0, 0 FROM budget_cycles WHERE year = $2`,
      [u.department.id, h.next],
    );
    const baseline = await request(h.server())
      .get(`/api/v1/budget-cycles/${h.next}/baseline`)
      .set(h.as(h.finance))
      .expect(200);
    expect(h.dataOf<{ basis: string }>(baseline).basis).toBe('OWNER_DEPARTMENT');
    const response = await request(h.server())
      .get(`/api/v1/budget-cycles/${h.next}/package`)
      .set(h.as(h.finance))
      .expect(200);
    const departments = h.dataOf<{
      departments: { departmentId: string; headStatus: string; baselineAllowed: boolean; baselineRefusal: string }[];
    }>(response).departments;
    expect(departments.find((entry) => entry.departmentId === u.department.id)).toMatchObject({
      headStatus: 'HAS_HEAD',
      baselineAllowed: false,
    });
  });
});
