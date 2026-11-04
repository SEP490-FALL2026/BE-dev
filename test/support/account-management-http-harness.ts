import request from 'supertest';
import { PayloadCipher } from '../../src/modules/notifications/email/payload-cipher.service';
import { bodyOf } from './api-body';
import {
  HttpTestApp,
  SEED_PASSWORD,
  SeededInstallation,
  createHttpTestApp,
  insertEmployeeFixture,
  seedInstallation,
} from './http-test-app';
import { RoleProbeController } from './role-probe.controller';

/** Account management over HTTP: the wire of an account and the set-up the account specs share. */
export const NEW_PASSWORD = 'a long enough passphrase';

export interface AccountView {
  id: string;
  loginEmail: string;
  status: string;
  activationState: string;
  roles: string[];
  roleHistory?: { role: string; revokedAt: string | null }[];
  invitation?: { usable: boolean; delivery: { status: string } | null } | null;
}

export function dataOf<T = AccountView>(response: request.Response): T {
  return (response.body as { data: T }).data;
}

export function errorCode(response: request.Response): string {
  return bodyOf(response).error.code;
}

/** The set-up the specs of this file share: the application, its accounts and the calls and reads they make. No assertion lives here. */
export class AccountManagementHttpHarness {
  ctx!: HttpTestApp;

  seed!: SeededInstallation;

  adminToken!: string;

  counter = 0;

  server = () => this.ctx.app.getHttpServer();

  signIn = async (email: string, password: string): Promise<{ token: string; response: request.Response }> => {
    const response = await request(this.server()).post('/api/v1/auth/login').send({ email, password }).expect(200);
    return { token: bodyOf(response).data.accessToken, response };
  };

  as = (token: string) => ({ Authorization: `Bearer ${token}` });

  admin = {
    post: (path: string, body?: object) => request(this.server()).post(path).set(this.as(this.adminToken)).send(body),
    get: (path: string) => request(this.server()).get(path).set(this.as(this.adminToken)),
    delete: (path: string) => request(this.server()).delete(path).set(this.as(this.adminToken)),
  };

  /** The raw token behind an account's current invitation, read the way the dispatcher would. */
  invitationToken = async (appUserId: string): Promise<string> => {
    const cipher = this.ctx.app.get<PayloadCipher>(PayloadCipher, { strict: false });
    const { rows } = await this.ctx.sql.query<{ id: string; payload_key_id: string; payload_ciphertext: Buffer }>(
      `SELECT o.id, o.payload_key_id, o.payload_ciphertext FROM email_outbox o
           JOIN account_action_tokens t ON t.token_hash = o.action_token_hash
          WHERE t.app_user_id = $1 AND t.consumed_at IS NULL AND t.revoked_at IS NULL AND o.payload_ciphertext IS NOT NULL
          ORDER BY o.created_at DESC LIMIT 1`,
      [appUserId],
    );
    return cipher.decrypt(rows[0].id, rows[0].payload_key_id, rows[0].payload_ciphertext).token as string;
  };

  newEmployee = async (email: string | null = null) => {
    this.counter += 1;
    const code = `E-N${this.counter}`;
    const address = email ?? `user${this.counter}@acme.vn`;
    const { employeeId } = await insertEmployeeFixture(this.ctx.app, this.seed, { code, email: address });
    return { employeeId, email: address, code };
  };

  /** Creates an account through the API and activates it through the invitation, as a user would. */
  activatedAccount = async (roles: string[] = []) => {
    const employee = await this.newEmployee();
    const created = await this.admin
      .post('/api/v1/app-users', { employeeId: employee.employeeId, role: roles[0] ?? 'EMPLOYEE' })
      .expect(201);
    const account = dataOf(created);
    const token = await this.invitationToken(account.id);
    await request(this.server())
      .post('/api/v1/auth/invitations/redeem')
      .send({ token, password: NEW_PASSWORD })
      .expect(200);
    return { ...employee, appUserId: account.id, password: NEW_PASSWORD };
  };

  countAudit = async (action: string, resourceId?: string) =>
    Number(
      (
        await this.ctx.sql.query<{ n: number }>(
          'SELECT count(*)::int AS n FROM audit_events WHERE action = $1 AND ($2::text IS NULL OR resource_id = $2)',
          [action, resourceId ?? null],
        )
      ).rows[0].n,
    );

  async start() {
    this.ctx = await createHttpTestApp({ extraControllers: [RoleProbeController] });
    this.seed = await seedInstallation(this.ctx.app);
    this.adminToken = (await this.signIn(this.seed.superAdmin.email, SEED_PASSWORD)).token;
  }

  async stop() {
    await this.ctx?.close();
  }

  async afterEach() {
    await this.ctx.sql.query('DELETE FROM login_throttles');
  }
}
