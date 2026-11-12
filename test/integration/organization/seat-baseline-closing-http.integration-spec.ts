import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import request from 'supertest';
import { waitForLockWaiters } from '../../support/lock-wait';
import { pretendBusinessToday } from '../../support/pretend-today';
import { SeatHarness } from '../../support/seat-baseline-harness';

const h = new SeatHarness();

describe('a closed seat baseline over HTTP (integration, real PostgreSQL)', () => {
  let subscriptionId: string;

  beforeAll(async () => {
    await h.start();
    pretendBusinessToday(h.ctx.app, '2026-10-01');
  }, 180000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await h.stop();
  });

  const row = (code: string) => ({ employee_code: code, account_identifier: `${code.toLowerCase()}@acme.vn` });
  const state = async () =>
    h.dataOf<{ closed: boolean; closedAt: string | null }>(
      await request(h.server()).get('/api/v1/seat-baseline').set(h.as(h.it1)).expect(200),
    );

  it('is open at the start: the baseline can be imported', async () => {
    expect(await state()).toEqual({ closed: false, closedAt: null });
    subscriptionId = await h.subscription(10);
    await h.person('OPEN1');
    await h.person('OPEN2');

    const { import: written } = await h.written({ subscriptionId }, [row('OPEN1'), row('OPEN2')]);

    expect(written.result?.created).toBe(2);
  });

  it('refuses a confirmation that meets the closing: it waits for it and then finds the baseline closed (AC-6)', async () => {
    const targetId = await h.subscription(5);
    await h.person('RACE1');
    const preview = await h.preview({ subscriptionId: targetId }, [row('RACE1')]);
    const before = await h.count('license_assignments');

    const observer = new Client({ connectionString: h.ctx.database.url });
    await observer.connect();
    let pending: Promise<request.Response> | undefined;
    try {
      await h.ctx.sql.query('BEGIN');
      await h.ctx.sql.query(`INSERT INTO seat_baseline_states (organization_id) VALUES ($1) ON CONFLICT DO NOTHING`, [
        h.seed.organizationId,
      ]);
      await h.ctx.sql.query(
        `UPDATE seat_baseline_states SET closed_at = now(), closed_by_app_user_id = $2 WHERE organization_id = $1`,
        [h.seed.organizationId, randomUUID()],
      );
      let settled = false;
      pending = h.confirm(preview.id, 1).then((response) => {
        settled = true;

        return response;
      });
      // The confirmation holds the state FOR SHARE first (`SeatBaselineService.lockOpen`): it is waiting for the closing, not answered yet.
      await waitForLockWaiters(observer, 1);
      expect(settled).toBe(false);
      await h.ctx.sql.query('COMMIT');
    } finally {
      await h.ctx.sql.query('ROLLBACK').catch(() => undefined);
      await pending?.catch(() => undefined);
      await observer.end();
    }

    const response = await pending;
    expect(response.status).toBe(409);
    expect(h.codeOf(response)).toBe('SEAT_BASELINE.CLOSED');
    expect(await h.count('license_assignments')).toBe(before);
  });

  it('says it is closed, with the time, and closing again changes nothing (AC-6, OI-10)', async () => {
    const closed = await state();
    expect(closed.closed).toBe(true);
    expect(closed.closedAt).not.toBeNull();

    const again = h.dataOf<{ closed: boolean; closedAt: string; alreadyClosed: boolean }>(
      await h.closeBaseline().expect(200),
    );

    expect(again).toEqual({ closed: true, closedAt: closed.closedAt, alreadyClosed: true });
    expect(await h.auditOf('SeatBaseline')).toEqual([]);
  });

  it('turns away an upload, and writes nothing', async () => {
    const targetId = await h.subscription(5);
    await h.person('LATE1');
    const before = await h.count('license_assignments');

    const upload = await h.upload({ subscriptionId: targetId }, h.file([row('LATE1')])).expect(409);

    expect(h.codeOf(upload)).toBe('SEAT_BASELINE.CLOSED');
    expect(await h.count('license_assignments')).toBe(before);
  });

  it('refuses a baseline assignment written by any other path too: the database says no', async () => {
    const targetId = await h.subscription(5);
    const planId = (
      await h.ctx.sql.query<{ plan_id: string }>(`SELECT plan_id FROM subscriptions WHERE id = $1`, [targetId])
    ).rows[0].plan_id;
    const importId = (await h.ctx.sql.query<{ id: string }>(`SELECT id FROM seat_baseline_imports LIMIT 1`)).rows[0].id;
    const holder = await h.person('LATE2');

    await expect(
      h.ctx.sql.query(
        `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id, account_identifier,
           normalized_account_identifier, valid_from, valid_from_basis, baseline_import_id, created_by_app_user_id)
         VALUES ($1, $2, 'PERSONAL', 'BASELINE', $3, $4, $5, 'late2@acme.vn', 'late2@acme.vn', '2026-10-01', 'RECORDED', $6, $7)`,
        [randomUUID(), h.seed.organizationId, planId, targetId, holder, importId, randomUUID()],
      ),
    ).rejects.toMatchObject({ code: '55000' });
  });
});
