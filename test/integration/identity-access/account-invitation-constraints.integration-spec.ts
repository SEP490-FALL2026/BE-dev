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

  describe('forbidden role combinations (FR-8.7)', () => {
    it('rejects granting IT_ADMIN or FINANCE to the SUPER_ADMIN holder', async () => {
      await expect(grant(seed.superAdmin.appUserId, 'IT_ADMIN')).rejects.toThrow(/forbidden role combination/i);
      await expect(grant(seed.superAdmin.appUserId, 'FINANCE')).rejects.toThrow(/forbidden role combination/i);
    });

    it('rejects granting SUPER_ADMIN to an account that already holds IT_ADMIN', async () => {
      await ctx.sql.query(
        "UPDATE role_grants SET revoked_at = now() WHERE role = 'SUPER_ADMIN' AND revoked_at IS NULL",
      );
      await grant(b.appUserId, 'IT_ADMIN');

      await expect(grant(b.appUserId, 'SUPER_ADMIN')).rejects.toThrow(/forbidden role combination/i);

      await revokeAll(b.appUserId, 'IT_ADMIN');
      await ctx.sql.query("UPDATE role_grants SET revoked_at = NULL WHERE app_user_id = $1 AND role = 'SUPER_ADMIN'", [
        seed.superAdmin.appUserId,
      ]);
    });

    it('still allows EMPLOYEE next to SUPER_ADMIN', async () => {
      await grant(seed.superAdmin.appUserId, 'EMPLOYEE');
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
