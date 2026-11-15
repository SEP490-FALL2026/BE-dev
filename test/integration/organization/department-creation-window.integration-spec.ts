import request from 'supertest';
import { BudgetHarness } from '../../support/budget-harness';

const h = new BudgetHarness();

/**
 * `QĐ-104e(3)`, `QĐ-111ba`, `R-16`, `AC-16`: a department is made only from the opening of the budget cycle of the next year until the
 * first version of that year is sent to the spending approver; it takes effect on 1 January of that year. With no cycle at all (the
 * installation) it takes effect today. A draft cycle and the cycle of this year do not open the window.
 */
describe('the window a department is made in (integration, real PostgreSQL)', () => {
  let counter = 0;
  const create = (code?: string) =>
    request(h.server())
      .post('/api/v1/departments')
      .set({ Authorization: `Bearer ${h.admin}` })
      .send({ code: code ?? `W-${(counter += 1)}`, name: 'Window' });
  const sql = (text: string, values: unknown[] = []) => h.ctx.sql.query(text, values);
  /** The only cycle of the year, as a fixture: a draft (nobody opened it) or open. */
  const cycleOf = async (year: number, state: 'DRAFT' | 'OPEN') => {
    await sql(`DELETE FROM budget_cycles WHERE year = $1`, [year]);
    await sql(
      `INSERT INTO budget_cycles (id, organization_id, year, submission_deadline, decision_deadline, annual_ceiling_minor,
         shared_pool_reserve_minor, currency, opened_by_employee_id, opened_at, updated_at)
       SELECT gen_random_uuid(), o.id, $1, make_date($1, 12, 1), make_date($1, 12, 15), 100000000000000, 0, $2,
              CASE WHEN $4 = 'OPEN' THEN $3::uuid END, CASE WHEN $4 = 'OPEN' THEN now() END, now()
         FROM organizations o`,
      [year, h.reporting, h.finance.employeeId, state],
    );
  };
  const noCycles = () => sql(`DELETE FROM budget_cycles`);

  beforeAll(async () => {
    await h.start();
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('makes a department that takes effect on 1 January of next year while that cycle is open and no version was sent (R-16)', async () => {
    await noCycles();
    await cycleOf(h.next, 'OPEN');

    const made = await create().expect(201);

    expect(h.dataOf<{ effectiveFrom: string }>(made).effectiveFrom).toBe(`${h.next}-01-01`);
  });

  it('refuses a department while the cycle of next year is still a draft (409)', async () => {
    await noCycles();
    await cycleOf(h.next, 'DRAFT');

    const refused = await create().expect(409);

    expect(h.codeOf(refused)).toBe('DEPARTMENT.OUTSIDE_BUDGET_PERIOD');
  });

  it('refuses a department in the middle of the year when only the cycle of this year exists (AC-16)', async () => {
    await noCycles();
    await cycleOf(h.year, 'OPEN');

    const refused = await create().expect(409);

    expect(h.codeOf(refused)).toBe('DEPARTMENT.OUTSIDE_BUDGET_PERIOD');
  });

  it('makes a department that takes effect today when the organization has no cycle at all (installation)', async () => {
    await noCycles();

    const made = await create().expect(201);

    expect(h.dataOf<{ effectiveFrom: string }>(made).effectiveFrom).toBe(h.today());
  });

  it('leaves a department that takes effect next year out of the departments of this year, and puts it among those of next year (QT 4.3)', async () => {
    await noCycles();
    await cycleOf(h.next, 'OPEN');
    const made = h.dataOf<{ id: string }>(await create().expect(201));
    await cycleOf(h.year, 'OPEN');
    const departmentsOf = async (year: number): Promise<string[]> =>
      h
        .dataOf<{ departments: { departmentId: string }[] }>(
          await request(h.server()).get(`/api/v1/budget-cycles/${year}/package`).set(h.as(h.finance)).expect(200),
        )
        .departments.map((department) => department.departmentId);

    expect(await departmentsOf(h.year)).not.toContain(made.id);
    expect(await departmentsOf(h.next)).toContain(made.id);
  });

  // Last: the version it sends stays in the database, and from then on the window of next year is closed.
  it('refuses a department once the first version of next year was sent to the spending approver, and not before (R-16)', async () => {
    await noCycles();
    await cycleOf(h.next, 'OPEN');
    const u = await h.departmentWithHead(`P-WIN${(counter += 1)}`);
    const proposal = await h.budgetProposed(u.head, u.department.unitId);
    const version = await h.built(proposal.id);
    // A version still being drafted is not sent: the window is open.
    await create().expect(201);

    await h.sendVersion(version.id).expect(200);

    expect(h.codeOf(await create().expect(409))).toBe('DEPARTMENT.OUTSIDE_BUDGET_PERIOD');
  });
});
