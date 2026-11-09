import request from 'supertest';
import { PgRelay } from '../../support/pg-relay';
import { QueryCounter, dataStatements } from '../../support/query-count';
import { SpendHarness } from '../../support/spend-harness';

const h = new SpendHarness();

interface Software {
  subscriptionId: string;
  seatsPurchased: number | null;
  seatsAssigned: number;
  seatsIdle: number | null;
  monthlyUnitPrice: { amount: string } | null;
  monthsRunning: number;
  estimatedAnnualCost: { amount: string } | null;
  suggestRenewal: boolean;
}
interface BaselineDepartment {
  departmentId: string;
  costCenterId: string | null;
  spentThisYear: { amount: string };
  estimatedAnnualCost: { amount: string };
  hasUnknownCost: boolean;
  seatsPurchased: number;
  seatsAssigned: number;
  softwareTotal: number;
  software: Software[];
}
interface BaselineWire {
  year: number;
  kpi3: number | null;
  departmentsTotal: number;
  departments: BaselineDepartment[];
}
interface PackageWire {
  annualCeiling: { amount: string };
  sharedPoolReserve: { amount: string } | null;
  available: { amount: string };
  proposalsTotal: { amount: string };
  proposalsOverAvailable: boolean;
  versionsTotal: { amount: string };
  versionsOutsideListed: { amount: string };
  versionsInOtherCurrency: number;
  overBy: { amount: string };
  departmentsTotal: number;
  departments: {
    departmentId: string;
    ceiling: { amount: string } | null;
    proposal: { id: string; state: string } | null;
    version: { id: string; state: string; origin: string; total: { amount: string } } | null;
  }[];
}

/**
 * `qd103-budget-baseline-annual-check`, Task 2 (R-I03, AC-12, QĐ-103i): the baseline of a year (what runs, what the year is estimated to
 * cost, for the seats held) and the package (the year against its annual ceiling). Read-only; Finance and the spending approver read
 * them, a head reads the baseline of their own department only.
 */
