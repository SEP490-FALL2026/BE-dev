import request from 'supertest';
import { ApiAccount } from '../support/api-accounts';
import { ProvisioningHarness } from '../support/provisioning-harness';

const h = new ProvisioningHarness();

/** SEC-02 of the post-merge review: a leaked IT Admin token cannot empty the vault. */
describe('how many license keys an account may open (integration, real PostgreSQL)', () => {
  let it2: ApiAccount;
  let ids: string[] = [];
  let batch = 0;

  beforeAll(async () => {
    await h.start();
    it2 = await h.account('E-IT2', await h.person('E-IT2'), ['IT_ADMIN']);
    const subscriptionId = await h.subscription(60, 'K4');
    const keys = Array.from(
      { length: 40 },
      (_, index) => `KEY-QUOTA-${String(index + 1).padStart(4, '0')}-ABCDE-12345`,
    );
    await request(h.server())
      .post('/api/v1/license-keys/imports')
      .set(h.as(h.it1))
      .send({ subscriptionId, keys })
      .expect(201);
    ids = (
      await h.ctx.sql.query<{ id: string }>(`SELECT id FROM license_keys WHERE subscription_id = $1 ORDER BY masked`, [
        subscriptionId,
      ])
    ).rows.map((row) => row.id);
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const reveal = (id: string, account: ApiAccount = h.it1) =>
    request(h.server()).post(`/api/v1/license-keys/${id}/reveal`).set(h.as(account));
  const revealedEvents = async (): Promise<number> =>
    Number(
      (
        await h.ctx.sql.query<{ n: string }>(
          `SELECT count(*) AS n FROM audit_events WHERE action = 'LICENSE_KEY.REVEALED'`,
        )
      ).rows[0].n,
    );
  const windowsOf = async (account: ApiAccount) =>
    (
      await h.ctx.sql.query<{ window_kind: string; count: number }>(
        `SELECT window_kind, count FROM license_key_reveal_windows WHERE app_user_id = $1 ORDER BY window_kind`,
        [account.appUserId],
      )
    ).rows;
  const clear = (account: ApiAccount) =>
    h.ctx.sql.query(`DELETE FROM license_key_reveal_windows WHERE app_user_id = $1`, [account.appUserId]);
  const next = () => ids[(batch += 1) % ids.length];

  it('lets an account open ten keys in a minute and refuses the eleventh with 429, leaving no trace of it', async () => {
    await clear(h.it1);
    const before = await revealedEvents();

    for (let index = 0; index < 10; index += 1) await reveal(next()).expect(200);
    const refused = await reveal(next()).expect(429);

    expect(h.codeOf(refused)).toBe('HTTP_TOO_MANY_REQUESTS');
    expect(JSON.stringify(refused.body)).not.toMatch(/KEY-QUOTA/);
    expect(await revealedEvents()).toBe(before + 10);
    // The refused request cost nothing: the minute and the day show ten, not eleven.
    expect(await windowsOf(h.it1)).toEqual([
      { window_kind: 'DAY', count: 10 },
      { window_kind: 'MINUTE', count: 10 },
    ]);
  });

  it('counts per account, not per address: another IT Admin is not held up by the first', async () => {
    await clear(h.it1);
    await clear(it2);
    for (let index = 0; index < 10; index += 1) await reveal(next()).expect(200);
    await reveal(next()).expect(429);

    await reveal(next(), it2).expect(200);

    expect(await windowsOf(it2)).toEqual([
      { window_kind: 'DAY', count: 1 },
      { window_kind: 'MINUTE', count: 1 },
    ]);
  });

  it('gives the last slot of a minute to exactly one of two requests that meet for it', async () => {
    await clear(h.it1);
    await h.ctx.sql.query(
      `INSERT INTO license_key_reveal_windows (app_user_id, window_kind, window_start, count)
       VALUES ($1, 'MINUTE', date_trunc('minute', now()), 9)`,
      [h.it1.appUserId],
    );
    const before = await revealedEvents();

    const answers = await Promise.all([reveal(next()), reveal(next())]);

    expect(answers.map((answer) => answer.status).sort()).toEqual([200, 429]);
    expect(await revealedEvents()).toBe(before + 1);
    expect((await windowsOf(h.it1)).find((window) => window.window_kind === 'MINUTE')?.count).toBe(10);
  });

  it('holds a day to 200 openings whatever the minute, and the count outlives the process because it is in the database', async () => {
    await clear(h.it1);
    await h.ctx.sql.query(
      `INSERT INTO license_key_reveal_windows (app_user_id, window_kind, window_start, count)
       VALUES ($1, 'DAY', date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC', 199)`,
      [h.it1.appUserId],
    );

    await reveal(next()).expect(200);
    const refused = await reveal(next()).expect(429);

    expect(h.codeOf(refused)).toBe('HTTP_TOO_MANY_REQUESTS');
    expect((await windowsOf(h.it1)).find((window) => window.window_kind === 'DAY')?.count).toBe(200);
  });

  it('forgets the windows of days ago, and still answers 404 for a key that does not exist without taking a slot', async () => {
    await clear(h.it1);
    await h.ctx.sql.query(
      `INSERT INTO license_key_reveal_windows (app_user_id, window_kind, window_start, count)
       VALUES ($1, 'DAY', now() - interval '5 days', 3), ($1, 'MINUTE', now() - interval '5 days', 3)`,
      [h.it1.appUserId],
    );

    await reveal('3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11').expect(404);
    expect(await windowsOf(h.it1)).toHaveLength(2);
    await reveal(next()).expect(200);

    const windows = await h.ctx.sql.query<{ old: string }>(
      `SELECT count(*) AS old FROM license_key_reveal_windows WHERE app_user_id = $1 AND window_start < now() - interval '2 days'`,
      [h.it1.appUserId],
    );
    expect(Number(windows.rows[0].old)).toBe(0);
  });
});
