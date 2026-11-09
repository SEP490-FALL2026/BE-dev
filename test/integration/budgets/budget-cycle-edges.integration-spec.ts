import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { BudgetHarness } from '../../support/budget-harness';

const h = new BudgetHarness();

interface CycleWire {
  status: 'NOT_PUBLISHED' | 'PUBLISHED' | 'CHANGED_AFTER_PUBLISH';
  ceilings: Record<string, { explanation: string | null; total: { amount: string } }>;
}

/**
 * The edges of the budget cycle (`QĐ-103i`, F-016…F-024 of the review): a department named twice, a department that stopped, a
 * division that is the same again, two publications at once, a cycle never published when a proposal is sent again, the explanation
 * of a ceiling, and the page of the list.
 */
describe('the budget cycle: edges (integration, real PostgreSQL)', () => {
  let counter = 0;
  const year = () => h.year + 20 + (counter += 1);
  const money = (amount: number | string) => ({ amount: String(amount) });
  const open = (y: number, ceiling = 1_000_000) =>
    request(h.server())
      .post('/api/v1/budget-cycles')
      .set(h.as(h.finance))
      .send({
        year: y,
        submissionDeadline: `${y - 1}-12-01`,
        decisionDeadline: `${y - 1}-12-15`,
        annualCeiling: money(ceiling),
      });
  const put = (y: number, body: object) =>
    request(h.server()).put(`/api/v1/budget-cycles/${y}/department-ceilings`).set(h.as(h.finance)).send(body);
  const patch = (y: number, body: object) =>
    request(h.server()).patch(`/api/v1/budget-cycles/${y}`).set(h.as(h.finance)).send(body);
  const publish = (y: number) => request(h.server()).post(`/api/v1/budget-cycles/${y}/publish`).set(h.as(h.finance));
  const get = (y: number) => request(h.server()).get(`/api/v1/budget-cycles/${y}`).set(h.as(h.finance));
  const activeDepartments = async (): Promise<string[]> =>
    (await h.ctx.sql.query<{ id: string }>(`SELECT id FROM departments WHERE status = 'ACTIVE' ORDER BY id`)).rows.map(
      (row) => row.id,
    );
  const division = async (each: number, reserve: number, extra: Record<string, unknown> = {}) => ({
    sharedPoolReserve: money(reserve),
    departments: (await activeDepartments()).map((departmentId) => ({
      departmentId,
      signedCommitments: money(each),
      plannedSeats: money(0),
      priority: money(0),
      explanation: 'Basis of the ceiling',
      ...extra,
    })),
  });
  const audit = async (y: number, action: string) =>
    (
      await h.ctx.sql.query<{ before: unknown; after: Record<string, unknown> }>(
        `SELECT e.before, e.after FROM audit_events e JOIN budget_cycles c ON c.id::text = e.resource_id
          WHERE c.year = $1 AND e.action = $2 ORDER BY e.occurred_at, e.id`,
        [y, action],
      )
    ).rows;
  const wire = (response: request.Response) => h.dataOf<CycleWire>(response);

  beforeAll(async () => {
    await h.start();
    await h.departmentWithHead('P-EDGE1');
    await h.departmentWithHead('P-EDGE2');
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('turns away a division that names a department twice with 422, and writes nothing (F-016)', async () => {
    const y = year();
    await open(y).expect(201);
    const body = await division(1, 0);
    const twice = { ...body, departments: [...body.departments, body.departments[0]] };

    const refused = await put(y, twice).expect(422);

    expect(h.codeOf(refused)).toBe('VALIDATION_ERROR');
    expect(Object.keys(wire(await get(y).expect(200)).ceilings)).toEqual([]);
  });

  it('refuses a ceiling for a department that stopped, and a publication whose division holds one that stopped (R-I04)', async () => {
    const y = year();
    await open(y).expect(201);
    const stopping = randomUUID();
    await h.ctx.sql.query(
      `INSERT INTO departments (id, organization_id, code, name, updated_at)
       SELECT $1, id, 'P-STOP-' || $2, 'Stopped', now() FROM organizations`,
      [stopping, String(y)],
    );
    // The new department is active, so the division names it too: it is divided, published, and then it stops.
    const withStopping = await division(1, 0);
    await put(y, withStopping).expect(200);
    await publish(y).expect(201);
    await h.ctx.sql.query(`UPDATE departments SET status = 'INACTIVE', deactivated_at = now() WHERE id = $1`, [
      stopping,
    ]);

    const stale = await publish(y).expect(422);
    const entered = await put(y, withStopping).expect(422);

    expect(h.codeOf(stale)).toBe('BUDGET.CEILINGS_INCOMPLETE');
    expect(h.detailsOf(stale)).toMatchObject({ staleDepartmentIds: [stopping] });
    expect(h.codeOf(entered)).toBe('BUDGET.CEILING_DEPARTMENT_INVALID');
    expect(h.detailsOf(entered)).toEqual({ departmentIds: [stopping] });
  });

  it('shows the status of the cycle after each step, and keeps it published when the same division comes again (F-024)', async () => {
    const y = year();
    await open(y).expect(201);
    expect(wire(await get(y).expect(200)).status).toBe('NOT_PUBLISHED');
    await put(y, await division(1, 0)).expect(200);
    expect(wire(await get(y).expect(200)).status).toBe('NOT_PUBLISHED');
    await publish(y).expect(201);
    const sets = (await audit(y, 'BUDGET_CYCLE.CEILINGS_SET')).length;

    await put(y, await division(1, 0)).expect(200);
    await patch(y, {}).expect(200);

    expect(wire(await get(y).expect(200)).status).toBe('PUBLISHED');
    expect(await audit(y, 'BUDGET_CYCLE.CEILINGS_SET')).toHaveLength(sets);
    expect(await audit(y, 'BUDGET_CYCLE.UPDATED')).toHaveLength(0);
    await put(y, await division(2, 0)).expect(200);
    expect(wire(await get(y).expect(200)).status).toBe('CHANGED_AFTER_PUBLISH');
  });

  it('keeps the explanation of a ceiling and records a change of the parts that leaves the total as it was (F-018, F-021)', async () => {
    const y = year();
    await open(y).expect(201);
    const first = await division(0, 0, { explanation: 'Seats planned from the base figures' });
    first.departments = first.departments.map((row) => ({ ...row, signedCommitments: money(5) }));
    await put(y, first).expect(200);
    expect(Object.values(wire(await get(y).expect(200)).ceilings)[0].explanation).toBe(
      'Seats planned from the base figures',
    );

    const second = {
      ...first,
      departments: first.departments.map((row) => ({ ...row, signedCommitments: money(0), priority: money(5) })),
    };
    await put(y, second).expect(200);

    const [, change] = await audit(y, 'BUDGET_CYCLE.CEILINGS_SET');
    const changes = change.after.changes as { before: Record<string, string>; after: Record<string, string> }[];
    expect(changes.length).toBeGreaterThan(0);
    expect(changes[0].before).toMatchObject({ signedCommitmentsMinor: '5', priorityMinor: '0', totalMinor: '5' });
    expect(changes[0].after).toMatchObject({ signedCommitmentsMinor: '0', priorityMinor: '5', totalMinor: '5' });
  });

  it('takes one publication of two made at once, and tells each head once (concurrency)', async () => {
    const y = year();
    await open(y).expect(201);
    await put(y, await division(1, 0)).expect(200);

    const [a, b] = await Promise.all([publish(y), publish(y)]);

    expect([a.status, b.status]).toEqual([201, 201]);
    const cycleId = (await h.ctx.sql.query<{ id: string }>(`SELECT id FROM budget_cycles WHERE year = $1`, [y])).rows[0]
      .id;
    const notices = await h.budgetNoticesOf('BUDGET_DEPARTMENT_CEILING_PUBLISHED', cycleId);
    const perDepartment = new Map<string, number>();
    for (const notice of notices) {
      const id = (notice.params as { departmentId: string }).departmentId;
      perDepartment.set(id, (perDepartment.get(id) ?? 0) + 1);
    }
    expect([...perDepartment.values()].every((count) => count === 1)).toBe(true);
    // Exactly one notice for each department that has a head: the number told is the number of heads.
    const heads = await h.ctx.sql.query<{ n: number }>(
      `SELECT count(DISTINCT p.department_id)::int AS n
         FROM department_head_periods p JOIN departments d ON d.id = p.department_id
        WHERE d.status = 'ACTIVE' AND p.valid_from <= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AND (p.valid_to IS NULL OR p.valid_to > (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)`,
    );
    expect(notices).toHaveLength(heads.rows[0].n);
    expect(perDepartment.size).toBe(heads.rows[0].n);
    expect((await audit(y, 'BUDGET_CYCLE.PUBLISHED')).length).toBeGreaterThanOrEqual(1);
  });

  it('leaves the cycle in a state its figures explain when a division is entered while it is published (concurrency)', async () => {
    const y = year();
    await open(y).expect(201);
    await put(y, await division(1, 0)).expect(200);
    await publish(y).expect(201);
    const bigger = await division(2, 0);

    const [put2, pub2] = await Promise.all([put(y, bigger), publish(y)]);

    expect(put2.status).toBe(200);
    expect([201, 409, 422]).toContain(pub2.status);
    const rows = (
      await h.ctx.sql.query<{ total: string; told: string | null; published: Date | null }>(
        `SELECT d.total_minor::text AS total, d.published_total_minor::text AS told, c.published_at AS published
           FROM budget_department_ceilings d JOIN budget_cycles c ON c.id = d.cycle_id WHERE c.year = $1`,
        [y],
      )
    ).rows;
    expect(rows.every((row) => row.total === '2')).toBe(true);
    // Published means every ceiling was told as it stands now; a cycle not published may hold older figures.
    if (rows[0].published !== null) expect(rows.every((row) => row.told === '2')).toBe(true);
  });

  it('refuses to send a proposal again when the cycle of its year was never published (Q-02)', async () => {
    const u = await h.departmentWithHead(`P-RES${(counter += 1)}`);
    const proposal = await h.budgetProposed(u.head, u.department.unitId);
    await h.giveBack(proposal.id, { reason: 'Add the seats' }, h.finance).expect(200);
    await h.ctx.sql.query(
      `UPDATE budget_cycles SET first_published_at = NULL, published_at = NULL, published_by_employee_id = NULL WHERE year = $1`,
      [h.next],
    );

    try {
      const refused = await h.resubmit(proposal.id, { lines: h.twoLines() }, u.head.account).expect(409);

      expect(h.codeOf(refused)).toBe('BUDGET.CYCLE_NOT_PUBLISHED');
    } finally {
      await h.publishedCycle(h.next);
      await h.ctx.sql.query(
        `UPDATE budget_cycles SET first_published_at = now(), published_at = now(), published_by_employee_id = $2 WHERE year = $1`,
        [h.next, h.finance.employeeId],
      );
    }
    await h.resubmit(proposal.id, { lines: h.twoLines() }, u.head.account).expect(201);
  });

  it('pages the list: the page and the count come from the database, and each row says how much is allocated (F-017)', async () => {
    const years = [year(), year(), year()];
    for (const y of years) await open(y, 100).expect(201);
    await put(years[0], await division(1, 3)).expect(200);

    const page = h.dataOf<{
      items: { year: number; allocated: { amount: string } }[];
      pagination: { totalItems: number; pageSize: number };
    }>(await request(h.server()).get('/api/v1/budget-cycles?page=1&pageSize=2').set(h.as(h.finance)).expect(200));

    expect(page.items).toHaveLength(2);
    expect(page.pagination.pageSize).toBe(2);
    expect(page.pagination.totalItems).toBeGreaterThanOrEqual(3);
    expect(page.items[0].year).toBeGreaterThan(page.items[1].year);
    const all = h.dataOf<{ items: { year: number; allocated: { amount: string } }[] }>(
      await request(h.server()).get('/api/v1/budget-cycles?pageSize=100').set(h.as(h.finance)).expect(200),
    );
    const departments = (await activeDepartments()).length;
    expect(all.items.find((item) => item.year === years[0])?.allocated.amount).toBe(String(departments + 3));
    expect(all.items.find((item) => item.year === years[1])?.allocated.amount).toBe('0');
  });
});
