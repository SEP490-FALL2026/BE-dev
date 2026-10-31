import { TestingModule, Test } from '@nestjs/testing';
import { Client } from 'pg';
import request from 'supertest';
import { HolderRecoveryApi } from '../../src/modules/identity-access/public/holder-recovery.api';
import { RecoveryRefusedError } from '../../src/modules/identity-access/public/recovery.errors';
import { RecoveryContext, RecoveryResult } from '../../src/modules/identity-access/public/recovery.types';
import { RoleTransferRecoveryApi } from '../../src/modules/identity-access/public/role-transfer-recovery.api';
import { PayloadCipher } from '../../src/modules/notifications/email/payload-cipher.service';
import { ApiAccount, adminToken, createActivatedAccount } from './api-accounts';
import { HttpTestApp, SeededInstallation, createHttpTestApp, seedInstallation } from './http-test-app';

/** Recovering the Super Admin role outside the application: the contracts of the recovery command and the set-up the specs share. */
export const NEW_PASSWORD = 'a brand new passphrase 2026';

/**
 * Resolves once a backend of this database waits for a lock that the connection `holderPid` holds — never guesses with
 * a fixed delay, and never takes another session's lock wait for this one (CP0-06).
 */
export async function waitUntilBlockedBy(observer: Client, holderPid: number, timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { rows } = await observer.query<{ waiting: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM pg_stat_activity
                       WHERE datname = current_database() AND $1::int = ANY (pg_blocking_pids(pid))) AS waiting`,
      [holderPid],
    );
    if (rows[0].waiting) return;
    if (Date.now() > deadline) throw new Error('No backend reached a lock wait in time.');
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

/** The set-up the specs of this file share: the application, its accounts and the calls and reads they make. No assertion lives here. */
export class SuperAdminRecoveryHarness {
  ctx!: HttpTestApp;

  seed!: SeededInstallation;

  recoveryModule!: TestingModule;

  /** The command's two entry services, as one object: the tests below call each mode by name. */
  recovery!: Pick<HolderRecoveryApi, 'resetCredentials' | 'unlock'> & Pick<RoleTransferRecoveryApi, 'transferRole'>;

  admin!: string;

  it1!: ApiAccount;

  counter = 0;

  originalCredential!: { hash: string; hash_policy_version: number };

  server = () => this.ctx.app.getHttpServer();

  context = (overrides: Partial<RecoveryContext> = {}): RecoveryContext => {
    this.counter += 1;

    return {
      ticketRef: `R-2026-${String(this.counter).padStart(3, '0')}`,
      approverRef: 'cto@acme.vn',
      operatorRef: 'ops-1',
      environment: 'SHARED',
      identityCheckRef: 'ID-CHECK-77',
      ...overrides,
    };
  };

  refusalOf = async (run: () => Promise<RecoveryResult>): Promise<string> => {
    try {
      await run();
    } catch (error) {
      if (error instanceof RecoveryRefusedError) return error.problem;
      throw error;
    }

    return 'NO REFUSAL';
  };

  login = (email: string, password: string) =>
    request(this.server()).post('/api/v1/auth/login').send({ email, password });

  holders = async (): Promise<string[]> =>
    (
      await this.ctx.sql.query<{ app_user_id: string }>(
        `SELECT app_user_id FROM role_grants WHERE role = 'SUPER_ADMIN' AND revoked_at IS NULL`,
      )
    ).rows.map((row) => row.app_user_id);

  ticketRow = async (ticketRef: string) =>
    (
      await this.ctx.sql.query<{ status: string; mode: string; environment: string }>(
        'SELECT status, mode, environment FROM recovery_tickets WHERE ticket_ref = $1',
        [ticketRef],
      )
    ).rows[0];

  mailsFor = async (ticketRef: string) =>
    (
      await this.ctx.sql.query<{
        id: string;
        recipient: string;
        template: string;
        payload_key_id: string;
        payload_ciphertext: Buffer | null;
      }>(
        `SELECT o.id, o.recipient, o.template, o.payload_key_id, o.payload_ciphertext FROM email_outbox o
            JOIN account_action_tokens t ON t.token_hash = o.action_token_hash
            JOIN recovery_tickets r ON r.id = t.recovery_ticket_id
           WHERE r.ticket_ref = $1 ORDER BY o.created_at, o.id`,
        [ticketRef],
      )
    ).rows;

  /** The one-time token in the newest mail of the ticket, read the way the mailbox owner would get it. */
  linkTokenOf = async (ticketRef: string): Promise<string> => {
    const mails = await this.mailsFor(ticketRef);
    const mail = mails[mails.length - 1];
    const cipher = this.ctx.app.get(PayloadCipher, { strict: false });

    return cipher.decrypt(mail.id, mail.payload_key_id, mail.payload_ciphertext as Buffer).token as string;
  };

  clientAddress = 0;

  /** A client address no earlier request in this run has used, so a per-address route limit never interferes. */
  freshAddress = () => {
    this.clientAddress += 1;

    return `10.9.${Math.floor(this.clientAddress / 250)}.${(this.clientAddress % 250) + 1}`;
  };

  redeem = (token: string, password = NEW_PASSWORD) =>
    request(this.server())
      .post('/api/v1/auth/password-resets')
      .set('X-Forwarded-For', this.freshAddress())
      .send({ token, newPassword: password });

  auditOf = async (ticketRef: string) =>
    (
      await this.ctx.sql.query<{
        action: string;
        actor_kind: string;
        operator_reference: string | null;
        resource_id: string;
        before: Record<string, unknown> | null;
        after: Record<string, unknown>;
        correlation_id: string;
      }>(
        `SELECT action, actor_kind, operator_reference, resource_id, before, after, correlation_id FROM audit_events
            WHERE after ->> 'ticket' = $1 ORDER BY occurred_at, id`,
        [ticketRef],
      )
    ).rows;

  /** Puts the seeded Super Admin back as the one working holder: the tests below change it on purpose. */
  restoreHolder = async () => {
    await this.ctx.sql.query(
      `UPDATE role_grants SET revoked_at = now() WHERE role = 'SUPER_ADMIN' AND revoked_at IS NULL`,
    );
    await this.ctx.sql.query(
      `INSERT INTO role_grants (id, organization_id, app_user_id, role) VALUES (gen_random_uuid(), $1, $2, 'SUPER_ADMIN')`,
      [this.seed.organizationId, this.seed.superAdmin.appUserId],
    );
    await this.ctx.sql.query(`UPDATE employees SET status = 'ACTIVE' WHERE id = $1`, [this.seed.superAdmin.employeeId]);
    await this.ctx.sql.query(
      `UPDATE app_users SET status = 'ACTIVE', login_email = $2, normalized_login_email = $2,
                email_verification_source = 'BOOTSTRAP_ASSERTED' WHERE id = $1`,
      [this.seed.superAdmin.appUserId, this.seed.superAdmin.email],
    );
    await this.ctx.sql.query(
      `INSERT INTO password_credentials (app_user_id, hash, hash_policy_version) VALUES ($1, $2, $3)
         ON CONFLICT (app_user_id) DO UPDATE SET hash = EXCLUDED.hash, hash_policy_version = EXCLUDED.hash_policy_version`,
      [this.seed.superAdmin.appUserId, this.originalCredential.hash, this.originalCredential.hash_policy_version],
    );
    await this.ctx.sql.query(
      `UPDATE recovery_tickets SET status = 'SUPERSEDED', completed_at = NULL WHERE status IN ('PENDING', 'AWAITING_ACTIVATION')`,
    );
  };

  async start() {
    // One hop of trust, so each request can present its own client address: the reset routes limit each address
    // to ten requests a minute (T-9), and this suite sends more than that from the one machine.
    this.ctx = await createHttpTestApp({ env: { TRUST_PROXY_HOPS: '1' } });
    this.seed = await seedInstallation(this.ctx.app);
    this.admin = await adminToken(this.ctx, this.seed);
    this.it1 = await createActivatedAccount(this.ctx, this.seed, {
      code: 'E-IT1',
      email: 'it1@acme.vn',
      roles: ['IT_ADMIN'],
      admin: this.admin,
    });
    this.originalCredential = (
      await this.ctx.sql.query<{ hash: string; hash_policy_version: number }>(
        'SELECT hash, hash_policy_version FROM password_credentials WHERE app_user_id = $1',
        [this.seed.superAdmin.appUserId],
      )
    ).rows[0];
    // The command's own module graph, on the same database: what the operator's process would load.
    // Imported only now: the configuration module validates the environment the moment it is first loaded.
    const { RecoveryCliModule } = await import('../../src/cli/recover/recover-cli.module');
    this.recoveryModule = await Test.createTestingModule({ imports: [RecoveryCliModule] }).compile();
    await this.recoveryModule.init();
    const holderRecovery = this.recoveryModule.get(HolderRecoveryApi);
    const roleTransfer = this.recoveryModule.get(RoleTransferRecoveryApi);
    this.recovery = {
      resetCredentials: (context, input) => holderRecovery.resetCredentials(context, input),
      unlock: (context, input) => holderRecovery.unlock(context, input),
      transferRole: (context, input) => roleTransfer.transferRole(context, input),
    };
  }

  async stop() {
    await this.recoveryModule?.close();
    await this.ctx?.close();
  }
}
