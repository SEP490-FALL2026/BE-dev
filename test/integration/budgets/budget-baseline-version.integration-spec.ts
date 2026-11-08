import request from 'supertest';
import { addDays } from '../../support/department-harness';
import { BudgetHarness } from '../../support/budget-harness';
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
  /** A department with a Cost Center, a subscription of 10 seats and nobody heading it. */
  const headless = async (): Promise<Department> => {
    counter += 1;
    const department = await h.departmentWithUnit(`P-BV${counter}`);
    await h.subscription(10, 'K2', department.id);

    return department;
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

    const made = h.dataOf<VersionBody>(await create(baselineBody(department)).expect(201)).version;

    // 10 seats at 1,000,000 a month, running since January 2026: twelve months.
    expect(made.origin).toBe('BASELINE_NO_HEAD');
    expect(made.proposalId).toBeNull();
    expect(made.base.amount).toBe('120000000');
    expect(made.reserve.amount).toBe('12000000');
    const lines = await h.ctx.sql.query<{
      description: string;
      seats: number;
      amount_minor: string;
      proposal_id: string | null;
    }>(`SELECT description, seats, amount_minor::text, proposal_id FROM budget_version_lines WHERE version_id = $1`, [
      made.id,
    ]);
    expect(lines.rows).toHaveLength(1);
    expect(lines.rows[0]).toMatchObject({ seats: 10, amount_minor: '120000000', proposal_id: null });
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

      refusedWith(await create(baselineBody(unit.department)), 'HAS_HEAD');
    });

    it('when a proposal waits, even though nobody heads the department any more', async () => {
      const unit = await h.departmentWithHead(`P-BVP${(counter += 1)}`);
      await h.budgetProposed(unit.head, unit.department.unitId, undefined, h.year);
      await h.withoutHead(unit.department);

      refusedWith(await create(baselineBody(unit.department)), 'HAS_PROPOSAL');
    });

    it('when somebody is to head the department (a department that starts next year with its head named)', async () => {
      const department = await headless();
      const start = `${h.next}-01-01`;
      await setDeadline(h.next, addDays(h.today(), -1));
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

  it('is for Finance only: the Super Admin, the IT Admin and an employee get 403 (AC-5)', async () => {
    const department = await headless();
    const employee = await h.staff(department, `BVE${counter}`);

    for (const headers of [{ Authorization: `Bearer ${h.admin}` }, h.as(h.it1), h.as(employee.account)]) {
      const refused = await request(h.server())
        .post('/api/v1/budget-versions')
        .set(headers)
        .send(baselineBody(department));
      expect([refused.status, h.codeOf(refused)]).toEqual([403, 'AUTHORIZATION.FORBIDDEN']);
    }
  });

  it('turns away a body that mixes the two sources, or leaves out what its source needs (422)', async () => {
    const department = await headless();

    const noYear = await create({ source: 'BASELINE', costCenterId: department.unitId }).expect(422);
    const withProposal = await create({
      ...baselineBody(department),
      proposalId: '5b1b4f7e-0a52-4b0e-9f5b-9f3c1a2d7e10',
    }).expect(422);
    const proposalWithYear = await create({
      proposalId: '5b1b4f7e-0a52-4b0e-9f5b-9f3c1a2d7e10',
      base: h.money(1),
      year: h.year,
    }).expect(422);

    for (const response of [noYear, withProposal, proposalWithYear])
      expect(h.codeOf(response)).toBe('VALIDATION_ERROR');
  });
});
