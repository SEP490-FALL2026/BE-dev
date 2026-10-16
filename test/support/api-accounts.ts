import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { PayloadCipher } from '../../src/modules/notifications/payload-cipher';
import { bodyOf } from './api-body';
import { HttpTestApp, SEED_PASSWORD, SeededInstallation, insertEmployeeFixture } from './http-test-app';

export const ACCOUNT_PASSWORD = 'a long enough passphrase';

export interface ApiAccount {
  appUserId: string;
  employeeId: string;
  email: string;
  /** An access token for the account, signed in through the real login route. */
  accessToken: string;
}

export async function loginAs(app: INestApplication<App>, email: string, password: string): Promise<string> {
  const response = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password }).expect(200);

  return bodyOf(response).data.accessToken;
}

/** The Super Admin of the seeded installation, signed in. */
export const adminToken = (ctx: HttpTestApp, seed: SeededInstallation): Promise<string> =>
  loginAs(ctx.app, seed.superAdmin.email, SEED_PASSWORD);

/**
 * Activates an invited account by redeeming its invitation, with the link read from the sealed outbox
 * payload the way the mail carries it. The account then signs in with `ACCOUNT_PASSWORD`.
 */
export async function activateInvitedAccount(ctx: HttpTestApp, appUserId: string): Promise<void> {
  const cipher = ctx.app.get(PayloadCipher, { strict: false });
  const { rows } = await ctx.sql.query<{ id: string; payload_key_id: string; payload_ciphertext: Buffer }>(
    `SELECT o.id, o.payload_key_id, o.payload_ciphertext FROM email_outbox o
       JOIN account_action_tokens t ON t.token_hash = o.action_token_hash
      WHERE t.app_user_id = $1 AND t.consumed_at IS NULL AND t.revoked_at IS NULL AND o.payload_ciphertext IS NOT NULL
      ORDER BY o.created_at DESC LIMIT 1`,
    [appUserId],
  );
  const token = cipher.decrypt(rows[0].id, rows[0].payload_key_id, rows[0].payload_ciphertext).token as string;
  await request(ctx.app.getHttpServer())
    .post('/api/v1/auth/invitations/redeem')
    .send({ token, password: ACCOUNT_PASSWORD })
    .expect(200);
}

/**
 * An account created, invited and activated through the real workflow (slice 1b), holding exactly
 * `roles`, and signed in.
 */
export async function createActivatedAccount(
  ctx: HttpTestApp,
  seed: SeededInstallation,
  options: { code: string; email: string; roles: string[]; admin: string; employeeId?: string },
): Promise<ApiAccount> {
  // An employee that already exists (for example one entered into another department) keeps their department.
  const employeeId =
    options.employeeId ??
    (await insertEmployeeFixture(ctx.app, seed, { code: options.code, email: options.email })).employeeId;
  const created = await request(ctx.app.getHttpServer())
    .post('/api/v1/app-users')
    .set('Authorization', `Bearer ${options.admin}`)
    .send({ employeeId, roles: options.roles })
    .expect(201);
  const appUserId = (created.body as { data: { id: string } }).data.id;
  await activateInvitedAccount(ctx, appUserId);

  return {
    appUserId,
    employeeId,
    email: options.email,
    accessToken: await loginAs(ctx.app, options.email, ACCOUNT_PASSWORD),
  };
}
