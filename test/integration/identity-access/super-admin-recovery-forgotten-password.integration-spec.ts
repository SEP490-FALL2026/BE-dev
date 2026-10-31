import { Logger } from '@nestjs/common';
import { Client } from 'pg';
import request from 'supertest';
import { RecoveryContext } from '../../../src/modules/identity-access/public/recovery.types';
import {
  SuperAdminRecoveryHarness,
  NEW_PASSWORD,
  waitUntilBlockedBy,
} from '../../support/super-admin-recovery-harness';

describe('recovering the Super Admin role outside the application (integration, real PostgreSQL): a forgotten-password request while a credential reset is waiting', () => {
  const h = new SuperAdminRecoveryHarness();
  const { server, context, login, holders, ticketRow, linkTokenOf, freshAddress, redeem, restoreHolder } = h;

  beforeAll(async () => {
    await h.start();
  }, 120000);

  afterEach(restoreHolder);

  afterAll(async () => {
    await h.stop();
  });

  describe('a forgotten-password request while a credential reset is waiting (US-01-10 AC-10)', () => {
    const GENERIC_ANSWER = { success: true, message: 'AUTH.PASSWORD_RESET_REQUESTED', data: { requested: true } };
    const forgot = (email: string) =>
      request(server())
        .post('/api/v1/auth/password-reset-requests')
        .set('X-Forwarded-For', freshAddress())
        .send({ email });
    const holderId = () => h.seed.superAdmin.appUserId;

    /** Everything a forgotten-password request could touch for one account, read straight from the database. */
    const footprintOf = async (appUserId: string) => {
      const rows = async (sql: string) => (await h.ctx.sql.query<Record<string, unknown>>(sql, [appUserId])).rows;

      return {
        tokens: await rows(
          `SELECT token_hash, purpose, revoked_at, revoked_reason, consumed_at, recovery_ticket_id
             FROM account_action_tokens WHERE app_user_id = $1 ORDER BY created_at, token_hash`,
        ),
        mail: await rows(
          `SELECT o.id, o.action_token_hash, o.status, o.recipient, o.template FROM email_outbox o
             JOIN account_action_tokens t ON t.token_hash = o.action_token_hash
            WHERE t.app_user_id = $1 ORDER BY o.created_at, o.id`,
        ),
        tickets: await rows(
          `SELECT id, status, mode, updated_at, completed_at FROM recovery_tickets
            WHERE target_app_user_id = $1 ORDER BY created_at, id`,
        ),
        credential: await rows('SELECT hash, hash_policy_version FROM password_credentials WHERE app_user_id = $1'),
        sessions: await rows('SELECT id, revoked_at FROM auth_sessions WHERE app_user_id = $1 ORDER BY id'),
        account: await rows(
          `SELECT status, activation_state, login_email, normalized_login_email, email_verification_source
             FROM app_users WHERE id = $1`,
        ),
        employee: await rows(
          'SELECT e.status FROM employees e JOIN app_users a ON a.employee_id = e.id WHERE a.id = $1',
        ),
        roles: await rows(
          'SELECT role, granted_at, revoked_at FROM role_grants WHERE app_user_id = $1 ORDER BY role, id',
        ),
        resetRequests: await rows(
          `SELECT id FROM audit_events WHERE action = 'APP_USER.PASSWORD_RESET_REQUESTED' AND resource_id = $1`,
        ),
      };
    };
    type Footprint = Awaited<ReturnType<typeof footprintOf>>;

    /** The links a forgotten-password request issued (no recovery ticket behind them). */
    const forgotLinks = (footprint: Footprint) =>
      footprint.tokens.filter((token) => token.purpose === 'RESET_PASSWORD' && token.recovery_ticket_id === null);

    /** Asserts the request issued one ordinary reset link, with its mail and its audit event (AC-3). */
    const expectOrdinaryLinkIssued = (before: Footprint, after: Footprint) => {
      expect(forgotLinks(after)).toHaveLength(forgotLinks(before).length + 1);
      const issued = forgotLinks(after).at(-1);
      expect(issued).toMatchObject({ revoked_at: null, consumed_at: null });
      expect(after.mail.filter((mail) => mail.action_token_hash === issued?.token_hash)).toEqual([
        expect.objectContaining({ status: 'PENDING', recipient: h.seed.superAdmin.email, template: 'PASSWORD_RESET' }),
      ]);
      expect(after.resetRequests).toHaveLength(before.resetRequests.length + 1);
    };

    // Earlier tests issued links for this account within the hour; the hourly limit (T-2) must count only this test.
    const ageEarlierLinks = () =>
      h.ctx.sql.query(
        `UPDATE account_action_tokens SET created_at = created_at - interval '2 hours' WHERE app_user_id = $1`,
        [holderId()],
      );

    /** The tickets the running case opened; each case cleans up its own, so none depends on another's (CP0-07). */
    const opened: string[] = [];
    const openTicket = (): RecoveryContext => {
      const ticket = context();
      opened.push(ticket.ticketRef);

      return ticket;
    };
    const waitingTickets = async () =>
      (
        await h.ctx.sql.query<{ ticket_ref: string }>(
          `SELECT ticket_ref FROM recovery_tickets WHERE status IN ('PENDING', 'AWAITING_ACTIVATION') ORDER BY ticket_ref`,
        )
      ).rows.map((row) => row.ticket_ref);

    beforeEach(async () => {
      // Nothing left waiting by an earlier case: every case starts from the tickets it opens itself.
      expect(await waitingTickets()).toEqual([]);
    });

    afterEach(async () => {
      const refs = opened.splice(0);
      await h.ctx.sql.query(
        `UPDATE recovery_tickets SET status = 'SUPERSEDED', completed_at = NULL
          WHERE ticket_ref = ANY ($1::text[]) AND status IN ('PENDING', 'AWAITING_ACTIVATION')`,
        [refs],
      );
      expect(await waitingTickets()).toEqual([]);
    });

    const insertTicket = (ticket: { organizationId: string; mode: string; status: string; targetAppUserId: string }) =>
      h.ctx.sql.query(
        `INSERT INTO recovery_tickets (id, organization_id, ticket_ref, mode, status, target_app_user_id, approver_ref,
                                       operator_ref, environment, completed_at)
         VALUES (gen_random_uuid(), $1, $2, $3::"RecoveryMode", $4::"RecoveryStatus", $5, 'cto@acme.vn', 'ops-1',
                 'SHARED', CASE WHEN $4 = 'COMPLETED' THEN now() END)`,
        [ticket.organizationId, openTicket().ticketRef, ticket.mode, ticket.status, ticket.targetAppUserId],
      );

    it('answers like any other address and changes nothing: no link, no mail, the recovery link kept', async () => {
      await ageEarlierLinks();
      const ticket = openTicket();
      await h.recovery.resetCredentials(ticket, { accountEmail: h.seed.superAdmin.email });
      const recoveryLink = await linkTokenOf(ticket.ticketRef);
      const before = await footprintOf(holderId());
      const written: string[] = [];
      const capture = (chunk: unknown) => {
        written.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk as Uint8Array).toString('utf8'));

        return true;
      };
      const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(capture);
      const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(capture);
      let answer: request.Response;
      try {
        // A probe, so a silent capture cannot make this test pass for the wrong reason.
        new Logger('probe').error('probe-marker');
        answer = await forgot(`  ${h.seed.superAdmin.email.toUpperCase()}  `);
      } finally {
        stdout.mockRestore();
        stderr.mockRestore();
      }

      expect(answer.status).toBe(202);
      expect(answer.body).toEqual(GENERIC_ANSWER);
      expect(await footprintOf(holderId())).toEqual(before);
      const log = written.join('');
      expect(log).toContain('probe-marker');
      for (const secret of [
        h.seed.superAdmin.email,
        h.seed.superAdmin.email.toUpperCase(),
        ticket.ticketRef,
        recoveryLink,
      ]) {
        expect(log).not.toContain(secret);
      }
    });

    it('still lets the recovery link set the password afterwards, as any reset link would (AC-4)', async () => {
      await ageEarlierLinks();
      const ticket = openTicket();
      await h.recovery.resetCredentials(ticket, { accountEmail: h.seed.superAdmin.email });
      const recoveryLink = await linkTokenOf(ticket.ticketRef);
      await forgot(h.seed.superAdmin.email).expect(202);

      await redeem(recoveryLink).expect(200);

      const after = await footprintOf(holderId());
      expect(after.sessions.filter((session) => session.revoked_at === null)).toEqual([]);
      expect(after.account).toEqual([expect.objectContaining({ status: 'ACTIVE', activation_state: 'ACTIVATED' })]);
      expect(after.employee).toEqual([{ status: 'ACTIVE' }]);
      expect(await holders()).toEqual([h.seed.superAdmin.appUserId]);
      expect(await ticketRow(ticket.ticketRef)).toMatchObject({ status: 'COMPLETED' });
      expect((await login(h.seed.superAdmin.email, NEW_PASSWORD)).status).toBe(200);
    });

    it('does not slip in while a recovery that holds the account commits its waiting ticket', async () => {
      await ageEarlierLinks();
      const holder = new Client({ connectionString: h.ctx.database.url });
      await holder.connect();
      const holderPid = (await holder.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      try {
        const before = await footprintOf(holderId());
        // The recovery's own lock order: the employee for share, then the account, then the ticket.
        await holder.query('BEGIN');
        await holder.query('SELECT id FROM employees WHERE id = $1 FOR SHARE', [h.seed.superAdmin.employeeId]);
        await holder.query('SELECT id FROM app_users WHERE id = $1 FOR UPDATE', [holderId()]);
        await holder.query(
          `INSERT INTO recovery_tickets (id, organization_id, ticket_ref, mode, status, target_app_user_id, approver_ref,
                                         operator_ref, environment)
           VALUES (gen_random_uuid(), $1, $2, 'RESET_CREDENTIALS', 'PENDING', $3, 'cto@acme.vn', 'ops-1', 'SHARED')`,
          [h.seed.organizationId, openTicket().ticketRef, holderId()],
        );

        const pending = forgot(h.seed.superAdmin.email).then((response) => response);
        await waitUntilBlockedBy(h.ctx.sql, holderPid);
        await holder.query('COMMIT');
        const answer = await pending;

        expect(answer.status).toBe(202);
        expect(answer.body).toEqual(GENERIC_ANSWER);
        const after = await footprintOf(holderId());
        expect(after.tokens).toEqual(before.tokens);
        expect(after.mail).toEqual(before.mail);
        expect(after.resetRequests).toEqual(before.resetRequests);
      } finally {
        await holder.query('ROLLBACK').catch(() => undefined);
        await holder.end();
      }
    });

    it('also answers the same and changes nothing while a credential reset waits for activation', async () => {
      // AWAITING_ACTIVATION is set only by a role transfer today; for a credential reset it still counts as waiting.
      await insertTicket({
        organizationId: h.seed.organizationId,
        mode: 'RESET_CREDENTIALS',
        status: 'AWAITING_ACTIVATION',
        targetAppUserId: holderId(),
      });
      await ageEarlierLinks();
      const before = await footprintOf(holderId());

      const answer = await forgot(h.seed.superAdmin.email).expect(202);

      expect(answer.body).toEqual(GENERIC_ANSWER);
      expect(await footprintOf(holderId())).toEqual(before);
    });

    it('still blocks once the link of the waiting ticket has expired: the operator runs it again (AC-11)', async () => {
      const ticket = openTicket();
      await h.recovery.resetCredentials(ticket, { accountEmail: h.seed.superAdmin.email });
      await h.ctx.sql.query(
        `UPDATE account_action_tokens SET expires_at = now() - interval '1 minute'
          WHERE recovery_ticket_id = (SELECT id FROM recovery_tickets WHERE ticket_ref = $1)`,
        [ticket.ticketRef],
      );
      expect(await ticketRow(ticket.ticketRef)).toMatchObject({ status: 'PENDING' });
      // After the setup, so the hourly limit cannot be what stops a link here.
      await ageEarlierLinks();
      const before = await footprintOf(holderId());

      const answer = await forgot(h.seed.superAdmin.email).expect(202);

      expect(answer.body).toEqual(GENERIC_ANSWER);
      expect(await footprintOf(holderId())).toEqual(before);
    });

    it('stops blocking once the ticket is completed, or superseded by one that completed', async () => {
      const first = openTicket();
      const second = openTicket();
      await h.recovery.resetCredentials(first, { accountEmail: h.seed.superAdmin.email });
      await h.recovery.resetCredentials(second, { accountEmail: h.seed.superAdmin.email });
      await redeem(await linkTokenOf(second.ticketRef)).expect(200);
      expect([(await ticketRow(first.ticketRef)).status, (await ticketRow(second.ticketRef)).status]).toEqual([
        'SUPERSEDED',
        'COMPLETED',
      ]);
      await ageEarlierLinks();
      const before = await footprintOf(holderId());

      const answer = await forgot(h.seed.superAdmin.email).expect(202);

      expect(answer.body).toEqual(GENERIC_ANSWER);
      expectOrdinaryLinkIssued(before, await footprintOf(holderId()));
    });

    it('is not blocked by a waiting ticket of another kind, for another account or of another organization', async () => {
      await insertTicket({
        organizationId: h.seed.organizationId,
        mode: 'UNLOCK',
        status: 'PENDING',
        targetAppUserId: holderId(),
      });
      await insertTicket({
        organizationId: h.seed.organizationId,
        mode: 'TRANSFER_ROLE',
        status: 'AWAITING_ACTIVATION',
        targetAppUserId: holderId(),
      });
      await insertTicket({
        organizationId: h.seed.organizationId,
        mode: 'RESET_CREDENTIALS',
        status: 'PENDING',
        targetAppUserId: h.it1.appUserId,
      });
      await insertTicket({
        organizationId: '9b8c6f5e-0000-4000-8000-0000000000aa',
        mode: 'RESET_CREDENTIALS',
        status: 'PENDING',
        targetAppUserId: holderId(),
      });
      await ageEarlierLinks();
      const before = await footprintOf(holderId());

      const answer = await forgot(h.seed.superAdmin.email).expect(202);

      expect(answer.body).toEqual(GENERIC_ANSWER);
      expectOrdinaryLinkIssued(before, await footprintOf(holderId()));
    });
  });
});
