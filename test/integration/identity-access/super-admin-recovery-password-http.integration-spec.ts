import request from 'supertest';
import { SEED_PASSWORD, insertAccountFixture } from '../../support/http-test-app';
import { SuperAdminRecoveryHarness, NEW_PASSWORD } from '../../support/super-admin-recovery-harness';

describe('recovering the Super Admin role outside the application (integration, real PostgreSQL): the holder lost the password or the mailbox, and running a ticket again', () => {
  const h = new SuperAdminRecoveryHarness();
  const {
    server,
    context,
    refusalOf,
    login,
    holders,
    ticketRow,
    mailsFor,
    linkTokenOf,
    redeem,
    auditOf,
    restoreHolder,
  } = h;

  beforeAll(async () => {
    await h.start();
  }, 120000);

  afterEach(restoreHolder);

  afterAll(async () => {
    await h.stop();
  });

  describe('the holder lost the password (AC-9)', () => {
    it('ends the old credential, every session and link, sends one link to the mailbox, and changes no role', async () => {
      const oldAccess = h.admin;
      const mails = (await h.ctx.sql.query<{ n: number }>('SELECT count(*)::int AS n FROM email_outbox')).rows[0].n;
      const ticket = context();

      const result = await h.recovery.resetCredentials(ticket, { accountEmail: h.seed.superAdmin.email });

      expect(result).toEqual({
        ticketRef: ticket.ticketRef,
        mode: 'RESET_CREDENTIALS',
        outcome: 'LINK_SENT',
        sentTo: 'LOGIN_EMAIL',
      });
      expect((await login(h.seed.superAdmin.email, SEED_PASSWORD)).status).toBe(401);
      expect((await request(server()).get('/api/v1/me').set('Authorization', `Bearer ${oldAccess}`)).status).toBe(401);
      expect(await holders()).toEqual([h.seed.superAdmin.appUserId]);
      const sent = await mailsFor(ticket.ticketRef);
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({ recipient: h.seed.superAdmin.email, template: 'PASSWORD_RESET' });
      expect((await h.ctx.sql.query<{ n: number }>('SELECT count(*)::int AS n FROM email_outbox')).rows[0].n).toBe(
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
      await h.recovery.resetCredentials(ticket, { accountEmail: h.seed.superAdmin.email });
      const token = await linkTokenOf(ticket.ticketRef);
      const sessionsBefore = (
        await h.ctx.sql.query<{ n: number }>(
          'SELECT count(*)::int AS n FROM auth_sessions WHERE app_user_id = $1 AND revoked_at IS NULL',
          [h.seed.superAdmin.appUserId],
        )
      ).rows[0].n;

      await redeem(token).expect(200);

      expect(sessionsBefore).toBe(0);
      expect(
        (
          await h.ctx.sql.query<{ n: number }>(
            'SELECT count(*)::int AS n FROM auth_sessions WHERE app_user_id = $1 AND revoked_at IS NULL',
            [h.seed.superAdmin.appUserId],
          )
        ).rows[0].n,
      ).toBe(0);
      expect((await login(h.seed.superAdmin.email, NEW_PASSWORD)).status).toBe(200);
      expect(await holders()).toEqual([h.seed.superAdmin.appUserId]);
      expect(await ticketRow(ticket.ticketRef)).toMatchObject({ status: 'COMPLETED' });
      // The link works once.
      await redeem(token, 'another passphrase 2026').expect(400);
    });

    it('records the ticket, who approved and who ran it, and not one secret (AC-9)', async () => {
      const ticket = context();
      await h.recovery.resetCredentials(ticket, { accountEmail: h.seed.superAdmin.email });
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
        resource_id: h.seed.superAdmin.appUserId,
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

      const result = await h.recovery.resetCredentials(ticket, {
        accountEmail: h.seed.superAdmin.email,
        newLoginEmail: 'new.admin@acme.vn',
      });

      expect(result.sentTo).toBe('NEW_EMAIL');
      expect((await mailsFor(ticket.ticketRef)).map((mail) => mail.recipient)).toEqual(['new.admin@acme.vn']);
      // Before the link is opened nothing about the login email has moved.
      const before = await h.ctx.sql.query<{ login_email: string; email_verification_source: string }>(
        'SELECT login_email, email_verification_source FROM app_users WHERE id = $1',
        [h.seed.superAdmin.appUserId],
      );
      expect(before.rows[0]).toEqual({
        login_email: h.seed.superAdmin.email,
        email_verification_source: 'BOOTSTRAP_ASSERTED',
      });

      await redeem(await linkTokenOf(ticket.ticketRef)).expect(200);

      const after = await h.ctx.sql.query<{ login_email: string; email_verification_source: string }>(
        'SELECT login_email, email_verification_source FROM app_users WHERE id = $1',
        [h.seed.superAdmin.appUserId],
      );
      expect(after.rows[0]).toEqual({
        login_email: 'new.admin@acme.vn',
        email_verification_source: 'RECOVERY_VERIFIED',
      });
      expect((await login('new.admin@acme.vn', NEW_PASSWORD)).status).toBe(200);
      expect((await login(h.seed.superAdmin.email, NEW_PASSWORD)).status).toBe(401);
      // The old address learns that the password changed.
      const notices = await h.ctx.sql.query<{ recipient: string }>(
        `SELECT recipient FROM email_outbox WHERE template = 'PASSWORD_CHANGED_NOTICE' ORDER BY created_at DESC LIMIT 1`,
      );
      expect(notices.rows[0].recipient).toBe(h.seed.superAdmin.email);
      const completed = (await auditOf(ticket.ticketRef)).at(-1);
      expect(completed).toMatchObject({ action: 'SUPER_ADMIN.RECOVERY_COMPLETED', after: { loginEmailChanged: true } });
    });

    it('refuses an address that already belongs to another account, and changes nothing', async () => {
      const ticket = context();
      const mails = (await h.ctx.sql.query<{ n: number }>('SELECT count(*)::int AS n FROM email_outbox')).rows[0].n;

      expect(
        await refusalOf(() =>
          h.recovery.resetCredentials(ticket, { accountEmail: h.seed.superAdmin.email, newLoginEmail: h.it1.email }),
        ),
      ).toBe('NEW_EMAIL_TAKEN');

      expect((await login(h.seed.superAdmin.email, SEED_PASSWORD)).status).toBe(200);
      expect((await h.ctx.sql.query<{ n: number }>('SELECT count(*)::int AS n FROM email_outbox')).rows[0].n).toBe(
        mails,
      );
      expect(await ticketRow(ticket.ticketRef)).toBeUndefined();
    });

    it('refuses the link if someone took the new address after it was sent', async () => {
      const ticket = context();
      await h.recovery.resetCredentials(ticket, {
        accountEmail: h.seed.superAdmin.email,
        newLoginEmail: 'late.taken@acme.vn',
      });
      await insertAccountFixture(h.ctx.app, h.seed, { code: 'E-LATE', email: 'late.taken@acme.vn', activated: true });

      await redeem(await linkTokenOf(ticket.ticketRef)).expect(400);

      expect(
        (await h.ctx.sql.query('SELECT login_email FROM app_users WHERE id = $1', [h.seed.superAdmin.appUserId])).rows,
      ).toEqual([{ login_email: h.seed.superAdmin.email }]);
    });
  });

  describe('running a ticket again (AC-11)', () => {
    it('does nothing the second time once it is completed', async () => {
      const ticket = context();
      await h.recovery.resetCredentials(ticket, { accountEmail: h.seed.superAdmin.email });
      await redeem(await linkTokenOf(ticket.ticketRef)).expect(200);
      const mails = (await mailsFor(ticket.ticketRef)).length;

      const again = await h.recovery.resetCredentials(ticket, { accountEmail: h.seed.superAdmin.email });

      expect(again.outcome).toBe('ALREADY_COMPLETED');
      expect(await mailsFor(ticket.ticketRef)).toHaveLength(mails);
      expect((await login(h.seed.superAdmin.email, NEW_PASSWORD)).status).toBe(200);
    });

    it('does not send a second link while the first still works', async () => {
      const ticket = context();
      await h.recovery.resetCredentials(ticket, { accountEmail: h.seed.superAdmin.email });

      const again = await h.recovery.resetCredentials(ticket, { accountEmail: h.seed.superAdmin.email });

      expect(again.outcome).toBe('LINK_ALREADY_SENT');
      expect(await mailsFor(ticket.ticketRef)).toHaveLength(1);
    });

    it('sends a new link when the first expired, failed or was revoked unused, and the old one stops working', async () => {
      const ticket = context();
      await h.recovery.resetCredentials(ticket, { accountEmail: h.seed.superAdmin.email });
      const oldToken = await linkTokenOf(ticket.ticketRef);
      await h.ctx.sql.query(
        `UPDATE account_action_tokens SET expires_at = now() - interval '1 minute'
          WHERE recovery_ticket_id = (SELECT id FROM recovery_tickets WHERE ticket_ref = $1)`,
        [ticket.ticketRef],
      );

      const again = await h.recovery.resetCredentials(ticket, { accountEmail: h.seed.superAdmin.email });

      expect(again.outcome).toBe('LINK_SENT');
      expect(await mailsFor(ticket.ticketRef)).toHaveLength(2);
      await redeem(oldToken).expect(400);
      await redeem(await linkTokenOf(ticket.ticketRef)).expect(200);
    });

    it('refuses the same ticket with other parameters', async () => {
      const ticket = context();
      await h.recovery.resetCredentials(ticket, { accountEmail: h.seed.superAdmin.email });

      expect(
        await refusalOf(() =>
          h.recovery.resetCredentials(ticket, {
            accountEmail: h.seed.superAdmin.email,
            newLoginEmail: 'other@acme.vn',
          }),
        ),
      ).toBe('TICKET_PARAMETERS_DIFFER');
      expect(await refusalOf(() => h.recovery.unlock(ticket, { accountEmail: h.seed.superAdmin.email }))).toBe(
        'TICKET_OF_ANOTHER_KIND',
      );
    });

    it('replaces a ticket that is still waiting when a newer ticket takes the same account', async () => {
      const first = context();
      const second = context();
      await h.recovery.resetCredentials(first, { accountEmail: h.seed.superAdmin.email });
      const firstToken = await linkTokenOf(first.ticketRef);

      await h.recovery.resetCredentials(second, { accountEmail: h.seed.superAdmin.email });

      expect((await ticketRow(first.ticketRef)).status).toBe('SUPERSEDED');
      await redeem(firstToken).expect(400);
      expect(await refusalOf(() => h.recovery.resetCredentials(first, { accountEmail: h.seed.superAdmin.email }))).toBe(
        'TICKET_SUPERSEDED',
      );
      await redeem(await linkTokenOf(second.ticketRef)).expect(200);
    });

    it('sends one link when the same ticket is run twice at the same moment', async () => {
      const ticket = context();

      const answers = await Promise.all([
        h.recovery.resetCredentials(ticket, { accountEmail: h.seed.superAdmin.email }),
        h.recovery.resetCredentials(ticket, { accountEmail: h.seed.superAdmin.email }),
      ]);

      expect(answers.map((answer) => answer.outcome).sort()).toEqual(['LINK_ALREADY_SENT', 'LINK_SENT']);
      expect(await mailsFor(ticket.ticketRef)).toHaveLength(1);
    });
  });
});
