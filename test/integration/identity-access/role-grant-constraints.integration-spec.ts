import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import {
  HttpTestApp,
  SeededInstallation,
  createHttpTestApp,
  insertAccountFixture,
  seedInstallation,
} from '../../support/http-test-app';

const UNIQUE_VIOLATION = '23505';

describe('role grant constraints (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let second: { appUserId: string };
  let third: { appUserId: string };

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    seed = await seedInstallation(ctx.app);
    second = await insertAccountFixture(ctx.app, seed, { code: 'E-2', email: 'two@acme.vn', activated: true });
    third = await insertAccountFixture(ctx.app, seed, { code: 'E-3', email: 'three@acme.vn', activated: true });
  }, 90000);

  afterAll(async () => {
    await ctx?.close();
  });

  const grant = (client: Client, appUserId: string, role: string, revoked = false) =>
    client.query(
      `INSERT INTO role_grants (id, organization_id, app_user_id, role, revoked_at)
       VALUES ($1, $2, $3, $4::"AppRole", ${revoked ? 'now()' : 'NULL'})`,
      [randomUUID(), seed.organizationId, appUserId, role],
    );

  const superAdminGrants = async () =>
    Number(
      (
        await ctx.sql.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM role_grants WHERE role = 'SUPER_ADMIN' AND revoked_at IS NULL",
        )
      ).rows[0].n,
    );

  it('starts with exactly one effective SUPER_ADMIN grant from the installation', async () => {
    expect(await superAdminGrants()).toBe(1);
  });

  it('rejects a second effective SUPER_ADMIN grant for another account (US-01-01 AC-14, data part)', async () => {
    await expect(grant(ctx.sql, second.appUserId, 'SUPER_ADMIN')).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
    expect(await superAdminGrants()).toBe(1);
  });

  it('rejects two concurrent SUPER_ADMIN grants once the first is revoked: exactly one survives', async () => {
    await ctx.sql.query("UPDATE role_grants SET revoked_at = now() WHERE role = 'SUPER_ADMIN' AND revoked_at IS NULL");
    expect(await superAdminGrants()).toBe(0);

    const a = new Client({ connectionString: ctx.database.url });
    const b = new Client({ connectionString: ctx.database.url });
    await Promise.all([a.connect(), b.connect()]);
    try {
      const results = await Promise.allSettled([
        grant(a, second.appUserId, 'SUPER_ADMIN'),
        grant(b, third.appUserId, 'SUPER_ADMIN'),
      ]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toMatchObject({ code: UNIQUE_VIOLATION });
      expect(await superAdminGrants()).toBe(1);
    } finally {
      await Promise.all([a.end(), b.end()]);
    }
  });

  it('rejects a duplicate effective (account, role) grant but keeps history of revoked ones', async () => {
    await grant(ctx.sql, third.appUserId, 'EMPLOYEE');
    await expect(grant(ctx.sql, third.appUserId, 'EMPLOYEE')).rejects.toMatchObject({ code: UNIQUE_VIOLATION });

    await ctx.sql.query("UPDATE role_grants SET revoked_at = now() WHERE app_user_id = $1 AND role = 'EMPLOYEE'", [
      third.appUserId,
    ]);
    await grant(ctx.sql, third.appUserId, 'EMPLOYEE');
    await grant(ctx.sql, third.appUserId, 'EMPLOYEE', true);
    const { rows } = await ctx.sql.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM role_grants WHERE app_user_id = $1 AND role = 'EMPLOYEE'",
      [third.appUserId],
    );
    expect(rows[0].n).toBe(3);
  });
});
