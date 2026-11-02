import request from 'supertest';
import {
  ACCOUNT_PASSWORD,
  activateInvitedAccount,
  adminToken,
  createActivatedAccount,
} from '../../support/api-accounts';
import { SEED_PASSWORD, insertAccountFixture, insertEmployeeFixture } from '../../support/http-test-app';
import { SuperAdminRecoveryHarness } from '../../support/super-admin-recovery-harness';
import { setSpendingApprover } from '../../support/builders/account.builder';
import { assignHead } from '../../support/builders/organization.builder';
import { RoleGrantService } from '../../../src/modules/identity-access/accounts/role-grant.service';
import { OrganizationReadApi } from '../../../src/modules/organization/public/organization-read.api';

describe('recovering the Super Admin role outside the application (integration, real PostgreSQL): who may run it, a locked holder and the role that has to move', () => {
  const h = new SuperAdminRecoveryHarness();
  const { server, context, refusalOf, login, holders, ticketRow, mailsFor, auditOf, restoreHolder } = h;

  beforeAll(async () => {
    await h.start();
  }, 120000);

  afterEach(restoreHolder);

  afterAll(async () => {
    await h.stop();
  });

  describe('who may run it and on whom (AC-13)', () => {
    it('refuses, in a shared environment, an approver who is the operator, and a recipient who is the operator', async () => {
      expect(
        await refusalOf(() =>
          h.recovery.resetCredentials(context({ approverRef: 'ops-1', operatorRef: 'OPS-1' }), {
            accountEmail: h.seed.superAdmin.email,
          }),
        ),
      ).toBe('APPROVER_IS_OPERATOR');
      expect(
        await refusalOf(() =>
          h.recovery.resetCredentials(context({ operatorRef: 'new.admin@acme.vn' }), {
            accountEmail: h.seed.superAdmin.email,
            newLoginEmail: 'New.Admin@acme.vn',
          }),
        ),
      ).toBe('RECIPIENT_IS_OPERATOR');
      expect((await login(h.seed.superAdmin.email, SEED_PASSWORD)).status).toBe(200);
    });

    it('lets one person do both in a local test environment, and records that it was a test', async () => {
      const ticket = context({ approverRef: 'dev', operatorRef: 'dev', environment: 'LOCAL_TEST' });

      const result = await h.recovery.resetCredentials(ticket, { accountEmail: h.seed.superAdmin.email });

      expect(result.outcome).toBe('LINK_SENT');
      expect(await ticketRow(ticket.ticketRef)).toMatchObject({ environment: 'LOCAL_TEST' });
      expect((await auditOf(ticket.ticketRef))[0].after).toMatchObject({ environment: 'LOCAL_TEST' });
    });

    it('acts only on the holder: not on another account, one that never activated, or a person who left', async () => {
      expect(await refusalOf(() => h.recovery.resetCredentials(context(), { accountEmail: h.it1.email }))).toBe(
        'TARGET_NOT_HOLDER',
      );
      expect(await refusalOf(() => h.recovery.resetCredentials(context(), { accountEmail: 'nobody@acme.vn' }))).toBe(
        'TARGET_NOT_FOUND',
      );
      expect(await refusalOf(() => h.recovery.resetCredentials(context(), { accountEmail: 'not-an-email' }))).toBe(
        'TARGET_NOT_FOUND',
      );
      await h.ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [h.seed.superAdmin.employeeId]);
      expect(
        await refusalOf(() => h.recovery.resetCredentials(context(), { accountEmail: h.seed.superAdmin.email })),
      ).toBe('TARGET_NOT_USABLE');
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
          .set('Authorization', `Bearer ${await adminToken(h.ctx, h.seed)}`)
          .send({});
        expect(response.status).toBe(404);
      }
    });

    it('refuses a ticket reference that is not one', async () => {
      expect(
        await refusalOf(() =>
          h.recovery.resetCredentials(context({ ticketRef: 'x' }), { accountEmail: h.seed.superAdmin.email }),
        ),
      ).toBe('TICKET_REFERENCE_INVALID');
    });
  });

  describe('the holder is locked (AC-14)', () => {
    it('opens only that account: no second grant, the role and the employee unchanged', async () => {
      await h.ctx.sql.query(`UPDATE app_users SET status = 'LOCKED' WHERE id = $1`, [h.seed.superAdmin.appUserId]);
      const ticket = context();

      const result = await h.recovery.unlock(ticket, { accountEmail: h.seed.superAdmin.email });

      expect(result.outcome).toBe('UNLOCKED');
      expect((await login(h.seed.superAdmin.email, SEED_PASSWORD)).status).toBe(200);
      expect(await holders()).toEqual([h.seed.superAdmin.appUserId]);
      expect((await auditOf(ticket.ticketRef))[0]).toMatchObject({
        action: 'SUPER_ADMIN.RECOVERY_UNLOCKED',
        actor_kind: 'OPERATOR',
        operator_reference: ticket.ticketRef,
        before: { status: 'LOCKED' },
      });
      expect(await h.recovery.unlock(ticket, { accountEmail: h.seed.superAdmin.email })).toMatchObject({
        outcome: 'ALREADY_COMPLETED',
      });
    });

    it('does not bring back a person who left: that is a role transfer', async () => {
      await h.ctx.sql.query(`UPDATE app_users SET status = 'LOCKED' WHERE id = $1`, [h.seed.superAdmin.appUserId]);
      await h.ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [h.seed.superAdmin.employeeId]);

      expect(await refusalOf(() => h.recovery.unlock(context(), { accountEmail: h.seed.superAdmin.email }))).toBe(
        'TARGET_EMPLOYEE_LEFT',
      );

      expect(
        (await h.ctx.sql.query('SELECT status FROM app_users WHERE id = $1', [h.seed.superAdmin.appUserId])).rows,
      ).toEqual([{ status: 'LOCKED' }]);
    });

    it('says there was nothing to unlock when the account is not locked, and refuses a non-holder', async () => {
      expect(await h.recovery.unlock(context(), { accountEmail: h.seed.superAdmin.email })).toMatchObject({
        outcome: 'NOTHING_TO_UNLOCK',
      });
      expect(await refusalOf(() => h.recovery.unlock(context(), { accountEmail: h.it1.email }))).toBe(
        'TARGET_NOT_HOLDER',
      );
    });
  });

  describe('the role has to move to someone else (AC-12)', () => {
    const successorEmployee = async (code: string, email: string | null = `${code.toLowerCase()}@acme.vn`) =>
      insertEmployeeFixture(h.ctx.app, h.seed, { code, email });
    const holderLeaves = () =>
      h.ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [h.seed.superAdmin.employeeId]);

    const countRows = async () => ({
      accounts: Number((await h.ctx.sql.query<{ n: string }>('SELECT count(*) AS n FROM app_users')).rows[0].n),
      tokens: Number(
        (await h.ctx.sql.query<{ n: string }>('SELECT count(*) AS n FROM account_action_tokens')).rows[0].n,
      ),
      tickets: Number((await h.ctx.sql.query<{ n: string }>('SELECT count(*) AS n FROM recovery_tickets')).rows[0].n),
    });
    const mailCount = async () => (await h.ctx.sql.query('SELECT 1 FROM email_outbox')).rows.length;
    const activeSuccessor = async (code: string) =>
      createActivatedAccount(h.ctx, h.seed, {
        code,
        email: `${code.toLowerCase()}@acme.vn`,
        roles: [],
        admin: await adminToken(h.ctx, h.seed),
      });

    it('refuses a successor with no account while the holder can still act, creating nothing', async () => {
      await successorEmployee('E-RS0');
      const before = await countRows();

      expect(
        await refusalOf(() =>
          h.recovery.transferRole(context(), { successorEmployeeCode: 'E-RS0', holderEmail: h.seed.superAdmin.email }),
        ),
      ).toBe('SUCCESSOR_NOT_FOUND_ACCOUNT');

      expect(await countRows()).toEqual(before);
      expect(await holders()).toEqual([h.seed.superAdmin.appUserId]);
    });

    it('moves the role while the holder is still usable: one holder, the old one turned away at the next request, both recorded under one correlation', async () => {
      const u2 = await activeSuccessor('E-RS12');
      const ticket = context();
      const oldHolderToken = await adminToken(h.ctx, h.seed);
      await request(server()).get('/api/v1/app-users').set('Authorization', `Bearer ${oldHolderToken}`).expect(200);

      const result = await h.recovery.transferRole(ticket, {
        successorEmployeeCode: 'E-RS12',
        holderEmail: h.seed.superAdmin.email,
      });

      expect(result.outcome).toBe('ROLE_TRANSFERRED');
      expect(await holders()).toEqual([u2.appUserId]);
      expect(await ticketRow(ticket.ticketRef)).toMatchObject({ status: 'COMPLETED' });
      const events = await auditOf(ticket.ticketRef);
      expect(events.map((event) => event.action).sort()).toEqual([
        'SUPER_ADMIN.TRANSFERRED_IN',
        'SUPER_ADMIN.TRANSFERRED_OUT',
      ]);
      expect(new Set(events.map((event) => event.correlation_id)).size).toBe(1);
      for (const event of events) {
        expect(event.actor_kind).toBe('OPERATOR');
        expect(event.operator_reference).toBe(ticket.ticketRef);
        expect(event.after).toMatchObject({ ticket: ticket.ticketRef, operator: 'ops-1', approver: 'cto@acme.vn' });
      }
      // The roles are read on every request: the old holder keeps the token and loses the role, the successor is let in.
      await request(server()).get('/api/v1/app-users').set('Authorization', `Bearer ${oldHolderToken}`).expect(403);
      await request(server()).get('/api/v1/app-users').set('Authorization', `Bearer ${u2.accessToken}`).expect(200);
    });

    it('rolls a planned transfer back when granting the successor fails after the holder was revoked (US-01-09 AC-4)', async () => {
      const u2 = await activeSuccessor('E-RS21');
      const ticket = context();
      const input = { successorEmployeeCode: 'E-RS21', holderEmail: h.seed.superAdmin.email };
      const grants = h.recoveryModule.get(RoleGrantService, { strict: false });
      const grantFails = jest.spyOn(grants, 'grantRole').mockRejectedValueOnce(new Error('grant failed'));

      try {
        await expect(h.recovery.transferRole(ticket, input)).rejects.toThrow('grant failed');
        expect(grantFails).toHaveBeenCalledTimes(1);
      } finally {
        grantFails.mockRestore();
      }

      // The holder was revoked first inside the same transaction: nothing of it may remain.
      expect(await holders()).toEqual([h.seed.superAdmin.appUserId]);
      expect(await ticketRow(ticket.ticketRef)).toBeUndefined();
      expect(
        (await auditOf(ticket.ticketRef)).filter((event) => event.action.startsWith('SUPER_ADMIN.TRANSFERRED_')),
      ).toEqual([]);
      // The same ticket then moves the role once the fault is gone.
      expect(await h.recovery.transferRole(ticket, input)).toMatchObject({ outcome: 'ROLE_TRANSFERRED' });
      expect(await holders()).toEqual([u2.appUserId]);
    });

    it('refuses an invited successor without sending the invitation again, while the holder can still act', async () => {
      await insertAccountFixture(h.ctx.app, h.seed, { code: 'E-RS13', email: 'rs13@acme.vn', activated: false });
      const before = { ...(await countRows()), mails: await mailCount() };

      expect(
        await refusalOf(() =>
          h.recovery.transferRole(context(), { successorEmployeeCode: 'E-RS13', holderEmail: h.seed.superAdmin.email }),
        ),
      ).toBe('NOT_ACTIVATED');

      expect({ ...(await countRows()), mails: await mailCount() }).toEqual(before);
      expect(await holders()).toEqual([h.seed.superAdmin.appUserId]);
    });

    it('refuses an invited successor on a ticket left awaiting activation, without a new invitation, once the holder can act again', async () => {
      await successorEmployee('E-RS14');
      await holderLeaves();
      const ticket = context();
      const input = { successorEmployeeCode: 'E-RS14', holderEmail: h.seed.superAdmin.email };
      expect(await h.recovery.transferRole(ticket, input)).toMatchObject({ outcome: 'ACCOUNT_CREATED' });
      const account = (
        await h.ctx.sql.query<{ id: string }>(
          `SELECT a.id FROM app_users a JOIN employees e ON e.id = a.employee_id WHERE e.employee_code = 'E-RS14'`,
        )
      ).rows[0];
      await h.ctx.sql.query(`UPDATE employees SET status = 'ACTIVE' WHERE id = $1`, [h.seed.superAdmin.employeeId]);
      await h.ctx.sql.query(
        `UPDATE account_action_tokens SET expires_at = now() - interval '1 minute' WHERE app_user_id = $1`,
        [account.id],
      );
      const before = { ...(await countRows()), mails: await mailCount() };

      expect(await refusalOf(() => h.recovery.transferRole(ticket, input))).toBe('NOT_ACTIVATED');

      expect({ ...(await countRows()), mails: await mailCount() }).toEqual(before);
      expect(await ticketRow(ticket.ticketRef)).toMatchObject({ status: 'AWAITING_ACTIVATION' });
      expect(await holders()).toEqual([h.seed.superAdmin.appUserId]);

      // They activate through the invitation already sent; the same ticket then moves the role as a planned transfer.
      await h.ctx.sql.query(
        `UPDATE account_action_tokens SET expires_at = now() + interval '1 day' WHERE app_user_id = $1`,
        [account.id],
      );
      await activateInvitedAccount(h.ctx, account.id);
      expect(await h.recovery.transferRole(ticket, input)).toMatchObject({ outcome: 'ROLE_TRANSFERRED' });
      expect(await holders()).toEqual([account.id]);
    });

    it('refuses a planned transfer without the holder email: somebody holds the role, so the holder is named', async () => {
      await activeSuccessor('E-RS15');

      expect(await refusalOf(() => h.recovery.transferRole(context(), { successorEmployeeCode: 'E-RS15' }))).toBe(
        'TARGET_NOT_HOLDER',
      );
      expect(await holders()).toEqual([h.seed.superAdmin.appUserId]);
    });

    it('refuses an operator who is the holder', async () => {
      await activeSuccessor('E-RS16');

      expect(
        await refusalOf(() =>
          h.recovery.transferRole(context({ operatorRef: h.seed.superAdmin.email }), {
            successorEmployeeCode: 'E-RS16',
            holderEmail: h.seed.superAdmin.email,
          }),
        ),
      ).toBe('RECIPIENT_IS_OPERATOR');
      expect(await holders()).toEqual([h.seed.superAdmin.appUserId]);
    });

    it('refuses an approver who is the holder', async () => {
      await activeSuccessor('E-RS19');

      expect(
        await refusalOf(() =>
          h.recovery.transferRole(context({ approverRef: h.seed.superAdmin.email }), {
            successorEmployeeCode: 'E-RS19',
            holderEmail: h.seed.superAdmin.email,
          }),
        ),
      ).toBe('APPROVER_IS_HOLDER');
      expect(await holders()).toEqual([h.seed.superAdmin.appUserId]);
    });

    it('lets one of two planned transfers run at the same time through: the other finds a different holder', async () => {
      await activeSuccessor('E-RS17');
      await activeSuccessor('E-RS18');
      const holderEmail = h.seed.superAdmin.email;

      const outcomes = await Promise.all(
        ['E-RS17', 'E-RS18'].map((code) =>
          refusalOf(() => h.recovery.transferRole(context(), { successorEmployeeCode: code, holderEmail })),
        ),
      );

      expect([...outcomes].sort()).toEqual(['NO REFUSAL', 'TARGET_NOT_HOLDER']);
      expect(await holders()).toHaveLength(1);
      expect(await holders()).not.toEqual([h.seed.superAdmin.appUserId]);
    });

    it('moves the role in two stages under one ticket: first an account with no role, then, once it is activated, the role', async () => {
      await successorEmployee('E-RS1');
      await holderLeaves();
      const ticket = context();
      const input = { successorEmployeeCode: 'E-RS1', holderEmail: h.seed.superAdmin.email };

      const first = await h.recovery.transferRole(ticket, input);

      expect(first).toMatchObject({ outcome: 'ACCOUNT_CREATED', sentTo: 'LOGIN_EMAIL' });
      const account = (
        await h.ctx.sql.query<{ id: string; activation_state: string; status: string }>(
          `SELECT a.id, a.activation_state, a.status FROM app_users a JOIN employees e ON e.id = a.employee_id WHERE e.employee_code = 'E-RS1'`,
        )
      ).rows[0];
      expect(account).toMatchObject({ activation_state: 'INVITED', status: 'ACTIVE' });
      expect((await h.ctx.sql.query('SELECT 1 FROM role_grants WHERE app_user_id = $1', [account.id])).rows).toEqual(
        [],
      );
      expect(await holders()).toEqual([h.seed.superAdmin.appUserId]);
      expect(await ticketRow(ticket.ticketRef)).toMatchObject({ status: 'AWAITING_ACTIVATION' });
      expect((await mailsFor(ticket.ticketRef)).map((mail) => [mail.recipient, mail.template])).toEqual([
        ['e-rs1@acme.vn', 'ACCOUNT_INVITATION'],
      ]);
      expect((await auditOf(ticket.ticketRef))[0]).toMatchObject({
        action: 'SUPER_ADMIN.RECOVERY_ACCOUNT_CREATED',
        actor_kind: 'OPERATOR',
      });

      // Not activated yet: the same ticket says so and sends nothing new while the link works.
      expect(await h.recovery.transferRole(ticket, input)).toMatchObject({ outcome: 'INVITATION_ALREADY_SENT' });
      await h.ctx.sql.query(
        `UPDATE account_action_tokens SET expires_at = now() - interval '1 minute' WHERE app_user_id = $1`,
        [account.id],
      );
      expect(await h.recovery.transferRole(ticket, input)).toMatchObject({ outcome: 'INVITATION_REISSUED' });

      // Activating through the invitation never grants the role.
      await activateInvitedAccount(h.ctx, account.id);
      expect(await holders()).toEqual([h.seed.superAdmin.appUserId]);

      const second = await h.recovery.transferRole(ticket, input);

      expect(second.outcome).toBe('ROLE_TRANSFERRED');
      expect(await holders()).toEqual([account.id]);
      expect(await ticketRow(ticket.ticketRef)).toMatchObject({ status: 'COMPLETED' });
      const events = await auditOf(ticket.ticketRef);
      // Events written in one transaction share a millisecond more often than not, and `ORDER BY occurred_at, id` then
      // follows the random id, not the order of writing (P28-02): the hand-over is one pair of events
      // with one correlation, compared as a set.
      expect(events.map((event) => event.action).sort()).toEqual([
        'SUPER_ADMIN.RECOVERY_ACCOUNT_CREATED',
        'SUPER_ADMIN.TRANSFERRED_IN',
        'SUPER_ADMIN.TRANSFERRED_OUT',
      ]);
      const moves = events.filter((event) => event.action.startsWith('SUPER_ADMIN.TRANSFERRED_'));
      expect(new Set(moves.map((event) => event.correlation_id)).size).toBe(1);
      expect(await h.recovery.transferRole(ticket, input)).toMatchObject({ outcome: 'ALREADY_COMPLETED' });
      // The new holder signs in as Super Admin.
      expect((await login('e-rs1@acme.vn', ACCOUNT_PASSWORD)).status).toBe(200);
    });

    it('sends the invitation, and every reissue of it, to the login email of the account, even when the work email on the record changed meanwhile (F18)', async () => {
      await successorEmployee('E-RS11');
      await holderLeaves();
      const ticket = context();
      const input = { successorEmployeeCode: 'E-RS11', holderEmail: h.seed.superAdmin.email };

      expect(await h.recovery.transferRole(ticket, input)).toMatchObject({
        outcome: 'ACCOUNT_CREATED',
        sentTo: 'LOGIN_EMAIL',
      });
      const account = (
        await h.ctx.sql.query<{ id: string; login_email: string }>(
          `SELECT a.id, a.login_email FROM app_users a JOIN employees e ON e.id = a.employee_id WHERE e.employee_code = 'E-RS11'`,
        )
      ).rows[0];
      // The record's work email is corrected after the invitation went out; the login email of the account stays what it was.
      await h.ctx.sql.query(
        `UPDATE employees SET work_email = 'moved-rs11@acme.vn', normalized_work_email = 'moved-rs11@acme.vn' WHERE employee_code = 'E-RS11'`,
      );
      await h.ctx.sql.query(
        `UPDATE account_action_tokens SET expires_at = now() - interval '1 minute' WHERE app_user_id = $1`,
        [account.id],
      );

      expect(await h.recovery.transferRole(ticket, input)).toMatchObject({
        outcome: 'INVITATION_REISSUED',
        sentTo: 'LOGIN_EMAIL',
      });

      expect((await mailsFor(ticket.ticketRef)).map((mail) => [mail.recipient, mail.template])).toEqual([
        [account.login_email, 'ACCOUNT_INVITATION'],
        [account.login_email, 'ACCOUNT_INVITATION'],
      ]);
      expect(account.login_email).toBe('e-rs11@acme.vn');
    });

    it('gives the role to someone who already has a working account, in one step, when nobody holds it', async () => {
      const successor = await createActivatedAccount(h.ctx, h.seed, {
        code: 'E-RS2',
        email: 'rs2@acme.vn',
        roles: [],
        admin: await adminToken(h.ctx, h.seed),
      });
      await h.ctx.sql.query(
        `UPDATE role_grants SET revoked_at = now() WHERE role = 'SUPER_ADMIN' AND revoked_at IS NULL`,
      );

      const result = await h.recovery.transferRole(context(), { successorEmployeeCode: 'E-RS2' });

      expect(result.outcome).toBe('ROLE_TRANSFERRED');
      expect(await holders()).toEqual([successor.appUserId]);
    });

    it('requires naming the holder when somebody holds the role, and the successor to be a different person', async () => {
      await successorEmployee('E-RS3');
      await holderLeaves();

      expect(await refusalOf(() => h.recovery.transferRole(context(), { successorEmployeeCode: 'E-RS3' }))).toBe(
        'TARGET_NOT_HOLDER',
      );
      expect(
        await refusalOf(() =>
          h.recovery.transferRole(context(), {
            successorEmployeeCode: 'E-ADMIN',
            holderEmail: h.seed.superAdmin.email,
          }),
        ),
      ).toBe('SUCCESSOR_IS_HOLDER');
    });

    it('refuses a successor who does not qualify, as the transfer by the holder would (AC-3)', async () => {
      const withItRole = await createActivatedAccount(h.ctx, h.seed, {
        code: 'E-RS4',
        email: 'rs4@acme.vn',
        roles: ['IT_ADMIN'],
        admin: await adminToken(h.ctx, h.seed),
      });
      const invited = await insertAccountFixture(h.ctx.app, h.seed, {
        code: 'E-RS5',
        email: 'rs5@acme.vn',
        activated: false,
      });
      const asserted = await insertAccountFixture(h.ctx.app, h.seed, {
        code: 'E-RS6',
        email: 'rs6@acme.vn',
        activated: true,
      });
      await h.ctx.sql.query(`UPDATE app_users SET email_verification_source = 'BOOTSTRAP_ASSERTED' WHERE id = $1`, [
        asserted.appUserId,
      ]);
      const locked = await createActivatedAccount(h.ctx, h.seed, {
        code: 'E-RS7',
        email: 'rs7@acme.vn',
        roles: [],
        admin: await adminToken(h.ctx, h.seed),
      });
      await h.ctx.sql.query(`UPDATE app_users SET status = 'LOCKED' WHERE id = $1`, [locked.appUserId]);
      const left = await createActivatedAccount(h.ctx, h.seed, {
        code: 'E-RS8',
        email: 'rs8@acme.vn',
        roles: [],
        admin: await adminToken(h.ctx, h.seed),
      });
      await h.ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [left.employeeId]);
      await holderLeaves();
      const holder = { holderEmail: h.seed.superAdmin.email };

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
          await refusalOf(() => h.recovery.transferRole(context(), { successorEmployeeCode: code, ...holder })),
        ).toBe(problem);
      }
      expect(await holders()).toEqual([h.seed.superAdmin.appUserId]);
      expect(withItRole.appUserId).toBeDefined();
      expect(invited.appUserId).toBeDefined();
    });

    it('refuses direct approval roles and distinguishes a head from another MANAGER', async () => {
      const token = await adminToken(h.ctx, h.seed);
      const manager = await createActivatedAccount(h.ctx, h.seed, {
        code: 'E-RM1',
        email: 'rm1@acme.vn',
        roles: ['MANAGER'],
        admin: token,
      });
      const head = await createActivatedAccount(h.ctx, h.seed, {
        code: 'E-RM2',
        email: 'rm2@acme.vn',
        roles: ['MANAGER'],
        admin: token,
      });
      await assignHead(h.ctx, token, h.seed.departmentId, {
        employeeId: head.employeeId,
        effectiveFrom: await h.ctx.app.get(OrganizationReadApi, { strict: false }).businessToday(),
      });
      const approver = await createActivatedAccount(h.ctx, h.seed, {
        code: 'E-RM3',
        email: 'rm3@acme.vn',
        roles: [],
        admin: token,
      });
      await setSpendingApprover(h.ctx, token, approver.employeeId);
      await holderLeaves();
      for (const [code, expected] of [
        ['E-RM1', 'MANAGER_HELD'],
        ['E-RM2', 'HEADS_DEPARTMENT'],
        ['E-RM3', 'APPROVAL_ROLE_HELD'],
      ]) {
        expect(
          await refusalOf(() =>
            h.recovery.transferRole(context(), {
              successorEmployeeCode: code,
              holderEmail: h.seed.superAdmin.email,
            }),
          ),
        ).toBe(expected);
      }
      expect(await holders()).toEqual([h.seed.superAdmin.appUserId]);
      expect(manager.appUserId).toBeDefined();
      await h.ctx.sql.query(
        `UPDATE role_grants SET revoked_at = GREATEST(now(), granted_at) WHERE app_user_id = $1 AND role = 'SPENDING_APPROVER' AND revoked_at IS NULL`,
        [approver.appUserId],
      );
    });

    it('leaves every account with the person it was made for: a transfer and a credential reset move no account to another employee (US-01-09 AC-16)', async () => {
      await activeSuccessor('E-RS20');
      const accountsOf = async () =>
        (
          await h.ctx.sql.query<{ id: string; employee_id: string }>(
            'SELECT id, employee_id FROM app_users ORDER BY id',
          )
        ).rows;
      const before = await accountsOf();

      expect(
        await h.recovery.transferRole(context(), {
          successorEmployeeCode: 'E-RS20',
          holderEmail: h.seed.superAdmin.email,
        }),
      ).toMatchObject({ outcome: 'ROLE_TRANSFERRED' });
      expect(
        await h.recovery.resetCredentials(context(), {
          accountEmail: 'e-rs20@acme.vn',
          newLoginEmail: 'rs20.new@acme.vn',
        }),
      ).toMatchObject({ outcome: 'LINK_SENT' });

      expect(await accountsOf()).toEqual(before);
    });

    it('refuses a successor with no work email to invite', async () => {
      await holderLeaves();
      await insertEmployeeFixture(h.ctx.app, h.seed, { code: 'E-RS9', email: null });

      expect(
        await refusalOf(() =>
          h.recovery.transferRole(context(), { successorEmployeeCode: 'E-RS9', holderEmail: h.seed.superAdmin.email }),
        ),
      ).toBe('SUCCESSOR_HAS_NO_EMAIL');
    });
  });
});
