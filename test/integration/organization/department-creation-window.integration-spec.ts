import request from 'supertest';
import { BudgetHarness } from '../../support/budget-harness';

const h = new BudgetHarness();

/**
 * `qd103-department-effective-year`, Task 2 (QĐ-104e(3), R-I10, AC-16): a department is made only while the budget cycle of the next
 * year exists and was never published; it takes effect on 1 January of that year. With no cycle at all (the installation) it takes
 * effect today. The cycle of this year does not open the window.
 */
describe('the window a department is made in (integration, real PostgreSQL)', () => {
  let counter = 0;
  const create = (code?: string) =>
    request(h.server())
      .post('/api/v1/departments')
      .set({ Authorization: `Bearer ${h.admin}` })
      .send({ code: code ?? `W-${(counter += 1)}`, name: 'Window' });
  const sql = (text: string, values: unknown[] = []) => h.ctx.sql.query(text, values);
  const cycleOf = async (year: number, state: 'NEVER' | 'PUBLISHED' | 'TAKEN_BACK') => {
    await sql(`DELETE FROM budget_cycles WHERE year = $1`, [year]);
    await sql(
      `INSERT INTO budget_cycles (id, organization_id, year, submission_deadline, decision_deadline, annual_ceiling_minor,
         shared_pool_reserve_minor, currency, opened_by_employee_id, opened_at, published_by_employee_id, published_at,
         first_published_at, updated_at)
       SELECT gen_random_uuid(), o.id, $1, make_date($1, 12, 1), make_date($1, 12, 15), 100000000000000, 0, $2, $3, now(),
              CASE WHEN $4 = 'PUBLISHED' THEN $3::uuid END, CASE WHEN $4 = 'PUBLISHED' THEN now() END,
              CASE WHEN $4 = 'NEVER' THEN NULL ELSE now() END, now()
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

  it('makes a department that takes effect on 1 January of next year while that cycle was never published (R-I10)', async () => {
    await noCycles();
    await cycleOf(h.next, 'NEVER');

    const made = await create().expect(201);

    expect(h.dataOf<{ effectiveFrom: string }>(made).effectiveFrom).toBe(`${h.next}-01-01`);
  });

  it.each([
    ['published once', 'PUBLISHED'],
    ['published and then taken back to be changed', 'TAKEN_BACK'],
  ] as const)('refuses a department once the cycle of next year was %s (409)', async (_name, state) => {
    await noCycles();
    await cycleOf(h.next, state);

    const refused = await create().expect(409);

    expect(h.codeOf(refused)).toBe('DEPARTMENT.OUTSIDE_BUDGET_PERIOD');
  });

  it('refuses a department in the middle of the year when only the cycle of this year exists (AC-16)', async () => {
    await noCycles();
    await cycleOf(h.year, 'NEVER');

    const refused = await create().expect(409);

    expect(h.codeOf(refused)).toBe('DEPARTMENT.OUTSIDE_BUDGET_PERIOD');
  });

  it('makes a department that takes effect today when the organization has no cycle at all (installation)', async () => {
    await noCycles();

    const made = await create().expect(201);

    expect(h.dataOf<{ effectiveFrom: string }>(made).effectiveFrom).toBe(h.today());
  });

  it('leaves a department that takes effect next year out of the division of this year, and puts it in the division of next year (QT 4.3)', async () => {
    await noCycles();
    await cycleOf(h.next, 'NEVER');
    const made = h.dataOf<{ id: string }>(await create().expect(201));
    await cycleOf(h.year, 'NEVER');
    const division = async (year: number, extra: string[] = []) => ({
      sharedPoolReserve: h.money(0),
      departments: [
        ...(
          await sql(`SELECT id FROM departments WHERE status = 'ACTIVE' AND effective_from <= make_date($1, 12, 31)`, [
            year,
          ])
        ).rows.map((row: { id: string }) => row.id),
        ...extra,
      ].map((departmentId) => ({
        departmentId,
        signedCommitments: h.money(1),
        plannedSeats: h.money(0),
        priority: h.money(0),
      })),
    });
    const put = (year: number, body: object) =>
      request(h.server()).put(`/api/v1/budget-cycles/${year}/department-ceilings`).set(h.as(h.finance)).send(body);

    // This year's division is complete without the new department, and may not name it.
    await put(h.year, await division(h.year)).expect(200);
    await request(h.server()).post(`/api/v1/budget-cycles/${h.year}/publish`).set(h.as(h.finance)).expect(201);
    const named = await put(h.year, await division(h.year, [made.id])).expect(422);
    expect(h.codeOf(named)).toBe('BUDGET.CEILING_DEPARTMENT_INVALID');

    // Next year's division needs it.
    await put(h.next, await division(h.next)).expect(200);
    const published = await request(h.server())
      .post(`/api/v1/budget-cycles/${h.next}/publish`)
      .set(h.as(h.finance))
      .expect(201);
    expect(h.dataOf<{ status: string }>(published).status).toBe('PUBLISHED');
  });

  it('never both makes a department and publishes a division that leaves it out when the two come at once (concurrency)', async () => {
    await noCycles();
    await cycleOf(h.next, 'NEVER');
    const body = {
      sharedPoolReserve: h.money(0),
      departments: (
        await sql(`SELECT id FROM departments WHERE status = 'ACTIVE' AND effective_from <= make_date($1, 12, 31)`, [
          h.next,
        ])
      ).rows.map((row: { id: string }) => ({
        departmentId: row.id,
        signedCommitments: h.money(1),
        plannedSeats: h.money(0),
        priority: h.money(0),
      })),
    };
    await request(h.server())
      .put(`/api/v1/budget-cycles/${h.next}/department-ceilings`)
      .set(h.as(h.finance))
      .send(body)
      .expect(200);

    const [made, published] = await Promise.all([
      create(),
      request(h.server()).post(`/api/v1/budget-cycles/${h.next}/publish`).set(h.as(h.finance)),
    ]);

    // Either the department waited for the publication and was refused, or the publication waited and found the department missing.
    expect(made.status === 201 && published.status === 201).toBe(false);
    expect([201, 409]).toContain(made.status);
    expect([201, 422]).toContain(published.status);
    if (made.status === 201) expect(h.codeOf(published)).toBe('BUDGET.CEILINGS_INCOMPLETE');
    if (made.status === 409) expect(h.codeOf(made)).toBe('DEPARTMENT.OUTSIDE_BUDGET_PERIOD');
  });
});
