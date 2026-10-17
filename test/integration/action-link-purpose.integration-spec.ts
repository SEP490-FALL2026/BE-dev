import { createHash } from 'node:crypto';
import request from 'supertest';
import { IdentityAccessService } from '../../src/modules/identity-access/identity-access.service';
import { bodyOf } from '../support/api-body';
import {
  HttpTestApp,
  SEED_PASSWORD,
  SeededInstallation,
  createHttpTestApp,
  insertAccountFixture,
  seedInstallation,
} from '../support/http-test-app';

type Purpose = 'INVITE' | 'RESET_PASSWORD';

const hashOf = (token: string) => createHash('sha256').update(token).digest('hex');

describe('action link purposes (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let identity: IdentityAccessService;
  let counter = 0;

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    seed = await seedInstallation(ctx.app);
    identity = ctx.app.get(IdentityAccessService);
  }, 90000);

  afterAll(async () => {
    await ctx?.close();
  });

  const newAccount = async (activated: boolean) => {
    counter += 1;
    const email = `link.${counter}@acme.vn`;
    const account = await insertAccountFixture(ctx.app, seed, { code: `E-L${counter}`, email, activated });

    return { ...account, email };
  };

  const insertToken = async (
    appUserId: string,
    purpose: Purpose,
    options: { expiresInSeconds?: number; consumed?: boolean; revoked?: boolean; createdAt?: string } = {},
  ): Promise<string> => {
    counter += 1;
    const hash = hashOf(`token-${counter}`);
    await ctx.sql.query(
      `INSERT INTO account_action_tokens
         (token_hash, app_user_id, purpose, expires_at, consumed_at, revoked_at, revoked_reason, created_at)
       VALUES ($1, $2, $3::"AccountActionPurpose", now() + ($4 || ' seconds')::interval,
               CASE WHEN $5 THEN now() END, CASE WHEN $6 THEN now() END,
               CASE WHEN $6 THEN 'SUPERSEDED'::"AccountActionTokenRevokedReason" END,
               COALESCE($7::timestamptz, now()))`,
      [
        hash,
        appUserId,
        purpose,
        options.expiresInSeconds ?? 3600,
        !!options.consumed,
        !!options.revoked,
        options.createdAt ?? null,
      ],
    );

    return hash;
  };

  describe('isActionLinkUsable (T-10)', () => {
    it('accepts an invitation for an invited account and a reset for an activated one', async () => {
      const invited = await newAccount(false);
      const activated = await newAccount(true);

      expect(await identity.isActionLinkUsable(await insertToken(invited.appUserId, 'INVITE'))).toBe(true);
      expect(await identity.isActionLinkUsable(await insertToken(activated.appUserId, 'RESET_PASSWORD'))).toBe(true);
    });

    it('does not let a token of one purpose pass for the other state of the account', async () => {
      const invited = await newAccount(false);
      const activated = await newAccount(true);

      expect(await identity.isActionLinkUsable(await insertToken(activated.appUserId, 'INVITE'))).toBe(false);
      expect(await identity.isActionLinkUsable(await insertToken(invited.appUserId, 'RESET_PASSWORD'))).toBe(false);
    });

    it.each([
      ['used', { consumed: true }],
      ['revoked', { revoked: true }],
      ['expired', { expiresInSeconds: -5 }],
    ])('refuses a %s reset link', async (_name, options) => {
      const activated = await newAccount(true);

      expect(await identity.isActionLinkUsable(await insertToken(activated.appUserId, 'RESET_PASSWORD', options))).toBe(
        false,
      );
    });

    it('refuses a reset link once the account is locked or its employee has left (AC-6)', async () => {
      const locked = await newAccount(true);
      const left = await newAccount(true);
      const lockedToken = await insertToken(locked.appUserId, 'RESET_PASSWORD');
      const leftToken = await insertToken(left.appUserId, 'RESET_PASSWORD');
      expect(await identity.isActionLinkUsable(lockedToken)).toBe(true);
      expect(await identity.isActionLinkUsable(leftToken)).toBe(true);

      await ctx.sql.query(`UPDATE app_users SET status = 'LOCKED' WHERE id = $1`, [locked.appUserId]);
      // Fixture only: the offboarding flow that terminates an employee belongs to G6.
      await ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [left.employeeId]);

      expect(await identity.isActionLinkUsable(lockedToken)).toBe(false);
      expect(await identity.isActionLinkUsable(leftToken)).toBe(false);
    });

    it('refuses an unknown token', async () => {
      expect(await identity.isActionLinkUsable(hashOf('nobody-issued-this'))).toBe(false);
    });
  });

  describe('the account detail shows only the invitation (regression for slice 1b)', () => {
    const adminToken = async () => {
      const login = await request(ctx.app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: seed.superAdmin.email, password: SEED_PASSWORD })
        .expect(200);

      return bodyOf(login).data.accessToken;
    };

    const invitationOf = async (appUserId: string) => {
      const response = await request(ctx.app.getHttpServer())
        .get(`/api/v1/app-users/${appUserId}`)
        .set('Authorization', `Bearer ${await adminToken()}`)
        .expect(200);

      return bodyOf(response).data.invitation;
    };

    it('does not present a password-reset token as an invitation', async () => {
      const activated = await newAccount(true);
      await insertToken(activated.appUserId, 'RESET_PASSWORD');

      expect(await invitationOf(activated.appUserId)).toBeNull();
    });

    it('keeps showing the invitation even when a newer reset token exists', async () => {
      const activated = await newAccount(true);
      await insertToken(activated.appUserId, 'INVITE', { consumed: true, createdAt: '2026-10-01T00:00:00Z' });
      await insertToken(activated.appUserId, 'RESET_PASSWORD', { createdAt: '2026-10-10T00:00:00Z' });

      expect(await invitationOf(activated.appUserId)).toMatchObject({ usable: false });
    });
  });
});
