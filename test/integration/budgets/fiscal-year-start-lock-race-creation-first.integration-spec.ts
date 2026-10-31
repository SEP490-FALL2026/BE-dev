import type { Client } from 'pg';
import { FISCAL_KEY, FiscalYearStartLockHarness } from '../../support/fiscal-year-start-lock-harness';
import { waitForLockWaiters } from '../../support/lock-wait';

const h = new FiscalYearStartLockHarness();

const FIRST_VERSION = () => ({
  base: h.money(60_000_000),
  reserve: h.money(20_000_000),
  highValuePercent: 50,
});

/**
 * `b01-fiscal-year-start-lock`: the making of the first budget version and a change of the month the fiscal year begins meet at one lock, so they never both succeed
 * on the old answer (`US-01-04` AC-8). The creation is frozen at a row lock behind the lock of the key, the change arrives, and the creation is released:
 * the order is the one the test chose, never a sleep. One file for each order, because a version can not be removed once it exists.
 */
describe('a first version being made against a change of the fiscal year start month (integration, real PostgreSQL)', () => {
  const holders: Client[] = [];

  beforeAll(async () => {
    await h.start();
    // The month must hold a stored row, so that a change has a row to close and to freeze.
    await h.setParameter(FISCAL_KEY, 4).expect(200);
  }, 240000);

  afterEach(async () => {
    for (const client of holders.splice(0)) {
      await client.query('ROLLBACK').catch(() => undefined);
      await client.end().catch(() => undefined);
    }
  });

  afterAll(async () => {
    await h.stop();
  });

  const frozenConnection = async () => {
    const client = await h.holder();
    holders.push(client);

    return client;
  };

  it('a version being made first: the change waits for it, finds it, and is refused with nothing written', async () => {
    const proposal = await h.waitingProposal();
    const before = { row: await h.currentRow(), rows: await h.valueRows(), audits: await h.changeAudits() };
    // The creation takes the shared lock of the month, then waits at the row of the proposal that this connection holds.
    const frozen = await frozenConnection();
    await frozen.query('SELECT id FROM budget_proposals WHERE id = $1 FOR NO KEY UPDATE', [proposal.id]);

    // A supertest request is only sent when it is awaited, so `then` starts it now.
    const creation = h.createVersion({ proposalId: proposal.id, ...FIRST_VERSION() }).then((response) => response);
    await waitForLockWaiters(h.ctx.sql, 1);
    const change = h.setParameter(FISCAL_KEY, 6).then((response) => response);
    await waitForLockWaiters(h.ctx.sql, 2);
    await frozen.query('ROLLBACK');
    const [created, changed] = await Promise.all([creation, change]);

    expect(created.status).toBe(201);
    expect(changed.status).toBe(409);
    expect(h.codeOf(changed)).toBe('PARAMETER.LOCKED');
    expect(await h.budgetRows('budget_versions')).toBe(1);
    expect(await h.currentRow()).toEqual(before.row);
    expect(await h.valueRows()).toBe(before.rows);
    expect(await h.changeAudits()).toBe(before.audits);
  });
});
