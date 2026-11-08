import { Client } from 'pg';
import request from 'supertest';
import { BudgetHarness } from '../../support/budget-harness';
import { waitForLockWaiters } from '../../support/lock-wait';
import { PgRelay } from '../../support/pg-relay';
import { QueryCounter, dataStatements } from '../../support/query-count';

const h = new BudgetHarness();

interface CycleWire {
  status: 'NOT_PUBLISHED' | 'PUBLISHED' | 'CHANGED_AFTER_PUBLISH';
  annualCeiling: { amount: string; currency: string };
}

/**
 * The checks the review of `qd103-budget-cycle-ceilings` asked for (R3): the number of statements of the list, the order of the locks
 * of a resubmission, a cycle in another currency, an explanation changed alone, the explanation required to publish, and who may be
 * told that a cycle was not published.
 */
describe('the budget cycle: what the review of R3 asked for (integration, real PostgreSQL)', () => {
  let relay: PgRelay;
  let counter: QueryCounter;
  let years = 0;
  const year = () => h.year + 40 + (years += 1);
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
  const division = async (each: number, explanation: string | null = 'Basis of the ceiling') => ({
    sharedPoolReserve: money(0),
    departments: (await activeDepartments()).map((departmentId) => ({
      departmentId,
      signedCommitments: money(each),
      plannedSeats: money(0),
      priority: money(0),
      ...(explanation === null ? {} : { explanation }),
    })),
  });

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
    await h.departmentWithHead('P-R3A');
    await h.departmentWithHead('P-R3B');
  }, 240000);

  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });

  it('answers a page of the list in the same number of statements however many cycles there are (F-017)', async () => {
    for (let i = 0; i < 3; i += 1) await open(year(), 100).expect(201);
    // The page holds every cycle of the test: a statement per row would show as more statements when there are more rows.
    const page = () => request(h.server()).get('/api/v1/budget-cycles?page=1&pageSize=100').set(h.as(h.finance));
    const few = await counter.run(() => page().expect(200));
    for (let i = 0; i < 6; i += 1) await open(year(), 100).expect(201);
    const many = await counter.run(() => page().expect(200));

    expect(dataStatements(many.statements)).toHaveLength(dataStatements(few.statements).length);
  });

  it('takes the cycle before the proposal when a proposal is sent again, so a writer of the cycle never waits for a proposal (F-019)', async () => {
    const u = await h.departmentWithHead('P-R3L');
    const proposal = await h.budgetProposed(u.head, u.department.unitId);
    await h.giveBack(proposal.id, { reason: 'Add the seats' }, h.finance).expect(200);
    const holder = new Client({ connectionString: h.ctx.database.url });
    const observer = new Client({ connectionString: h.ctx.database.url });
    await holder.connect();
    await observer.connect();
    try {
      await holder.query('BEGIN');
      await holder.query(`SELECT id FROM budget_cycles WHERE year = $1 FOR UPDATE`, [h.next]);

      const resent = h.resubmit(proposal.id, { lines: h.twoLines() }, u.head.account).then((response) => response);
      await waitForLockWaiters(observer, 1);
      // The resubmission waits for the cycle: it holds nothing of the proposal yet, so anybody else can lock the proposal.
      await observer.query('BEGIN');
      const free = await observer.query(`SELECT id FROM budget_proposals WHERE id = $1 FOR UPDATE NOWAIT`, [
        proposal.id,
      ]);
      await observer.query('ROLLBACK');
      await holder.query('COMMIT');

      expect(free.rows).toHaveLength(1);
      expect((await resent).status).toBe(201);
    } finally {
      await holder.query('ROLLBACK').catch(() => undefined);
      await holder.end();
      await observer.end();
    }
  });

  it('tells a head of another department that the proposal does not exist, whatever the state of the cycle (F-030)', async () => {
    const owner = await h.departmentWithHead('P-R3O');
    const stranger = await h.departmentWithHead('P-R3S');
    const proposal = await h.budgetProposed(owner.head, owner.department.unitId);
    await h.giveBack(proposal.id, { reason: 'Add the seats' }, h.finance).expect(200);
    await h.ctx.sql.query(
      `UPDATE budget_cycles SET first_published_at = NULL, published_at = NULL, published_by_employee_id = NULL WHERE year = $1`,
      [h.next],
    );

    try {
      const refused = await h.resubmit(proposal.id, { lines: h.twoLines() }, stranger.head.account).expect(404);

      expect(h.codeOf(refused)).toBe('BUDGET.PROPOSAL_NOT_FOUND');
    } finally {
      await h.ctx.sql.query(
        `UPDATE budget_cycles SET first_published_at = now(), published_at = now(), published_by_employee_id = $2 WHERE year = $1`,
        [h.next, h.finance.employeeId],
      );
    }
  });

  it('keeps the amounts of a cycle in the currency it was opened in, whatever the reporting currency is now (F-022)', async () => {
    const y = year();
    await open(y, 100).expect(201);
    // The reporting currency stays VND (no minor unit); the cycle is kept in AUD (two decimals).
    await h.ctx.sql.query(`UPDATE budget_cycles SET currency = 'AUD' WHERE year = $1`, [y]);

    const changed = await patch(y, { annualCeiling: money(1000), reason: 'The company grew' }).expect(200);
    await put(y, await division(5)).expect(200);

    expect(h.dataOf<CycleWire>(changed).annualCeiling).toEqual({ amount: '1000.00', currency: 'AUD' });
    const stored = await h.ctx.sql.query<{ annual: string; ceiling: string }>(
      `SELECT c.annual_ceiling_minor::text AS annual, d.signed_commitments_minor::text AS ceiling
         FROM budget_cycles c JOIN budget_department_ceilings d ON d.cycle_id = c.id WHERE c.year = $1 LIMIT 1`,
      [y],
    );
    expect(stored.rows[0]).toEqual({ annual: '100000', ceiling: '500' });
  });

  it('does not take the publication back when only the explanation changes, and does when a number changes (F-032)', async () => {
    const y = year();
    await open(y).expect(201);
    await put(y, await division(1)).expect(200);
    await publish(y).expect(201);

    await put(y, await division(1, 'A better explanation')).expect(200);
    expect(h.dataOf<CycleWire>(await get(y).expect(200)).status).toBe('PUBLISHED');
    const explained = await h.ctx.sql.query<{ explanation: string }>(
      `SELECT d.explanation FROM budget_department_ceilings d JOIN budget_cycles c ON c.id = d.cycle_id WHERE c.year = $1`,
      [y],
    );
    expect(explained.rows.every((row) => row.explanation === 'A better explanation')).toBe(true);

    await put(y, await division(2, 'A better explanation')).expect(200);
    expect(h.dataOf<CycleWire>(await get(y).expect(200)).status).toBe('CHANGED_AFTER_PUBLISH');
  });

  it('refuses to publish a ceiling with no explanation, and names the departments (W2-N4)', async () => {
    const y = year();
    await open(y).expect(201);
    await put(y, await division(1, null)).expect(200);

    const refused = await publish(y).expect(422);

    expect(h.codeOf(refused)).toBe('BUDGET.CEILINGS_INCOMPLETE');
    const details = h.detailsOf(refused) as {
      explanationMissingDepartmentIds: string[];
      missingDepartmentIds: string[];
    };
    expect(details.explanationMissingDepartmentIds).toEqual(await activeDepartments());
    expect(details.missingDepartmentIds).toEqual([]);
  });

  it('takes the publication back when a division comes again without the explanation of a ceiling (F-046, W2-N4)', async () => {
    const y = year();
    await open(y).expect(201);
    await put(y, await division(1)).expect(200);
    await publish(y).expect(201);

    await put(y, await division(1, null)).expect(200);

    expect(h.dataOf<CycleWire>(await get(y).expect(200)).status).toBe('CHANGED_AFTER_PUBLISH');
    const refused = await publish(y).expect(422);
    expect(h.codeOf(refused)).toBe('BUDGET.CEILINGS_INCOMPLETE');
  });
});
