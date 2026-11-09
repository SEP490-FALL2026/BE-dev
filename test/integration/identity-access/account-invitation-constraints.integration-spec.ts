import { randomUUID } from 'node:crypto';
import {
  HttpTestApp,
  SeededInstallation,
  createHttpTestApp,
  insertAccountFixture,
  seedInstallation,
} from '../../support/http-test-app';

const UNIQUE_VIOLATION = '23505';

describe('account invitation constraints (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let a: { appUserId: string };
  let b: { appUserId: string };

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    seed = await seedInstallation(ctx.app);
    a = await insertAccountFixture(ctx.app, seed, { code: 'E-A', email: 'a@acme.vn', activated: false });
    b = await insertAccountFixture(ctx.app, seed, { code: 'E-B', email: 'b@acme.vn', activated: true });
  }, 90000);

  afterAll(async () => {
    await ctx?.close();
  });

  const grant = async (appUserId: string, role: string) => {
    await ctx.sql.query(
      "UPDATE role_grants SET revoked_at = now() WHERE app_user_id = $1 AND role = 'EMPLOYEE' AND revoked_at IS NULL",
      [appUserId],
    );
    return ctx.sql.query(
      `INSERT INTO role_grants (id, organization_id, app_user_id, role) VALUES ($1, $2, $3, $4::"AppRole")`,
      [randomUUID(), seed.organizationId, appUserId, role],
    );
  };
  const revokeAll = (appUserId: string, role: string) =>
    ctx.sql.query('UPDATE role_grants SET revoked_at = now() WHERE app_user_id = $1 AND role = $2::"AppRole"', [
      appUserId,
      role,
    ]);

  describe('one effective FINANCE grant (QĐ-52d, QĐ-67e)', () => {
    it('rejects a second effective FINANCE grant even when the holder is still INVITED', async () => {
      await grant(a.appUserId, 'FINANCE');

      await expect(grant(b.appUserId, 'FINANCE')).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
    });

    it('keeps the position while the holder is LOCKED', async () => {
      await ctx.sql.query("UPDATE app_users SET status = 'LOCKED' WHERE id = $1", [a.appUserId]);

      await expect(grant(b.appUserId, 'FINANCE')).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
    });

    it('allows a new holder once the grant is revoked, and leaves zero Finance allowed', async () => {
      await revokeAll(a.appUserId, 'FINANCE');
      await grant(b.appUserId, 'FINANCE');
      await revokeAll(b.appUserId, 'FINANCE');
      const { rows } = await ctx.sql.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM role_grants WHERE role = 'FINANCE' AND revoked_at IS NULL",
      );

      expect(rows[0].n).toBe(0);
    });
  });

  describe('one effective role per account (QĐ-95a; replaces the combination trigger of FR-8.7)', () => {
    const insertRaw = (appUserId: string, role: string) =>
      ctx.sql.query(
        `INSERT INTO role_grants (id, organization_id, app_user_id, role) VALUES (gen_random_uuid(), $1, $2, $3::"AppRole")`,
        [seed.organizationId, appUserId, role],
      );

    it('refuses a second effective grant on the SUPER_ADMIN holder, whatever the role', async () => {
      for (const role of ['IT_ADMIN', 'FINANCE', 'EMPLOYEE']) {
        await expect(insertRaw(seed.superAdmin.appUserId, role)).rejects.toMatchObject({
          code: '23505',
          constraint: 'role_grants_one_role_per_account',
        });
      }
    });

    it('refuses SUPER_ADMIN next to an effective IT_ADMIN grant, and leaves the holder unchanged', async () => {
      await ctx.sql.query(
        "UPDATE role_grants SET revoked_at = now() WHERE role = 'SUPER_ADMIN' AND revoked_at IS NULL",
      );
      try {
        await grant(b.appUserId, 'IT_ADMIN');
        await expect(insertRaw(b.appUserId, 'SUPER_ADMIN')).rejects.toMatchObject({
          code: '23505',
          constraint: 'role_grants_one_role_per_account',
        });
      } finally {
        await revokeAll(b.appUserId, 'IT_ADMIN');
        await insertRaw(b.appUserId, 'EMPLOYEE');
        await ctx.sql.query(
          `UPDATE role_grants SET revoked_at = NULL
            WHERE id = (SELECT id FROM role_grants WHERE app_user_id = $1 AND role = 'SUPER_ADMIN' ORDER BY revoked_at DESC LIMIT 1)`,
          [seed.superAdmin.appUserId],
        );
      }
    });
  });

  describe('account action tokens', () => {
    const insertToken = (
      appUserId: string,
      hash: string,
      extra: { consumed?: boolean; revoked?: boolean; expired?: boolean } = {},
    ) =>
      ctx.sql.query(
        `INSERT INTO account_action_tokens (token_hash, app_user_id, purpose, expires_at, consumed_at, revoked_at, revoked_reason)
         VALUES ($1, $2, 'INVITE', ${extra.expired ? "now() - interval '1 day'" : "now() + interval '1 day'"},
                 ${extra.consumed ? 'now()' : 'NULL'}, ${extra.revoked ? 'now()' : 'NULL'},
                 ${extra.revoked ? '\'SUPERSEDED\'::"AccountActionTokenRevokedReason"' : 'NULL'})`,
        [hash, appUserId],
      );

    it('allows one usable token per account and purpose, and counts an expired but unconsumed one', async () => {
      await insertToken(a.appUserId, 'hash-expired', { expired: true });

      await expect(insertToken(a.appUserId, 'hash-second')).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
    });

    it('allows a new token once the previous is revoked or consumed', async () => {
      await ctx.sql.query(
        "UPDATE account_action_tokens SET revoked_at = now(), revoked_reason = 'SUPERSEDED' WHERE token_hash = 'hash-expired'",
      );
      await insertToken(a.appUserId, 'hash-next');
      await ctx.sql.query('UPDATE account_action_tokens SET consumed_at = now() WHERE token_hash = $1', ['hash-next']);
      await insertToken(a.appUserId, 'hash-last');
    });

    it('allows one email per token and rejects a second', async () => {
      const insertMail = () =>
        ctx.sql.query(
          `INSERT INTO email_outbox (id, organization_id, recipient, template, locale, action_token_hash, status, next_attempt_at)
           VALUES ($1, $2, 'a@acme.vn', 'ACCOUNT_INVITATION', 'vi', 'hash-last', 'PENDING', now())`,
          [randomUUID(), seed.organizationId],
        );
      await insertMail();

      await expect(insertMail()).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
    });
  });
});
