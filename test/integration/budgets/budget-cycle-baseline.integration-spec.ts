import request from 'supertest';
import { SpendHarness } from '../../support/spend-harness';

const h = new SpendHarness();

interface Software {
  seatsPurchased: number | null;
  seatsAssigned: number;
  seatsIdle: number | null;
  monthlyUnitPrice: { amount: string } | null;
  monthsRunning: number;
  estimatedAnnualCost: { amount: string } | null;
  suggestRenewal: boolean;
}
interface BaselineWire {
  year: number;
  kpi3: number | null;
  departments: Record<
    string,
    {
      departmentCode: string;
      costCenterId: string | null;
      estimatedAnnualCost: { amount: string };
      seatsPurchased: number;
      software: Record<string, Software>;
    }
  >;
}
interface PackageWire {
  annualCeiling: { amount: string };
  sharedPoolReserve: { amount: string } | null;
  available: { amount: string };
  proposalsTotal: { amount: string };
  proposalsOverAnnual: boolean;
  versionsTotal: { amount: string };
  overBy: { amount: string };
  departments: Record<
    string,
    {
      ceiling: { amount: string } | null;
      proposal: { id: string; state: string } | null;
      version: { id: string; state: string; origin: string; total: { amount: string } } | null;
    }
  >;
}

/**
 * `qd103-budget-baseline-annual-check`, Task 2 (R-I03, AC-12, QĐ-103i): the baseline of a year (what runs, what the year is estimated to
 * cost) and the package (the year against its annual ceiling). Read-only; Finance and the spending approver read them, a head reads
 * the baseline of their own department only.
 */
