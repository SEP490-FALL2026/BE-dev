import { Client } from 'pg';
import request from 'supertest';
import { addDays } from '../../support/department-harness';
import { BudgetHarness } from '../../support/budget-harness';
import { budgetYearLockKey } from '../../../src/modules/budgets/public/budget-year-lock-key.policy';
import { waitForLockWaiters } from '../../support/lock-wait';
import type { Department } from '../../support/request-harness';

const h = new BudgetHarness();

interface VersionBody {
  version: {
    id: string;
    origin: string;
    proposalId: string | null;
    base: { amount: string };
    reserve: { amount: string };
  };
}

/**
 * `qd103-budget-baseline-annual-check`, Task 3 (QĐ-100h, R-I05, AC-5): after the submission deadline Finance builds the first version
 * of a department nobody heads, is to head and proposed for, from the baseline: the lines are the Renew lines the baseline gives.
 */
describe('a version built from the baseline (integration, real PostgreSQL)', () => {
  let counter = 0;

  const create = (body: object, token = h.finance) =>
    request(h.server()).post('/api/v1/budget-versions').set(h.as(token)).send(body);
  const setDeadline = (year: number, deadline: string) =>
    h.ctx.sql.query(`UPDATE budget_cycles SET submission_deadline = $2, decision_deadline = $3 WHERE year = $1`, [
      year,
      deadline,
      addDays(deadline, 10),
    ]);
  /** The department has a ceiling in the cycle of the year, as the cycle gives one to each department it divides the budget among. */
  const inCycle = (department: Department, year = h.year) =>
    h.ctx.sql.query(
      `INSERT INTO budget_department_ceilings (cycle_id, department_id, signed_commitments_minor, planned_seats_minor, priority_minor, total_minor)
       SELECT c.id, $2, 0, 0, 0, 0 FROM budget_cycles c WHERE c.year = $1
       ON CONFLICT DO NOTHING`,
      [year, department.id],
    );
  /** A department in the cycle with a Cost Center, a subscription of 10 seats and nobody heading it. */
  const headless = async (): Promise<Department> => {
    counter += 1;
    const department = await h.departmentWithUnit(`P-BV${counter}`);
    await h.subscription(10, 'K2', department.id);
    await inCycle(department);

    return department;
  };
  /** Six seats held on the subscription of the department, by people who are not its head (nobody is). */
  const holdSeats = async (department: Department, held: number) => {
    const { rows } = await h.ctx.sql.query<{ id: string; plan_id: string }>(
      `SELECT id, plan_id FROM subscriptions WHERE owner_department_id = $1 AND status = 'ACTIVE' ORDER BY id`,
      [department.id],
    );
    for (let i = 0; i < held; i += 1) {
      const person = await h.staff(department, `BVS${counter}-${i}`);
      await h.ctx.sql.query(
        `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id,
           account_identifier, normalized_account_identifier, valid_from, valid_from_basis, created_by_app_user_id)
         SELECT gen_random_uuid(), e.organization_id, 'PERSONAL', 'REQUEST', $2, $3, e.id, e.employee_code || '@acme.vn',
                lower(e.employee_code) || '@acme.vn', '2026-01-05', 'ACTUAL', gen_random_uuid()
           FROM employees e WHERE e.id = $1`,
        [person.employeeId, rows[0].plan_id, rows[0].id],
      );
    }
  };
  const baselineBody = (department: Department, year = h.year) => ({
    source: 'BASELINE',
    costCenterId: department.unitId,
    year,
  });

  beforeAll(async () => {
    await h.start();
    // The deadline of the year has passed: yesterday.
    await setDeadline(h.year, addDays(h.today(), -1));
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('builds the first version from the baseline: a Renew line for what runs, the base is their sum, origin BASELINE_NO_HEAD', async () => {
    const department = await headless();
    await holdSeats(department, 6);

    const made = h.dataOf<VersionBody>(await create(baselineBody(department)).expect(201)).version;

    // 10 seats bought, 6 held, at 1,000,000 a month, running since January 2026: twelve months, for the six held (F-066).
    expect(made.origin).toBe('BASELINE_NO_HEAD');
    expect(made.proposalId).toBeNull();
    expect(made.base.amount).toBe('72000000');
    expect(made.reserve.amount).toBe('7200000');
    const lines = await h.ctx.sql.query<{
      description: string;
      seats: number;
      amount_minor: string;
      proposal_id: string | null;
    }>(`SELECT description, seats, amount_minor::text, proposal_id FROM budget_version_lines WHERE version_id = $1`, [
      made.id,
    ]);
    expect(lines.rows).toHaveLength(1);
    expect(lines.rows[0]).toMatchObject({ seats: 6, amount_minor: '72000000', proposal_id: null });
    expect(lines.rows[0].description).toMatch(/^Renew /);
  });

  describe('refuses with 409 BUDGET.BASELINE_VERSION_NOT_ALLOWED naming the reason', () => {
    const refusedWith = (response: request.Response, reason: string): void => {
      expect(response.status).toBe(409);
      expect(h.codeOf(response)).toBe('BUDGET.BASELINE_VERSION_NOT_ALLOWED');
      expect(h.detailsOf(response)).toEqual({ reason });
    };

    it('before the submission deadline, and on the day of it', async () => {
      const department = await headless();
      await setDeadline(h.year, h.today());

      refusedWith(await create(baselineBody(department)), 'BEFORE_DEADLINE');
      await setDeadline(h.year, addDays(h.today(), 5));
      refusedWith(await create(baselineBody(department)), 'BEFORE_DEADLINE');
      await setDeadline(h.year, addDays(h.today(), -1));
    });

    it('when somebody heads the department', async () => {
      const unit = await h.departmentWithHead(`P-BVH${(counter += 1)}`);
      await inCycle(unit.department);

      refusedWith(await create(baselineBody(unit.department)), 'HAS_HEAD');
    });

    it('when a proposal waits, even though nobody heads the department any more', async () => {
      const unit = await h.departmentWithHead(`P-BVP${(counter += 1)}`);
      await inCycle(unit.department);
      await h.budgetProposed(unit.head, unit.department.unitId, undefined, h.year);
      await h.withoutHead(unit.department);

      refusedWith(await create(baselineBody(unit.department)), 'HAS_PROPOSAL');
    });

    it('when somebody is to head the department (a department that starts next year with its head named)', async () => {
      const department = await headless();
      const start = `${h.next}-01-01`;
      await setDeadline(h.next, addDays(h.today(), -1));
      await inCycle(department, h.next);
      await h.ctx.sql.query(`UPDATE departments SET effective_from = $2 WHERE id = $1`, [department.id, start]);
      const person = await h.unplacedStaff(`BVN${counter}`, 'MANAGER');
      const asAdmin = { Authorization: `Bearer ${h.admin}` };
      await request(h.server())
        .post(`/api/v1/employees/${person.employeeId}/first-placements`)
        .set(asAdmin)
        .send({ departmentId: department.id, effectiveFrom: start })
        .expect(201);
      await request(h.server())
        .post(`/api/v1/departments/${department.id}/head-assignments`)
        .set(asAdmin)
        .send({ employeeId: person.employeeId, effectiveFrom: start })
        .expect(200);

      refusedWith(await create(baselineBody(department, h.next)), 'HAS_SUCCESSOR');
    });

    it('when the department is not in the cycle of the year: no ceiling there, or it takes effect after the year (F-078)', async () => {
      counter += 1;
      const noCeiling = await h.departmentWithUnit(`P-BVC${counter}`);
      const later = await headless();
      await h.ctx.sql.query(`UPDATE departments SET effective_from = $2 WHERE id = $1`, [later.id, `${h.next}-01-01`]);

      refusedWith(await create(baselineBody(noCeiling)), 'DEPARTMENT_NOT_IN_CYCLE');
      refusedWith(await create(baselineBody(later)), 'DEPARTMENT_NOT_IN_CYCLE');
    });

    it('when the department has a successor named from tomorrow, and counts neither a term that was cancelled nor another department (F-080)', async () => {
      const successor = await headless();
      const cancelled = await headless();
      const other = await headless();
      const tomorrow = addDays(h.today(), 1);
      // The table keeps no term that ends before it begins: a term cancelled before it began is gone.
      const head = async (department: Department) => {
        const person = await h.staff(department, `BVN${(counter += 1)}`, 'MANAGER');
        await h.ctx.sql.query(
          `INSERT INTO department_head_periods (id, organization_id, department_id, employee_id, valid_from)
           VALUES (gen_random_uuid(), $1, $2, $3, $4::date)`,
          [h.seed.organizationId, department.id, person.employeeId, tomorrow],
        );
      };
      await head(successor);
      await head(cancelled);
      await h.withoutHead(cancelled);

      refusedWith(await create(baselineBody(successor)), 'HAS_SUCCESSOR');
      await create(baselineBody(cancelled)).expect(201);
      await create(baselineBody(other)).expect(201);
    });

    it('when the cycle of the year was never published', async () => {
      const department = await headless();
      await h.ctx.sql.query(
        `UPDATE budget_cycles SET first_published_at = NULL, published_at = NULL, published_by_employee_id = NULL WHERE year = $1`,
        [h.year],
      );
      try {
        refusedWith(await create(baselineBody(department)), 'CYCLE_NOT_PUBLISHED');
      } finally {
        await h.ctx.sql.query(
          `UPDATE budget_cycles SET first_published_at = now(), published_at = now(), published_by_employee_id = $2 WHERE year = $1`,
          [h.year, h.finance.employeeId],
        );
      }
    });
  });

  it('answers 409 FINANCE.SETUP_INCOMPLETE when the department has no Cost Center in use', async () => {
    const department = await headless();
    await h.ctx.sql.query(`UPDATE cost_centers SET status = 'INACTIVE', deactivated_at = now() WHERE id = $1`, [
      department.unitId,
    ]);

    const refused = await create(baselineBody(department)).expect(409);

    expect(h.codeOf(refused)).toBe('FINANCE.SETUP_INCOMPLETE');
  });

  it('goes on when the cycle was published once and is open again: the first publication counts, not the last (F-085)', async () => {
    const department = await headless();
    await h.ctx.sql.query(
      `UPDATE budget_cycles SET published_at = NULL, published_by_employee_id = NULL WHERE year = $1`,
      [h.year],
    );
    try {
      await create(baselineBody(department)).expect(201);
    } finally {
      await h.ctx.sql.query(
        `UPDATE budget_cycles SET published_at = now(), published_by_employee_id = $2 WHERE year = $1`,
        [h.year, h.finance.employeeId],
      );
    }
  });

  it('builds a version with a base of zero for a department that runs nothing, and leaves out a line that costs nothing (F-086)', async () => {
    counter += 1;
    const empty = await h.departmentWithUnit(`P-BVZ${counter}`);
    await inCycle(empty);
    // The 10 seats are bought and none is held: a line of seats nobody holds costs nothing.
    const free = await headless();
    const emptyMade = h.dataOf<VersionBody>(await create(baselineBody(empty)).expect(201)).version;
    const freeMade = h.dataOf<VersionBody>(await create(baselineBody(free)).expect(201)).version;

    expect([emptyMade.base.amount, freeMade.base.amount]).toEqual(['0', '0']);
    const lines = await h.ctx.sql.query(`SELECT 1 FROM budget_version_lines WHERE version_id = ANY($1::uuid[])`, [
      [emptyMade.id, freeMade.id],
    ]);
    expect(lines.rows).toHaveLength(0);
  });

  describe('the second call for the same Cost Center and year (F-079)', () => {
    it('answers 409 BUDGET.VERSION_IN_FLIGHT while the first version is a draft, and builds nothing more', async () => {
      const department = await headless();
      await create(baselineBody(department)).expect(201);

      const second = await create(baselineBody(department)).expect(409);

      expect(h.codeOf(second)).toBe('BUDGET.VERSION_IN_FLIGHT');
      const { rows } = await h.ctx.sql.query(`SELECT 1 FROM budget_versions WHERE cost_center_id = $1 AND year = $2`, [
        department.unitId,
        h.year,
      ]);
      expect(rows).toHaveLength(1);
    });

    it('answers 409 BUDGET.CURRENT_EXISTS when a version is the current budget', async () => {
      const department = await headless();
      const made = h.dataOf<VersionBody>(await create(baselineBody(department)).expect(201)).version;
      await h.ctx.sql.query(
        `UPDATE budget_versions SET state = 'APPROVED', sent_at = now(), sent_by_employee_id = $2 WHERE id = $1`,
        [made.id, h.finance.employeeId],
      );

      const second = await create(baselineBody(department)).expect(409);

      expect(h.codeOf(second)).toBe('BUDGET.CURRENT_EXISTS');
    });
  });

  it('holds the cycle while it waits for the lock of the year: the cycle first, then the year, as everywhere in the module (F-084)', async () => {
    const department = await headless();
    const holder = new Client({ connectionString: h.ctx.database.url });
    const observer = new Client({ connectionString: h.ctx.database.url });
    await holder.connect();
    await observer.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        budgetYearLockKey(department.unitId, h.year),
      ]);
      const made = create(baselineBody(department)).then((response) => response);
      await waitForLockWaiters(observer, 1);
      await observer.query('BEGIN');
      // The creation has taken the cycle FOR UPDATE and waits for the year: even a shared lock on it is refused (FOR SHARE only
      // conflicts with FOR UPDATE and FOR NO KEY UPDATE, so a creation that held the cycle FOR SHARE would let this one in).
      const cycleTaken = await observer
        .query(`SELECT id FROM budget_cycles WHERE year = $1 FOR SHARE NOWAIT`, [h.year])
        .then(
          () => false,
          () => true,
        );
      await observer.query('ROLLBACK');
      await holder.query('COMMIT');

      expect(cycleTaken).toBe(true);
      expect((await made).status).toBe(201);
    } finally {
      await holder.query('ROLLBACK').catch(() => undefined);
      await holder.end();
      await observer.end();
    }
  });

  it('is for Finance only: the Super Admin, the IT Admin, the spending approver and an employee get 403 (AC-5, F-081)', async () => {
    const department = await headless();
    const employee = await h.staff(department, `BVE${counter}`);

    const approver = await h.staff(department, `BVA${counter}`);
    await h.setRole('SPENDING_APPROVER', approver);
    for (const headers of [
      { Authorization: `Bearer ${h.admin}` },
      h.as(h.it1),
      h.as(employee.account),
      h.as(approver.account),
    ]) {
      const refused = await request(h.server())
        .post('/api/v1/budget-versions')
        .set(headers)
        .send(baselineBody(department));
      expect([refused.status, h.codeOf(refused)]).toEqual([403, 'AUTHORIZATION.FORBIDDEN']);
    }
  });

  it('turns away a body that mixes the two sources, or leaves out what its source needs, naming the kind of fault and the path (422, F-077, F-099)', async () => {
    const department = await headless();
    const proposalId = '5b1b4f7e-0a52-4b0e-9f5b-9f3c1a2d7e10';
    // The answer names the kind of the fault, and the path when the fault is a field that is missing or wrong: a field a source does
    // not take is `unrecognized_keys` (the same wire as every strict body of the API).
    const bodies: [object, string, string][] = [
      [{ source: 'BASELINE', costCenterId: department.unitId }, 'invalid_type', 'year'],
      [{ ...baselineBody(department), proposalId }, 'unrecognized_keys', ''],
      [{ ...baselineBody(department), base: h.money(1) }, 'unrecognized_keys', ''],
      [{ ...baselineBody(department), reserve: h.money(1) }, 'unrecognized_keys', ''],
      [{ ...baselineBody(department), reserveReason: 'x' }, 'unrecognized_keys', ''],
      [{ ...baselineBody(department), quarters: null }, 'unrecognized_keys', ''],
      [{ proposalId, base: h.money(1), year: h.year }, 'unrecognized_keys', ''],
      [{ proposalId, base: h.money(1), costCenterId: department.unitId }, 'unrecognized_keys', ''],
      [{ proposalId }, 'invalid_type', 'base'],
      [{ source: 'OTHER', proposalId, base: h.money(1) }, 'invalid_union', 'source'],
    ];

    for (const [body, code, path] of bodies) {
      const response = await create(body).expect(422);
      const issues = (response.body as { error: { details: { issues: { code: string; path: string }[] } } }).error
        .details.issues;

      expect(h.codeOf(response)).toBe('VALIDATION_ERROR');
      expect(issues).toEqual([expect.objectContaining({ code, path })]);
    }
  });
});
