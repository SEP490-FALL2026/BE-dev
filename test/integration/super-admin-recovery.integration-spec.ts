import { TestingModule, Test } from '@nestjs/testing';
import request from 'supertest';
import { RecoveryRefusedError } from '../../src/modules/identity-access/recovery.errors';
import { RecoveryContext, RecoveryResult, RecoveryService } from '../../src/modules/identity-access/recovery.service';
import { PayloadCipher } from '../../src/modules/notifications/payload-cipher';
import {
  ACCOUNT_PASSWORD,
  ApiAccount,
  activateInvitedAccount,
  adminToken,
  createActivatedAccount,
} from '../support/api-accounts';
import {
  HttpTestApp,
  SEED_PASSWORD,
  SeededInstallation,
  createHttpTestApp,
  insertAccountFixture,
  insertEmployeeFixture,
  seedInstallation,
} from '../support/http-test-app';

const NEW_PASSWORD = 'a brand new passphrase 2026';

describe('recovering the Super Admin role outside the application (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let recoveryModule: TestingModule;
  let recovery: RecoveryService;
  let admin: string;
  let it1: ApiAccount;
  let counter = 0;
  let originalCredential: { hash: string; hash_policy_version: number };
  const server = () => ctx.app.getHttpServer();

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    seed = await seedInstallation(ctx.app);
    admin = await adminToken(ctx, seed);
    it1 = await createActivatedAccount(ctx, seed, { code: 'E-IT1', email: 'it1@acme.vn', roles: ['IT_ADMIN'], admin });
    originalCredential = (
      await ctx.sql.query<{ hash: string; hash_policy_version: number }>(
        'SELECT hash, hash_policy_version FROM password_credentials WHERE app_user_id = $1',
        [seed.superAdmin.appUserId],
      )
    ).rows[0];
    // The command's own module graph, on the same database: what the operator's process would load.
    // Imported only now: the configuration module validates the environment the moment it is first loaded.
    const { RecoveryCliModule } = await import('../../src/recovery-cli.module');
    recoveryModule = await Test.createTestingModule({ imports: [RecoveryCliModule] }).compile();
    await recoveryModule.init();
    recovery = recoveryModule.get(RecoveryService);
  }, 120000);

  afterAll(async () => {
    await recoveryModule?.close();
    await ctx?.close();
  });

  const context = (overrides: Partial<RecoveryContext> = {}): RecoveryContext => {
    counter += 1;

    return {
      ticketRef: `R-2026-${String(counter).padStart(3, '0')}`,
      approverRef: 'cto@acme.vn',
      operatorRef: 'ops-1',
      environment: 'SHARED',
      identityCheckRef: 'ID-CHECK-77',
      ...overrides,
    };
  };
  const refusalOf = async (run: () => Promise<RecoveryResult>): Promise<string> => {
    try {
      await run();
    } catch (error) {
      if (error instanceof RecoveryRefusedError) return error.problem;
      throw error;
    }

    return 'NO REFUSAL';
  };
  const login = (email: string, password: string) =>
    request(server()).post('/api/v1/auth/login').send({ email, password });
  const holders = async (): Promise<string[]> =>
    (
      await ctx.sql.query<{ app_user_id: string }>(
        `SELECT app_user_id FROM role_grants WHERE role = 'SUPER_ADMIN' AND revoked_at IS NULL`,
      )
    ).rows.map((row) => row.app_user_id);
  const ticketRow = async (ticketRef: string) =>
    (
      await ctx.sql.query<{ status: string; mode: string; environment: string }>(
        'SELECT status, mode, environment FROM recovery_tickets WHERE ticket_ref = $1',
        [ticketRef],
      )
    ).rows[0];
  const mailsFor = async (ticketRef: string) =>
    (
      await ctx.sql.query<{
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
  const linkTokenOf = async (ticketRef: string): Promise<string> => {
    const mails = await mailsFor(ticketRef);
    const mail = mails[mails.length - 1];
    const cipher = ctx.app.get(PayloadCipher, { strict: false });

    return cipher.decrypt(mail.id, mail.payload_key_id, mail.payload_ciphertext as Buffer).token as string;
  };
  const redeem = (token: string, password = NEW_PASSWORD) =>
    request(server()).post('/api/v1/auth/password-resets').send({ token, newPassword: password });
  const auditOf = async (ticketRef: string) =>
    (
      await ctx.sql.query<{
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
  const restoreHolder = async () => {
    await ctx.sql.query(`UPDATE role_grants SET revoked_at = now() WHERE role = 'SUPER_ADMIN' AND revoked_at IS NULL`);
    await ctx.sql.query(
      `INSERT INTO role_grants (id, organization_id, app_user_id, role) VALUES (gen_random_uuid(), $1, $2, 'SUPER_ADMIN')`,
      [seed.organizationId, seed.superAdmin.appUserId],
    );
    await ctx.sql.query(`UPDATE employees SET status = 'ACTIVE' WHERE id = $1`, [seed.superAdmin.employeeId]);
    await ctx.sql.query(
      `UPDATE app_users SET status = 'ACTIVE', login_email = $2, normalized_login_email = $2,
              email_verification_source = 'BOOTSTRAP_ASSERTED' WHERE id = $1`,
      [seed.superAdmin.appUserId, seed.superAdmin.email],
    );
    await ctx.sql.query(
      `INSERT INTO password_credentials (app_user_id, hash, hash_policy_version) VALUES ($1, $2, $3)
       ON CONFLICT (app_user_id) DO UPDATE SET hash = EXCLUDED.hash, hash_policy_version = EXCLUDED.hash_policy_version`,
      [seed.superAdmin.appUserId, originalCredential.hash, originalCredential.hash_policy_version],
    );
    await ctx.sql.query(
      `UPDATE recovery_tickets SET status = 'SUPERSEDED', completed_at = NULL WHERE status IN ('PENDING', 'AWAITING_ACTIVATION')`,
    );
  };

  afterEach(restoreHolder);

  describe('the holder lost the password (AC-9)', () => {
    it('ends the old credential, every session and link, sends one link to the mailbox, and changes no role', async () => {
      const oldAccess = admin;
      const mails = (await ctx.sql.query<{ n: number }>('SELECT count(*)::int AS n FROM email_outbox')).rows[0].n;
      const ticket = context();

      const result = await recovery.resetCredentials(ticket, { accountEmail: seed.superAdmin.email });

      expect(result).toEqual({
        ticketRef: ticket.ticketRef,
        mode: 'RESET_CREDENTIALS',
        outcome: 'LINK_SENT',
        sentTo: 'LOGIN_EMAIL',
      });
      expect((await login(seed.superAdmin.email, SEED_PASSWORD)).status).toBe(401);
      expect((await request(server()).get('/api/v1/me').set('Authorization', `Bearer ${oldAccess}`)).status).toBe(401);
      expect(await holders()).toEqual([seed.superAdmin.appUserId]);
      const sent = await mailsFor(ticket.ticketRef);
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({ recipient: seed.superAdmin.email, template: 'PASSWORD_RESET' });
      expect((await ctx.sql.query<{ n: number }>('SELECT count(*)::int AS n FROM email_outbox')).rows[0].n).toBe(
        mails + 1,
      );
      expect(await ticketRow(ticket.ticketRef)).toMatchObject({
        status: 'PENDING',
        mode: 'RESET_CREDENTIALS',
        environment: 'SHARED',
      });
    });

    it('lets the holder set the password with the link, and never signs them in (AC-9)', async () => {
      const ticket = context();
      await recovery.resetCredentials(ticket, { accountEmail: seed.superAdmin.email });
      const token = await linkTokenOf(ticket.ticketRef);
      const sessionsBefore = (
        await ctx.sql.query<{ n: number }>(
          'SELECT count(*)::int AS n FROM auth_sessions WHERE app_user_id = $1 AND revoked_at IS NULL',
          [seed.superAdmin.appUserId],
        )
      ).rows[0].n;

      await redeem(token).expect(200);

      expect(sessionsBefore).toBe(0);
      expect(
        (
          await ctx.sql.query<{ n: number }>(
            'SELECT count(*)::int AS n FROM auth_sessions WHERE app_user_id = $1 AND revoked_at IS NULL',
            [seed.superAdmin.appUserId],
          )
        ).rows[0].n,
      ).toBe(0);
      expect((await login(seed.superAdmin.email, NEW_PASSWORD)).status).toBe(200);
      expect(await holders()).toEqual([seed.superAdmin.appUserId]);
      expect(await ticketRow(ticket.ticketRef)).toMatchObject({ status: 'COMPLETED' });
      // The link works once.
      await redeem(token, 'another passphrase 2026').expect(400);
    });

    it('records the ticket, who approved and who ran it, and not one secret (AC-9)', async () => {
      const ticket = context();
      await recovery.resetCredentials(ticket, { accountEmail: seed.superAdmin.email });
      const token = await linkTokenOf(ticket.ticketRef);
      await redeem(token).expect(200);

      const events = await auditOf(ticket.ticketRef);

      expect(events.map((event) => event.action)).toEqual([
        'SUPER_ADMIN.RECOVERY_LINK_ISSUED',
        'SUPER_ADMIN.RECOVERY_COMPLETED',
      ]);
      expect(events[0]).toMatchObject({
        actor_kind: 'OPERATOR',
        operator_reference: ticket.ticketRef,
        resource_id: seed.superAdmin.appUserId,
        after: {
          ticket: ticket.ticketRef,
          approver: 'cto@acme.vn',
          operator: 'ops-1',
          environment: 'SHARED',
          identityCheck: 'ID-CHECK-77',
        },
      });
      const everything = JSON.stringify(events);
      expect(everything).not.toContain(token);
      expect(everything).not.toContain(NEW_PASSWORD);
      expect(everything).not.toContain(SEED_PASSWORD);
    });
  });

  describe('the holder lost the mailbox too (AC-10)', () => {
    it('sends the link only to the new address, and moves the login email only once the link is opened', async () => {
      const ticket = context();

      const result = await recovery.resetCredentials(ticket, {
        accountEmail: seed.superAdmin.email,
        newLoginEmail: 'new.admin@acme.vn',
      });

      expect(result.sentTo).toBe('NEW_EMAIL');
      expect((await mailsFor(ticket.ticketRef)).map((mail) => mail.recipient)).toEqual(['new.admin@acme.vn']);
      // Before the link is opened nothing about the login email has moved.
      const before = await ctx.sql.query<{ login_email: string; email_verification_source: string }>(
        'SELECT login_email, email_verification_source FROM app_users WHERE id = $1',
        [seed.superAdmin.appUserId],
      );
      expect(before.rows[0]).toEqual({
        login_email: seed.superAdmin.email,
        email_verification_source: 'BOOTSTRAP_ASSERTED',
      });

      await redeem(await linkTokenOf(ticket.ticketRef)).expect(200);

      const after = await ctx.sql.query<{ login_email: string; email_verification_source: string }>(
        'SELECT login_email, email_verification_source FROM app_users WHERE id = $1',
        [seed.superAdmin.appUserId],
      );
      expect(after.rows[0]).toEqual({
        login_email: 'new.admin@acme.vn',
        email_verification_source: 'RECOVERY_VERIFIED',
      });
      expect((await login('new.admin@acme.vn', NEW_PASSWORD)).status).toBe(200);
      expect((await login(seed.superAdmin.email, NEW_PASSWORD)).status).toBe(401);
      // The old address learns that the password changed.
      const notices = await ctx.sql.query<{ recipient: string }>(
        `SELECT recipient FROM email_outbox WHERE template = 'PASSWORD_CHANGED_NOTICE' ORDER BY created_at DESC LIMIT 1`,
      );
      expect(notices.rows[0].recipient).toBe(seed.superAdmin.email);
      const completed = (await auditOf(ticket.ticketRef)).at(-1);
      expect(completed).toMatchObject({ action: 'SUPER_ADMIN.RECOVERY_COMPLETED', after: { loginEmailChanged: true } });
    });

    it('refuses an address that already belongs to another account, and changes nothing', async () => {
      const ticket = context();
      const mails = (await ctx.sql.query<{ n: number }>('SELECT count(*)::int AS n FROM email_outbox')).rows[0].n;

      expect(
        await refusalOf(() =>
          recovery.resetCredentials(ticket, { accountEmail: seed.superAdmin.email, newLoginEmail: it1.email }),
        ),
      ).toBe('NEW_EMAIL_TAKEN');

      expect((await login(seed.superAdmin.email, SEED_PASSWORD)).status).toBe(200);
      expect((await ctx.sql.query<{ n: number }>('SELECT count(*)::int AS n FROM email_outbox')).rows[0].n).toBe(mails);
      expect(await ticketRow(ticket.ticketRef)).toBeUndefined();
    });

    it('refuses the link if someone took the new address after it was sent', async () => {
      const ticket = context();
      await recovery.resetCredentials(ticket, {
        accountEmail: seed.superAdmin.email,
        newLoginEmail: 'late.taken@acme.vn',
      });
      await insertAccountFixture(ctx.app, seed, { code: 'E-LATE', email: 'late.taken@acme.vn', activated: true });

      await redeem(await linkTokenOf(ticket.ticketRef)).expect(400);

      expect(
        (await ctx.sql.query('SELECT login_email FROM app_users WHERE id = $1', [seed.superAdmin.appUserId])).rows,
      ).toEqual([{ login_email: seed.superAdmin.email }]);
    });
  });

  describe('running a ticket again (AC-11)', () => {
    it('does nothing the second time once it is completed', async () => {
      const ticket = context();
      await recovery.resetCredentials(ticket, { accountEmail: seed.superAdmin.email });
      await redeem(await linkTokenOf(ticket.ticketRef)).expect(200);
      const mails = (await mailsFor(ticket.ticketRef)).length;

      const again = await recovery.resetCredentials(ticket, { accountEmail: seed.superAdmin.email });

      expect(again.outcome).toBe('ALREADY_COMPLETED');
      expect(await mailsFor(ticket.ticketRef)).toHaveLength(mails);
      expect((await login(seed.superAdmin.email, NEW_PASSWORD)).status).toBe(200);
    });

    it('does not send a second link while the first still works', async () => {
      const ticket = context();
      await recovery.resetCredentials(ticket, { accountEmail: seed.superAdmin.email });

      const again = await recovery.resetCredentials(ticket, { accountEmail: seed.superAdmin.email });

      expect(again.outcome).toBe('LINK_ALREADY_SENT');
      expect(await mailsFor(ticket.ticketRef)).toHaveLength(1);
    });

    it('sends a new link when the first expired, failed or was revoked unused, and the old one stops working', async () => {
      const ticket = context();
      await recovery.resetCredentials(ticket, { accountEmail: seed.superAdmin.email });
      const oldToken = await linkTokenOf(ticket.ticketRef);
      await ctx.sql.query(
        `UPDATE account_action_tokens SET expires_at = now() - interval '1 minute'
          WHERE recovery_ticket_id = (SELECT id FROM recovery_tickets WHERE ticket_ref = $1)`,
        [ticket.ticketRef],
      );

      const again = await recovery.resetCredentials(ticket, { accountEmail: seed.superAdmin.email });

      expect(again.outcome).toBe('LINK_SENT');
      expect(await mailsFor(ticket.ticketRef)).toHaveLength(2);
      await redeem(oldToken).expect(400);
      await redeem(await linkTokenOf(ticket.ticketRef)).expect(200);
    });

    it('refuses the same ticket with other parameters', async () => {
      const ticket = context();
      await recovery.resetCredentials(ticket, { accountEmail: seed.superAdmin.email });

      expect(
        await refusalOf(() =>
          recovery.resetCredentials(ticket, { accountEmail: seed.superAdmin.email, newLoginEmail: 'other@acme.vn' }),
        ),
      ).toBe('TICKET_PARAMETERS_DIFFER');
      expect(await refusalOf(() => recovery.unlock(ticket, { accountEmail: seed.superAdmin.email }))).toBe(
        'TICKET_OF_ANOTHER_KIND',
      );
    });

    it('replaces a ticket that is still waiting when a newer ticket takes the same account', async () => {
      const first = context();
      const second = context();
      await recovery.resetCredentials(first, { accountEmail: seed.superAdmin.email });
      const firstToken = await linkTokenOf(first.ticketRef);

      await recovery.resetCredentials(second, { accountEmail: seed.superAdmin.email });

      expect((await ticketRow(first.ticketRef)).status).toBe('SUPERSEDED');
      await redeem(firstToken).expect(400);
      expect(await refusalOf(() => recovery.resetCredentials(first, { accountEmail: seed.superAdmin.email }))).toBe(
        'TICKET_SUPERSEDED',
      );
      await redeem(await linkTokenOf(second.ticketRef)).expect(200);
    });

    it('sends one link when the same ticket is run twice at the same moment', async () => {
      const ticket = context();

      const answers = await Promise.all([
        recovery.resetCredentials(ticket, { accountEmail: seed.superAdmin.email }),
        recovery.resetCredentials(ticket, { accountEmail: seed.superAdmin.email }),
      ]);

      expect(answers.map((answer) => answer.outcome).sort()).toEqual(['LINK_ALREADY_SENT', 'LINK_SENT']);
      expect(await mailsFor(ticket.ticketRef)).toHaveLength(1);
    });
  });

  describe('who may run it and on whom (AC-13)', () => {
    it('refuses, in a shared environment, an approver who is the operator, and a recipient who is the operator', async () => {
      expect(
        await refusalOf(() =>
          recovery.resetCredentials(context({ approverRef: 'ops-1', operatorRef: 'OPS-1' }), {
            accountEmail: seed.superAdmin.email,
          }),
        ),
      ).toBe('APPROVER_IS_OPERATOR');
      expect(
        await refusalOf(() =>
          recovery.resetCredentials(context({ operatorRef: 'new.admin@acme.vn' }), {
            accountEmail: seed.superAdmin.email,
            newLoginEmail: 'New.Admin@acme.vn',
          }),
        ),
      ).toBe('RECIPIENT_IS_OPERATOR');
      expect((await login(seed.superAdmin.email, SEED_PASSWORD)).status).toBe(200);
    });

    it('lets one person do both in a local test environment, and records that it was a test', async () => {
      const ticket = context({ approverRef: 'dev', operatorRef: 'dev', environment: 'LOCAL_TEST' });

      const result = await recovery.resetCredentials(ticket, { accountEmail: seed.superAdmin.email });

      expect(result.outcome).toBe('LINK_SENT');
      expect(await ticketRow(ticket.ticketRef)).toMatchObject({ environment: 'LOCAL_TEST' });
      expect((await auditOf(ticket.ticketRef))[0].after).toMatchObject({ environment: 'LOCAL_TEST' });
    });

    it('acts only on the holder: not on another account, one that never activated, or a person who left', async () => {
      expect(await refusalOf(() => recovery.resetCredentials(context(), { accountEmail: it1.email }))).toBe(
        'TARGET_NOT_HOLDER',
      );
      expect(await refusalOf(() => recovery.resetCredentials(context(), { accountEmail: 'nobody@acme.vn' }))).toBe(
        'TARGET_NOT_FOUND',
      );
      expect(await refusalOf(() => recovery.resetCredentials(context(), { accountEmail: 'not-an-email' }))).toBe(
        'TARGET_NOT_FOUND',
      );
      await ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [seed.superAdmin.employeeId]);
      expect(await refusalOf(() => recovery.resetCredentials(context(), { accountEmail: seed.superAdmin.email }))).toBe(
        'TARGET_NOT_USABLE',
      );
    });

    it('has no way in from the application: no route, and the installation command cannot fix an account', async () => {
      for (const [method, path] of [
        ['post', '/api/v1/recovery'],
        ['post', '/api/v1/recovery/reset-credentials'],
        ['post', '/api/v1/auth/recovery'],
        ['post', '/api/v1/super-admin-recoveries'],
        ['put', '/api/v1/super-admin-transfers/recover'],
      ] as const) {
        const response = await request(server())
          [method](path)
          .set('Authorization', `Bearer ${await adminToken(ctx, seed)}`)
          .send({});
        expect(response.status).toBe(404);
      }
    });

    it('refuses a ticket reference that is not one', async () => {
      expect(
        await refusalOf(() =>
          recovery.resetCredentials(context({ ticketRef: 'x' }), { accountEmail: seed.superAdmin.email }),
        ),
      ).toBe('TICKET_REFERENCE_INVALID');
    });
  });

  describe('the holder is locked (AC-14)', () => {
    it('opens only that account: no second grant, the role and the employee unchanged', async () => {
      await ctx.sql.query(`UPDATE app_users SET status = 'LOCKED' WHERE id = $1`, [seed.superAdmin.appUserId]);
      const ticket = context();

      const result = await recovery.unlock(ticket, { accountEmail: seed.superAdmin.email });

      expect(result.outcome).toBe('UNLOCKED');
      expect((await login(seed.superAdmin.email, SEED_PASSWORD)).status).toBe(200);
      expect(await holders()).toEqual([seed.superAdmin.appUserId]);
      expect((await auditOf(ticket.ticketRef))[0]).toMatchObject({
        action: 'SUPER_ADMIN.RECOVERY_UNLOCKED',
        actor_kind: 'OPERATOR',
        operator_reference: ticket.ticketRef,
        before: { status: 'LOCKED' },
      });
      expect(await recovery.unlock(ticket, { accountEmail: seed.superAdmin.email })).toMatchObject({
        outcome: 'ALREADY_COMPLETED',
      });
    });

    it('does not bring back a person who left: that is a role transfer', async () => {
      await ctx.sql.query(`UPDATE app_users SET status = 'LOCKED' WHERE id = $1`, [seed.superAdmin.appUserId]);
      await ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [seed.superAdmin.employeeId]);

      expect(await refusalOf(() => recovery.unlock(context(), { accountEmail: seed.superAdmin.email }))).toBe(
        'TARGET_EMPLOYEE_LEFT',
      );

      expect(
        (await ctx.sql.query('SELECT status FROM app_users WHERE id = $1', [seed.superAdmin.appUserId])).rows,
      ).toEqual([{ status: 'LOCKED' }]);
    });

    it('says there was nothing to unlock when the account is not locked, and refuses a non-holder', async () => {
      expect(await recovery.unlock(context(), { accountEmail: seed.superAdmin.email })).toMatchObject({
        outcome: 'NOTHING_TO_UNLOCK',
      });
      expect(await refusalOf(() => recovery.unlock(context(), { accountEmail: it1.email }))).toBe('TARGET_NOT_HOLDER');
    });
  });

  describe('the role has to move to someone else (AC-12)', () => {
    const successorEmployee = async (code: string, email: string | null = `${code.toLowerCase()}@acme.vn`) =>
      insertEmployeeFixture(ctx.app, seed, { code, email });
    const holderLeaves = () =>
      ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [seed.superAdmin.employeeId]);

    it('refuses while the holder can still act', async () => {
      await successorEmployee('E-RS0');

      expect(
        await refusalOf(() =>
          recovery.transferRole(context(), { successorEmployeeCode: 'E-RS0', holderEmail: seed.superAdmin.email }),
        ),
      ).toBe('HOLDER_STILL_USABLE');
      expect(await holders()).toEqual([seed.superAdmin.appUserId]);
    });

    it('moves the role in two stages under one ticket: first an account with no role, then, once it is activated, the role', async () => {
      await successorEmployee('E-RS1');
      await holderLeaves();
      const ticket = context();
      const input = { successorEmployeeCode: 'E-RS1', holderEmail: seed.superAdmin.email };

      const first = await recovery.transferRole(ticket, input);

      expect(first).toMatchObject({ outcome: 'ACCOUNT_CREATED', sentTo: 'WORK_EMAIL' });
      const account = (
        await ctx.sql.query<{ id: string; activation_state: string; status: string }>(
          `SELECT a.id, a.activation_state, a.status FROM app_users a JOIN employees e ON e.id = a.employee_id WHERE e.employee_code = 'E-RS1'`,
        )
      ).rows[0];
      expect(account).toMatchObject({ activation_state: 'INVITED', status: 'ACTIVE' });
      expect((await ctx.sql.query('SELECT 1 FROM role_grants WHERE app_user_id = $1', [account.id])).rows).toEqual([]);
      expect(await holders()).toEqual([seed.superAdmin.appUserId]);
      expect(await ticketRow(ticket.ticketRef)).toMatchObject({ status: 'AWAITING_ACTIVATION' });
      expect((await mailsFor(ticket.ticketRef)).map((mail) => [mail.recipient, mail.template])).toEqual([
        ['e-rs1@acme.vn', 'ACCOUNT_INVITATION'],
      ]);
      expect((await auditOf(ticket.ticketRef))[0]).toMatchObject({
        action: 'SUPER_ADMIN.RECOVERY_ACCOUNT_CREATED',
        actor_kind: 'OPERATOR',
      });

      // Not activated yet: the same ticket says so and sends nothing new while the link works.
      expect(await recovery.transferRole(ticket, input)).toMatchObject({ outcome: 'INVITATION_ALREADY_SENT' });
      await ctx.sql.query(
        `UPDATE account_action_tokens SET expires_at = now() - interval '1 minute' WHERE app_user_id = $1`,
        [account.id],
      );
      expect(await recovery.transferRole(ticket, input)).toMatchObject({ outcome: 'INVITATION_REISSUED' });

      // Activating through the invitation never grants the role.
      await activateInvitedAccount(ctx, account.id);
      expect(await holders()).toEqual([seed.superAdmin.appUserId]);

      const second = await recovery.transferRole(ticket, input);

      expect(second.outcome).toBe('ROLE_TRANSFERRED');
      expect(await holders()).toEqual([account.id]);
      expect(await ticketRow(ticket.ticketRef)).toMatchObject({ status: 'COMPLETED' });
      const events = await auditOf(ticket.ticketRef);
      expect(events.map((event) => event.action)).toEqual([
        'SUPER_ADMIN.RECOVERY_ACCOUNT_CREATED',
        'SUPER_ADMIN.TRANSFERRED_OUT',
        'SUPER_ADMIN.TRANSFERRED_IN',
      ]);
      expect(new Set(events.slice(1).map((event) => event.correlation_id)).size).toBe(1);
      expect(await recovery.transferRole(ticket, input)).toMatchObject({ outcome: 'ALREADY_COMPLETED' });
      // The new holder signs in as Super Admin.
      expect((await login('e-rs1@acme.vn', ACCOUNT_PASSWORD)).status).toBe(200);
    });

    it('gives the role to someone who already has a working account, in one step, when nobody holds it', async () => {
      const successor = await createActivatedAccount(ctx, seed, {
        code: 'E-RS2',
        email: 'rs2@acme.vn',
        roles: [],
        admin: await adminToken(ctx, seed),
      });
      await ctx.sql.query(
        `UPDATE role_grants SET revoked_at = now() WHERE role = 'SUPER_ADMIN' AND revoked_at IS NULL`,
      );

      const result = await recovery.transferRole(context(), { successorEmployeeCode: 'E-RS2' });

      expect(result.outcome).toBe('ROLE_TRANSFERRED');
      expect(await holders()).toEqual([successor.appUserId]);
    });

    it('requires naming the holder when somebody holds the role, and the successor to be a different person', async () => {
      await successorEmployee('E-RS3');
      await holderLeaves();

      expect(await refusalOf(() => recovery.transferRole(context(), { successorEmployeeCode: 'E-RS3' }))).toBe(
        'TARGET_NOT_HOLDER',
      );
      expect(
        await refusalOf(() =>
          recovery.transferRole(context(), { successorEmployeeCode: 'E-ADMIN', holderEmail: seed.superAdmin.email }),
        ),
      ).toBe('SUCCESSOR_IS_HOLDER');
    });

    it('refuses a successor who does not qualify, as the transfer by the holder would (AC-3)', async () => {
      const withItRole = await createActivatedAccount(ctx, seed, {
        code: 'E-RS4',
        email: 'rs4@acme.vn',
        roles: ['IT_ADMIN'],
        admin: await adminToken(ctx, seed),
      });
      const invited = await insertAccountFixture(ctx.app, seed, {
        code: 'E-RS5',
        email: 'rs5@acme.vn',
        activated: false,
      });
      const asserted = await insertAccountFixture(ctx.app, seed, {
        code: 'E-RS6',
        email: 'rs6@acme.vn',
        activated: true,
      });
      await ctx.sql.query(`UPDATE app_users SET email_verification_source = 'BOOTSTRAP_ASSERTED' WHERE id = $1`, [
        asserted.appUserId,
      ]);
      const locked = await createActivatedAccount(ctx, seed, {
        code: 'E-RS7',
        email: 'rs7@acme.vn',
        roles: [],
        admin: await adminToken(ctx, seed),
      });
      await ctx.sql.query(`UPDATE app_users SET status = 'LOCKED' WHERE id = $1`, [locked.appUserId]);
      const left = await createActivatedAccount(ctx, seed, {
        code: 'E-RS8',
        email: 'rs8@acme.vn',
        roles: [],
        admin: await adminToken(ctx, seed),
      });
      await ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [left.employeeId]);
      await holderLeaves();
      const holder = { holderEmail: seed.superAdmin.email };

      const cases: [string, string][] = [
        ['E-RS4', 'WORK_ROLE_HELD'],
        ['E-RS5', 'NOT_ACTIVATED'],
        ['E-RS6', 'EMAIL_NOT_VERIFIED'],
        ['E-RS7', 'ACCOUNT_LOCKED'],
        ['E-RS8', 'EMPLOYEE_NOT_WORKING'],
        ['E-NOBODY', 'SUCCESSOR_NOT_FOUND'],
      ];
      for (const [code, problem] of cases) {
        expect(
          await refusalOf(() => recovery.transferRole(context(), { successorEmployeeCode: code, ...holder })),
        ).toBe(problem);
      }
      expect(await holders()).toEqual([seed.superAdmin.appUserId]);
      expect(withItRole.appUserId).toBeDefined();
      expect(invited.appUserId).toBeDefined();
    });

    it('refuses a successor with no work email to invite', async () => {
      await holderLeaves();
      await insertEmployeeFixture(ctx.app, seed, { code: 'E-RS9', email: null });

      expect(
        await refusalOf(() =>
          recovery.transferRole(context(), { successorEmployeeCode: 'E-RS9', holderEmail: seed.superAdmin.email }),
        ),
      ).toBe('SUCCESSOR_HAS_NO_EMAIL');
    });
  });
});