describe('the baseline and the package of a budget cycle (integration, real PostgreSQL)', () => {
  let relay: PgRelay;
  let counter: QueryCounter;
  let serial = 0;
  const year = () => h.next;
  const baseline = (account = h.finance, query = '', y = year()) =>
    request(h.server()).get(`/api/v1/budget-cycles/${y}/baseline${query}`).set(h.as(account));
  const packageOf = (account = h.finance) =>
    request(h.server()).get(`/api/v1/budget-cycles/${year()}/package`).set(h.as(account));
  const department = async () => {
    serial += 1;
    const unit = await h.departmentWithHead(`P-BL${serial}`);
    const subscription = await h.subscription(10, 'K2', unit.department.id);

    return { ...unit, subscription };
  };
  /** Seats held on a subscription by people of the department; one of them starts later (a future start holds a seat as well). */
  const holdSeats = async (unit: Awaited<ReturnType<typeof department>>, held: number) => {
    const planId = (
      await h.ctx.sql.query<{ plan_id: string }>(`SELECT plan_id FROM subscriptions WHERE id = $1`, [unit.subscription])
    ).rows[0].plan_id;
    for (let i = 0; i < held; i += 1) {
      const person = await h.staff(unit.department, `BLS${serial}-${i}`);
      await h.ctx.sql.query(
        `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id,
           account_identifier, normalized_account_identifier, valid_from, valid_from_basis, created_by_app_user_id)
         SELECT gen_random_uuid(), e.organization_id, 'PERSONAL', 'REQUEST', $2, $3, e.id, e.employee_code || '@acme.vn',
                lower(e.employee_code) || '@acme.vn', $4::date, 'ACTUAL', gen_random_uuid()
           FROM employees e WHERE e.id = $1`,
        [person.employeeId, planId, unit.subscription, i === held - 1 ? `${h.next}-02-01` : '2026-01-05'],
      );
    }
  };
  /** A service account holds one seat of the subscription, charged to the Cost Center of the department (INV-01: it counts as a seat). */
  const holdServiceSeat = async (unit: Awaited<ReturnType<typeof department>>) => {
    const owner = await h.staff(unit.department, `BLV${serial}`);
    await h.ctx.sql.query(
      `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id,
         account_identifier, normalized_account_identifier, reason, cost_center_id, owning_department_id, valid_from, valid_from_basis,
         created_by_app_user_id)
       SELECT gen_random_uuid(), s.organization_id, 'SERVICE', 'REQUEST', s.plan_id, s.id, $2, 'build-bot@acme.vn',
              'build-bot@acme.vn', 'Builds the release', $3, $4, '2026-01-05', 'ACTUAL', gen_random_uuid()
         FROM subscriptions s WHERE s.id = $1`,
      [unit.subscription, owner.employeeId, unit.department.unitId, unit.department.id],
    );
  };
  /** The company has decided to end the subscription: its renewal case is decided `CANCEL`. */
  const orderToEnd = async (subscriptionId: string) => {
    const proposer = await h.staff((await department()).department, `BLE${serial}`);
    await h.ctx.sql.query(
      `INSERT INTO subscription_renewals (id, organization_id, subscription_id, state, notice_basis, notice_base_date,
         proposed_choice, proposed_by_employee_id, proposed_by_app_user_id, decided_choice, decision_reason,
         decided_by_employee_id, decided_by_app_user_id, decider_role, decided_at, decided_on, decided_after_deadline,
         execution_point, active_seats_at_decision, decision_snapshot, updated_at)
       SELECT gen_random_uuid(), s.organization_id, s.id, 'DECIDED', 'DECLARED', current_date, 'CANCEL', $2, gen_random_uuid(),
              'CANCEL', 'No longer needed', $2, gen_random_uuid(), 'OWNER_DEPARTMENT_HEAD', now(), current_date, false,
              'AS_PLANNED', 0, '{}'::jsonb, now()
         FROM subscriptions s WHERE s.id = $1`,
      [subscriptionId, proposer.employeeId],
    );
  };
  const entryOf = (wire: BaselineWire, departmentId: string, subscription: string) =>
    wire.departments
      .find((row) => row.departmentId === departmentId)
      ?.software.find((row) => row.subscriptionId === subscription);

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

  it('estimates the year for the seats held, not the seats bought: the idle seats belong to the shared pool (R-I03, F-066)', async () => {
    const unit = await department();
    await holdSeats(unit, 5);
    await holdServiceSeat(unit);

    const wire = h.dataOf<BaselineWire>(await baseline().expect(200));

    const entry = entryOf(wire, unit.department.id, unit.subscription);
    // 10 seats bought, 6 held (five people, one of them starting later, and a service account), 1,000,000 a month, running since
    // January and not ordered to end: it is renewed, 6 × 1,000,000 × 12 (F-096, Q-162).
    expect(entry).toMatchObject({
      seatsPurchased: 10,
      seatsAssigned: 6,
      seatsIdle: 4,
      monthsRunning: 12,
      suggestRenewal: true,
    });
    expect(entry?.monthlyUnitPrice?.amount).toBe('1000000');
    expect(entry?.estimatedAnnualCost?.amount).toBe('72000000');
    const row = wire.departments.find((d) => d.departmentId === unit.department.id);
    expect(row?.estimatedAnnualCost.amount).toBe('72000000');
    expect(row).toMatchObject({
      costCenterId: unit.department.unitId,
      seatsPurchased: 10,
      seatsAssigned: 6,
      softwareTotal: 1,
      hasUnknownCost: false,
    });
    expect(wire.kpi3).toBeNull();
  });

  it('divides an annual price by twelve and renews what runs: twelve months, whatever its end date says (R-I03, Q-162)', async () => {
    const unit = await department();
    await holdSeats(unit, 6);
    await h.ctx.sql.query(
      `UPDATE subscriptions SET billing_cycle = 'ANNUAL', unit_price_minor = 1200000, price_reporting_minor = 1200000, end_date = $2 WHERE id = $1`,
      [unit.subscription, `${year()}-06-30`],
    );

    const entry = entryOf(h.dataOf<BaselineWire>(await baseline().expect(200)), unit.department.id, unit.subscription);

    expect(entry?.monthlyUnitPrice?.amount).toBe('100000');
    expect(entry?.monthsRunning).toBe(12);
    expect(entry?.estimatedAnnualCost?.amount).toBe('7200000');
    expect(entry?.suggestRenewal).toBe(true);
  });

  it('counts only the months that remain for a subscription the company ordered to end, and does not propose it (Q-162, F-098)', async () => {
    const unit = await department();
    await holdSeats(unit, 6);
    await h.ctx.sql.query(
      `UPDATE subscriptions SET billing_cycle = 'ANNUAL', unit_price_minor = 1200000, price_reporting_minor = 1200000, end_date = $2 WHERE id = $1`,
      [unit.subscription, `${year()}-06-30`],
    );
    await orderToEnd(unit.subscription);

    const entry = entryOf(h.dataOf<BaselineWire>(await baseline().expect(200)), unit.department.id, unit.subscription);

    expect(entry).toMatchObject({ monthsRunning: 6, suggestRenewal: false });
    expect(entry?.estimatedAnnualCost?.amount).toBe('3600000');
  });

  it.each([
    ['at the end of January of the year after', `${new Date().getFullYear() + 1}-01-31`],
    ['with no end date', null],
  ])('renews a subscription that ends %s: twelve months and a Renew line (Q-162, F-098)', async (_name, endDate) => {
    const unit = await department();
    await holdSeats(unit, 6);
    await h.ctx.sql.query(`UPDATE subscriptions SET end_date = $2 WHERE id = $1`, [unit.subscription, endDate]);

    const entry = entryOf(h.dataOf<BaselineWire>(await baseline().expect(200)), unit.department.id, unit.subscription);

    expect(entry).toMatchObject({ monthsRunning: 12, suggestRenewal: true });
    expect(entry?.estimatedAnnualCost?.amount).toBe('72000000');
  });

  it("keeps a subscription that ends on 31 December of this year running into the next year, at today's price (F-068)", async () => {
    const unit = await department();
    await holdSeats(unit, 6);
    await h.ctx.sql.query(`UPDATE subscriptions SET end_date = $2 WHERE id = $1`, [
      unit.subscription,
      `${h.year}-12-31`,
    ]);

    const entry = entryOf(h.dataOf<BaselineWire>(await baseline().expect(200)), unit.department.id, unit.subscription);

    expect(entry).toMatchObject({ monthsRunning: 12, suggestRenewal: true });
    expect(entry?.estimatedAnnualCost?.amount).toBe('72000000');
  });

  it('says when a subscription is paid in a cycle the baseline cannot price by the month, and leaves its cost out of the total (F-074)', async () => {
    const unit = await department();
    await holdSeats(unit, 2);
    await h.ctx.sql.query(`UPDATE subscriptions SET billing_cycle = 'OTHER' WHERE id = $1`, [unit.subscription]);

    const wire = h.dataOf<BaselineWire>(await baseline().expect(200));

    const row = wire.departments.find((d) => d.departmentId === unit.department.id);
    expect(row?.hasUnknownCost).toBe(true);
    expect(row?.estimatedAnnualCost.amount).toBe('0');
    expect(entryOf(wire, unit.department.id, unit.subscription)?.estimatedAnnualCost).toBeNull();
  });

  it('adds up the spend of the year on every Cost Center the department had, not only the one in use (F-072)', async () => {
    const unit = await department();
    const oldCostCenter = unit.department.unitId;
    const requestId = await h.fixtureRequestId();
    const thisYear = Number(h.today().slice(0, 4));
    const commitment = await h.ctx.sql.query<{ id: string }>(
      `INSERT INTO budget_commitments (id, organization_id, request_id, cost_center_id, year, amount_minor, currency, unattached_reason)
       SELECT gen_random_uuid(), organization_id, $1, $2, $3, 5000000, 'VND', 'NO_BUDGET' FROM cost_centers WHERE id = $2 RETURNING id`,
      [requestId, oldCostCenter, thisYear],
    );
    await h.ctx.sql.query(
      `INSERT INTO invoices (id, organization_id, commitment_id, vendor_id, number, issued_on, currency, net_minor, actual_cost_minor,
         applied_minor, match_result, recorded_by_employee_id, recorded_at)
       SELECT gen_random_uuid(), c.organization_id, c.id, (SELECT id FROM vendors LIMIT 1), 'INV-BL-' || $2::text, current_date, 'VND',
              1500000, 1500000, 0, 'MATCHED', $3, now() FROM budget_commitments c WHERE c.id = $1`,
      [commitment.rows[0].id, serial, h.finance.employeeId],
    );

    const before = h
      .dataOf<BaselineWire>(await baseline().expect(200))
      .departments.find((d) => d.departmentId === unit.department.id);
    expect(before?.spentThisYear.amount).toBe('1500000');

    // The department is charged to another Cost Center from now on: the old one keeps what was spent on it.
    await h.ctx.sql.query(`UPDATE cost_centers SET status = 'INACTIVE', deactivated_at = now() WHERE id = $1`, [
      oldCostCenter,
    ]);
    await h.costCenterFor(unit.department.id);
    const after = h
      .dataOf<BaselineWire>(await baseline().expect(200))
      .departments.find((d) => d.departmentId === unit.department.id);

    expect(after?.costCenterId).not.toBe(oldCostCenter);
    expect(after?.spentThisYear.amount).toBe('1500000');
  });

  it('shows a department that takes effect on 1 January with zero (AC-16)', async () => {
    const { department: d } = await department();
    await h.ctx.sql.query(`UPDATE departments SET effective_from = $2 WHERE id = $1`, [d.id, `${year()}-01-01`]);

    const next = h.dataOf<BaselineWire>(await baseline().expect(200));
    const current = h.dataOf<BaselineWire>(await baseline(h.finance, '', h.year).expect(200));

    expect(next.departments.some((row) => row.departmentId === d.id)).toBe(true);
    expect(current.departments.some((row) => row.departmentId === d.id)).toBe(false);
  });

  it('lets the spending approver read it all, and a head only the department they name and answer for (quyền)', async () => {
    const mine = await department();
    const other = await department();

    const approver = await baseline(h.boss.account).expect(200);
    const own = await baseline(mine.head.account, `?departmentId=${mine.department.id}`).expect(200);
    const foreign = await baseline(mine.head.account, `?departmentId=${other.department.id}`).expect(403);
    const unnamed = await baseline(mine.head.account).expect(403);
    const member = await baseline(mine.member.account).expect(403);

    expect(h.dataOf<BaselineWire>(approver).departments.map((row) => row.departmentId)).toEqual(
      expect.arrayContaining([mine.department.id, other.department.id]),
    );
    expect(h.dataOf<BaselineWire>(own).departments.map((row) => row.departmentId)).toEqual([mine.department.id]);
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
        `UPDATE budget_versions SET state = 'REJECTED', sent_at = COALESCE(sent_at, now()),
                sent_by_employee_id = COALESCE(sent_by_employee_id, $2), never_current = false WHERE year = $1`,
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
      expect(wire.proposalsOverAvailable).toBe(true);
      expect(wire.versionsTotal.amount).toBe('80000000');
      expect(wire.versionsOutsideListed.amount).toBe('0');
      expect(wire.versionsInOtherCurrency).toBe(0);
      expect(wire.overBy.amount).toBe('0');
      const rowA = wire.departments.find((row) => row.departmentId === a.department.id);
      const rowB = wire.departments.find((row) => row.departmentId === b.department.id);
      expect(rowA?.proposal?.id).toBe(proposalA.id);
      expect(rowA?.version).toMatchObject({ id: version.id, state: 'SENT', origin: 'PROPOSAL' });
      expect(rowB?.proposal?.id).toBe(proposalB.id);
      expect(rowB?.version).toBeNull();
    });

    it('leaves a version in another currency out of the sums and counts it apart (F-074)', async () => {
      const a = await department();
      await h.ctx.sql.query(`UPDATE budget_cycles SET annual_ceiling_minor = 100000000000000 WHERE year = $1`, [
        year(),
      ]);
      const proposal = await h.budgetProposed(a.head, a.department.unitId);
      const version = await h.built(proposal.id);
      await h.sendVersion(version.id).expect(200);
      await h.ctx.sql.query(`UPDATE budget_versions SET currency = 'USD' WHERE id = $1`, [version.id]);
      try {
        const wire = h.dataOf<PackageWire>(await packageOf().expect(200));

        expect(wire.versionsInOtherCurrency).toBe(1);
        expect(wire.departments.find((row) => row.departmentId === a.department.id)?.version).toBeNull();
      } finally {
        await h.ctx.sql.query(`UPDATE budget_versions SET currency = 'VND' WHERE id = $1`, [version.id]);
      }
    });

    it('puts the version of a department that is no longer listed into versionsOutsideListed, so the total is explained (F-102)', async () => {
      const a = await department();
      await h.ctx.sql.query(`UPDATE budget_cycles SET annual_ceiling_minor = 100000000000000 WHERE year = $1`, [
        year(),
      ]);
      const proposal = await h.budgetProposed(a.head, a.department.unitId);
      const version = await h.built(proposal.id);
      await h.sendVersion(version.id).expect(200);
      const before = h.dataOf<PackageWire>(await packageOf().expect(200));
      // The department leaves the year: its Cost Center is no longer among the ones listed, but the version still counts.
      await h.ctx.sql.query(`UPDATE cost_centers SET status = 'INACTIVE', deactivated_at = now() WHERE id = $1`, [
        a.department.unitId,
      ]);

      const after = h.dataOf<PackageWire>(await packageOf().expect(200));

      expect(BigInt(after.versionsOutsideListed.amount) - BigInt(before.versionsOutsideListed.amount)).toBe(
        BigInt(version.base.amount) + BigInt(version.reserve.amount),
      );
      expect(after.versionsTotal.amount).toBe(before.versionsTotal.amount);
    });

    it('is for Finance and the spending approver only', async () => {
      const unit = await department();

      await packageOf(h.boss.account).expect(200);
      const head = await packageOf(unit.head.account).expect(403);

      expect(h.codeOf(head)).toBe('AUTHORIZATION.FORBIDDEN');
    });
  });

  it('answers the baseline and the package in the same number of statements however many departments there are (F-070)', async () => {
    const one = await counter.run(async () => ({
      baseline: await baseline().expect(200),
      package: await packageOf().expect(200),
    }));
    for (let i = 0; i < 4; i += 1) await department();
    const many = await counter.run(async () => ({
      baseline: await baseline().expect(200),
      package: await packageOf().expect(200),
    }));

    expect(dataStatements(many.statements)).toHaveLength(dataStatements(one.statements).length);
  });
});