describe('the baseline and the package of a budget cycle (integration, real PostgreSQL)', () => {
  let counter = 0;
  const year = () => h.next;
  const baseline = (account = h.finance, query = '') =>
    request(h.server()).get(`/api/v1/budget-cycles/${year()}/baseline${query}`).set(h.as(account));
  const packageOf = (account = h.finance) =>
    request(h.server()).get(`/api/v1/budget-cycles/${year()}/package`).set(h.as(account));
  const department = async () => {
    counter += 1;
    const unit = await h.departmentWithHead(`P-BL${counter}`);
    const subscription = await h.subscription(10, 'K2', unit.department.id);

    return { ...unit, subscription };
  };

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('prices a seat by the month, counts the months of the year and estimates the year (R-I03)', async () => {
    const { department: d, subscription } = await department();

    const wire = h.dataOf<BaselineWire>(await baseline().expect(200));

    const entry = wire.departments[d.id].software[subscription];
    // 10 seats bought at 1,000,000 a month, running since January: twelve months.
    expect(entry).toMatchObject({
      seatsPurchased: 10,
      seatsAssigned: 0,
      seatsIdle: 10,
      monthsRunning: 12,
      suggestRenewal: false,
    });
    expect(entry.monthlyUnitPrice?.amount).toBe('1000000');
    expect(entry.estimatedAnnualCost?.amount).toBe('120000000');
    expect(wire.departments[d.id].costCenterId).toBe(d.unitId);
    expect(wire.kpi3).toBeNull();
  });

  it('divides an annual price by twelve, stops at the end of the term, and suggests a renewal for a term that ends in the year (R-I03)', async () => {
    const { department: d, subscription } = await department();
    await h.ctx.sql.query(
      `UPDATE subscriptions SET billing_cycle = 'ANNUAL', unit_price_minor = 1200000, price_reporting_minor = 1200000, end_date = $2 WHERE id = $1`,
      [subscription, `${year()}-06-30`],
    );

    const entry = h.dataOf<BaselineWire>(await baseline().expect(200)).departments[d.id].software[subscription];

    expect(entry.monthlyUnitPrice?.amount).toBe('100000');
    expect(entry.monthsRunning).toBe(6);
    expect(entry.estimatedAnnualCost?.amount).toBe('6000000');
    expect(entry.suggestRenewal).toBe(true);
  });

  it('shows a department that takes effect on 1 January with zero (AC-16)', async () => {
    const { department: d } = await department();
    await h.ctx.sql.query(`UPDATE departments SET effective_from = $2 WHERE id = $1`, [d.id, `${year()}-01-01`]);

    const next = h.dataOf<BaselineWire>(await baseline().expect(200));
    const current = h.dataOf<BaselineWire>(
      await request(h.server()).get(`/api/v1/budget-cycles/${h.year}/baseline`).set(h.as(h.finance)).expect(200),
    );

    expect(next.departments[d.id]).toBeDefined();
    expect(current.departments[d.id]).toBeUndefined();
  });

  it('lets the spending approver read it all, and a head only the department they name and answer for (quyền)', async () => {
    const mine = await department();
    const other = await department();

    const approver = await baseline(h.boss.account).expect(200);
    const own = await baseline(mine.head.account, `?departmentId=${mine.department.id}`).expect(200);
    const foreign = await baseline(mine.head.account, `?departmentId=${other.department.id}`).expect(403);
    const unnamed = await baseline(mine.head.account).expect(403);
    const member = await baseline(mine.member.account).expect(403);

    expect(Object.keys(h.dataOf<BaselineWire>(approver).departments)).toEqual(
      expect.arrayContaining([mine.department.id, other.department.id]),
    );
    expect(Object.keys(h.dataOf<BaselineWire>(own).departments)).toEqual([mine.department.id]);
    expect(h.codeOf(foreign)).toBe('BUDGET.NOT_YOUR_COST_CENTER');
    expect(h.codeOf(unnamed)).toBe('BUDGET.NOT_YOUR_COST_CENTER');
    expect(h.codeOf(member)).toBe('AUTHORIZATION.FORBIDDEN');
  });

  it('answers 404 for a year with no cycle', async () => {
    const refused = await request(h.server())
      .get('/api/v1/budget-cycles/2099/baseline')
      .set(h.as(h.finance))
      .expect(404);

    expect(h.codeOf(refused)).toBe('BUDGET.CYCLE_NOT_FOUND');
  });

  describe('the package (AC-12)', () => {
    it('adds up the proposals and the versions against what is available, and says by how much they are over', async () => {
      const a = await department();
      const b = await department();
      await h.ctx.sql.query(
        `UPDATE budget_cycles SET annual_ceiling_minor = 100000000, shared_pool_reserve_minor = 10000000 WHERE year = $1`,
        [year()],
      );
      await h.ctx.sql.query(`UPDATE budget_proposals SET state = 'WITHDRAWN', withdrawn_at = now() WHERE year = $1`, [
        year(),
      ]);
      await h.ctx.sql.query(
        `UPDATE budget_versions SET state = 'REJECTED', sent_at = COALESCE(sent_at, now()), sent_by_employee_id = COALESCE(sent_by_employee_id, $2) WHERE year = $1`,
        [year(), h.finance.employeeId],
      );
      const proposalA = await h.budgetProposed(a.head, a.department.unitId);
      const proposalB = await h.budgetProposed(b.head, b.department.unitId);
      const version = await h.built(proposalA.id);
      await h.sendVersion(version.id).expect(200);

      const wire = h.dataOf<PackageWire>(await packageOf().expect(200));

      expect(wire.annualCeiling.amount).toBe('100000000');
      expect(wire.sharedPoolReserve?.amount).toBe('10000000');
      expect(wire.available.amount).toBe('90000000');
      // Two proposals of 70M: over what is available. One version of 80M: within it.
      expect(wire.proposalsTotal.amount).toBe('140000000');
      expect(wire.proposalsOverAnnual).toBe(true);
      expect(wire.versionsTotal.amount).toBe('80000000');
      expect(wire.overBy.amount).toBe('0');
      expect(wire.departments[a.department.id].proposal?.id).toBe(proposalA.id);
      expect(wire.departments[a.department.id].version).toMatchObject({
        id: version.id,
        state: 'SENT',
        origin: 'PROPOSAL',
      });
      expect(wire.departments[b.department.id].proposal?.id).toBe(proposalB.id);
      expect(wire.departments[b.department.id].version).toBeNull();
    });

    it('is for Finance and the spending approver only', async () => {
      const unit = await department();

      await packageOf(h.boss.account).expect(200);
      const head = await packageOf(unit.head.account).expect(403);

      expect(h.codeOf(head)).toBe('AUTHORIZATION.FORBIDDEN');
    });
  });
});
