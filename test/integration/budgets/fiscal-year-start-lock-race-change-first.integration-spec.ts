import type { Client } from 'pg';
import { FISCAL_KEY, FiscalYearStartLockHarness } from '../../support/fiscal-year-start-lock-harness';
import { waitForLockWaiters } from '../../support/lock-wait';

const h = new FiscalYearStartLockHarness();

const FIRST_VERSION = () => ({
  base: h.money(60_000_000),
  reserve: h.money(20_000_000),
  reserveReason: 'Test reserve',
});

/**
 * `b01-fiscal-year-start-lock`: the same meeting in the other order (`US-01-04` AC-8): the change holds the lock of the key, frozen at the row of the value, the creation
 * arrives and waits, and the change is released first. The creation is then made under the month the change set.
 */
describe('a change of the fiscal year start month being made against a first version (integration, real PostgreSQL)', () => {
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

  it('a change being made first: the creation waits for it and is made under the new month', async () => {
    const proposal = await h.waitingProposal();
    const closed = await h.currentRow();
    // The change takes the exclusive lock of the month, then waits at the row of the value that this connection holds.
    const frozen = await frozenConnection();
    await frozen.query(`SELECT id FROM parameter_values WHERE key = $1 AND valid_to IS NULL FOR UPDATE`, [FISCAL_KEY]);

    const change = h.setParameter(FISCAL_KEY, 6).then((response) => response);
    await waitForLockWaiters(h.ctx.sql, 1);
    // A supertest request is only sent when it is awaited, so `then` starts it now.
    const creation = h.createVersion({ proposalId: proposal.id, ...FIRST_VERSION() }).then((response) => response);
    await waitForLockWaiters(h.ctx.sql, 2);
    await frozen.query('ROLLBACK');
    const [changed, created] = await Promise.all([change, creation]);

    expect(changed.status).toBe(200);
    expect(created.status).toBe(201);
    const now = await h.currentRow();
    expect(now?.value).toBe(6);
    expect(now?.validFrom.getTime()).toBeGreaterThan(closed?.validFrom.getTime() ?? 0);
    // The version was made after the change committed, so it was made under the month the change set.
    const { rows } = await h.ctx.sql.query<{ created_at: Date }>(`SELECT created_at FROM budget_versions`);
    expect(rows).toHaveLength(1);
    expect(rows[0].created_at.getTime()).toBeGreaterThanOrEqual(now?.validFrom.getTime() ?? Infinity);
    // And from now on the month does not move.
    expect(h.codeOf(await h.setParameter(FISCAL_KEY, 4).expect(409))).toBe('PARAMETER.LOCKED');
  });
});
