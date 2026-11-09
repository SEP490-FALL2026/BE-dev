import { createHash } from 'node:crypto';
import request from 'supertest';
import { PayloadCipher } from '../../src/modules/notifications/email/payload-cipher.service';
import { bodyOf } from './api-body';
import {
  HttpTestApp,
  SeededInstallation,
  createHttpTestApp,
  insertAccountFixture,
  seedInstallation,
} from './http-test-app';

/** Password self-service over HTTP: the set-up the specs of forgetting, resetting and changing a password share. */
export const hashOf = (token: string) => createHash('sha256').update(token).digest('hex');

/** The refresh token a sign-in response carries in its body. */
export function refreshTokenOf(response: request.Response): string {
  return bodyOf(response).data.refreshToken;
}

export interface TokenRow {
  token_hash: string;
  purpose: string;
  revoked_reason: string | null;
  revoked_at: Date | null;
  consumed_at: Date | null;
  expires_at: Date;
  created_by: string | null;
}

/** The set-up the specs of this file share: the application, its accounts and the calls and reads they make. No assertion lives here. */
export class PasswordSelfServiceHarness {
  ctx!: HttpTestApp;

  seed!: SeededInstallation;

  cipher!: PayloadCipher;

  counter = 0;

  server = () => this.ctx.app.getHttpServer();

  /** An activated account with its own unique email, ready to forget its password. */
  newAccount = async (email?: string) => {
    this.counter += 1;
    const login = email ?? `self.service.${this.counter}@acme.vn`;
    const account = await insertAccountFixture(this.ctx.app, this.seed, {
      code: `E-PS${this.counter}`,
      email: login,
      activated: true,
    });

    return { ...account, email: login };
  };

  clientAddress = 0;

  /** A client address no earlier request in this run has used, so the per-address route limit never interferes. */
  freshAddress = () => {
    this.clientAddress += 1;

    return `10.${Math.floor(this.clientAddress / 250)}.${this.clientAddress % 250}.1`;
  };

  forgot = (email: unknown, address = this.freshAddress()) =>
    request(this.server()).post('/api/v1/auth/password-reset-requests').set('X-Forwarded-For', address).send({ email });

  /** Asks for a link and reads the raw token the way the mail would carry it: from the sealed outbox payload. */
  issueLink = async (account: { appUserId: string; email: string }): Promise<string> => {
    await this.forgot(account.email).expect(202);
    const row = (
      await this.ctx.sql.query<{ id: string; payload_ciphertext: Buffer; payload_key_id: string }>(
        `SELECT o.id, o.payload_ciphertext, o.payload_key_id
             FROM email_outbox o JOIN account_action_tokens t ON t.token_hash = o.action_token_hash
            WHERE t.app_user_id = $1 AND t.purpose = 'RESET_PASSWORD' AND t.revoked_at IS NULL
              AND t.consumed_at IS NULL AND o.status = 'PENDING'`,
        [account.appUserId],
      )
    ).rows[0];

    return this.cipher.decrypt(row.id, row.payload_key_id, row.payload_ciphertext).token as string;
  };

  resetTokensOf = async (appUserId: string): Promise<TokenRow[]> =>
    (
      await this.ctx.sql.query<TokenRow>(
        `SELECT token_hash, purpose, revoked_reason, revoked_at, consumed_at, expires_at, created_by
             FROM account_action_tokens WHERE app_user_id = $1 AND purpose = 'RESET_PASSWORD' ORDER BY created_at, token_hash`,
        [appUserId],
      )
    ).rows;

  mailFor = async (hash: string) =>
    (
      await this.ctx.sql.query<{ status: string; recipient: string; template: string }>(
        'SELECT status, recipient, template FROM email_outbox WHERE action_token_hash = $1',
        [hash],
      )
    ).rows;

  async start() {
    // One hop of trust, so each request can present its own client address: the route limit (T-9) is
    // per address, and a test run sends far more than ten requests from the one machine.
    this.ctx = await createHttpTestApp({ env: { TRUST_PROXY_HOPS: '1' } });
    this.seed = await seedInstallation(this.ctx.app);
    this.cipher = this.ctx.app.get(PayloadCipher, { strict: false });
  }

  async stop() {
    await this.ctx?.close();
  }

  async afterEach() {
    await this.ctx.sql.query('DELETE FROM login_throttles');
  }
}
