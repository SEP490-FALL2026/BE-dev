import { Client } from 'pg';
import request from 'supertest';
import { BudgetHarness } from '../../support/budget-harness';
import { waitForLockWaiters } from '../../support/lock-wait';
import { PgRelay } from '../../support/pg-relay';
import { QueryCounter, dataStatements } from '../../support/query-count';

const h = new BudgetHarness();

interface CycleWire {
  status: 'DRAFT' | 'OPEN' | 'LOCKED';
  annualCeiling: { amount: string; currency: string };
}

/**
 * The checks the review of `qd103-budget-cycle-ceilings` asked for (R3): the number of statements of the list, the order of the locks
 * of a resubmission, a cycle in another currency, and who may be told that a cycle is not open.
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
        sharedPoolReserve: money(0),
      });
  const patch = (y: number, body: object) =>
    request(h.server()).patch(`/api/v1/budget-cycles/${y}`).set(h.as(h.finance)).send(body);
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

      const resent = h.resubmit(proposal.id, h.bm10(), u.head.account).then((response) => response);
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
    await h.ctx.sql.query(`UPDATE budget_cycles SET opened_at = NULL, opened_by_employee_id = NULL WHERE year = $1`, [
      h.next,
    ]);

    try {
      const refused = await h.resubmit(proposal.id, h.bm10(), stranger.head.account).expect(404);

      expect(h.codeOf(refused)).toBe('BUDGET.PROPOSAL_NOT_FOUND');
    } finally {
      await h.ctx.sql.query(`UPDATE budget_cycles SET opened_at = now(), opened_by_employee_id = $2 WHERE year = $1`, [
        h.next,
        h.finance.employeeId,
      ]);
    }
  });

  it('keeps the amounts of a cycle in the currency it was opened in, whatever the reporting currency is now (F-022)', async () => {
    const y = year();
    await open(y, 100).expect(201);
    // The reporting currency stays VND (no minor unit); the cycle is kept in AUD (two decimals).
    await h.ctx.sql.query(`UPDATE budget_cycles SET currency = 'AUD' WHERE year = $1`, [y]);

    const changed = await patch(y, { annualCeiling: money(1000), sharedPoolReserve: money(10) }).expect(200);

    expect(h.dataOf<CycleWire & { sharedPoolReserve: unknown }>(changed)).toMatchObject({
      annualCeiling: { amount: '1000.00', currency: 'AUD' },
      sharedPoolReserve: { amount: '10.00', currency: 'AUD' },
    });
    const stored = await h.ctx.sql.query<{ annual: string; reserve: string }>(
      `SELECT annual_ceiling_minor::text AS annual, shared_pool_reserve_minor::text AS reserve FROM budget_cycles WHERE year = $1`,
      [y],
    );
    expect(stored.rows[0]).toEqual({ annual: '100000', reserve: '1000' });
  });
});
