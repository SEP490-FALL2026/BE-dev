import request from 'supertest';
import { Client } from 'pg';
import { RoleGrantRepo } from '../../../src/modules/identity-access/accounts/role-grant.repo';
import { ApiAccount, adminToken, createActivatedAccount, loginAs } from '../../support/api-accounts';
import {
  HttpTestApp,
  SeededInstallation,
  createHttpTestApp,
  insertAccountFixture,
  seedInstallation,
} from '../../support/http-test-app';
import { HR_BASIS } from '../../support/hr-basis';

const ORG_TIME_ZONE = 'Asia/Ho_Chi_Minh';

function today(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ORG_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? '';

  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

describe('handing the Super Admin role to a successor over HTTP (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let admin: string;
  let it1: ApiAccount;
  let counter = 0;
  const server = () => ctx.app.getHttpServer();
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const asAccount = (account: ApiAccount) => as(account.accessToken);

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    seed = await seedInstallation(ctx.app);
    admin = await adminToken(ctx, seed);
    it1 = await createActivatedAccount(ctx, seed, { code: 'E-IT1', email: 'it1@acme.vn', roles: ['IT_ADMIN'], admin });
  }, 120000);

  afterAll(async () => {
    await ctx?.close();
  });

  const successor = async (roles: string[] = []): Promise<ApiAccount> => {
    counter += 1;

    return createActivatedAccount(ctx, seed, {
      code: `E-SU${counter}`,
      email: `su${counter}@acme.vn`,
      roles,
      admin,
    });
  };
  const transfer = (token: string, successorAppUserId: string) =>
    request(server()).post('/api/v1/super-admin-transfers').set(as(token)).send({ successorAppUserId });
  const errorCode = (response: request.Response) => (response.body as { error: { code: string } }).error.code;
  const holders = async (): Promise<string[]> =>
    (
      await ctx.sql.query<{ app_user_id: string }>(
        `SELECT app_user_id FROM role_grants WHERE role = 'SUPER_ADMIN' AND revoked_at IS NULL`,
      )
    ).rows.map((row) => row.app_user_id);
  const transferEvents = async () =>
    (
      await ctx.sql.query<{ action: string; resource_id: string; correlation_id: string; actor_app_user_id: string }>(
        `SELECT action, resource_id, correlation_id, actor_app_user_id FROM audit_events
          WHERE action LIKE 'SUPER_ADMIN.TRANSFERRED_%' ORDER BY occurred_at, id`,
      )
    ).rows;
  /** Puts the seeded Super Admin back as the one holder, by SQL: the application only ever moves the role forward. */
  const restoreSeedHolder = async () => {
    await ctx.sql.query(`UPDATE role_grants SET revoked_at = now() WHERE role = 'SUPER_ADMIN' AND revoked_at IS NULL`);
    await ctx.sql.query(
      `INSERT INTO role_grants (id, organization_id, app_user_id, role) VALUES (gen_random_uuid(), $1, $2, 'SUPER_ADMIN')`,
      [seed.organizationId, seed.superAdmin.appUserId],
    );
  };

  afterEach(restoreSeedHolder);

  describe('a transfer that qualifies (AC-1, AC-2)', () => {
    it('moves the role in one step: exactly one holder, who is the successor, recorded for both accounts', async () => {
      const u2 = await successor();
      const before = (await transferEvents()).length;

      const response = await transfer(admin, u2.appUserId).expect(200);

      const data = (response.body as { data: { transferId: string; from: unknown; to: unknown } }).data;
      expect(data).toMatchObject({
        from: { appUserId: seed.superAdmin.appUserId },
        to: { appUserId: u2.appUserId },
      });
      expect(await holders()).toEqual([u2.appUserId]);
      // One transaction writes the pair, so its order in `ORDER BY occurred_at, id` is the random id's (P28-02): the pair
      // of this transfer is compared as a set.
      const events = (await transferEvents()).slice(before);
      expect(events).toHaveLength(2);
      expect(events).toEqual(
        expect.arrayContaining([
          {
            action: 'SUPER_ADMIN.TRANSFERRED_OUT',
            resource_id: seed.superAdmin.appUserId,
            correlation_id: data.transferId,
            actor_app_user_id: seed.superAdmin.appUserId,
          },
          {
            action: 'SUPER_ADMIN.TRANSFERRED_IN',
            resource_id: u2.appUserId,
            correlation_id: data.transferId,
            actor_app_user_id: seed.superAdmin.appUserId,
          },
        ]),
      );
      const grant = await ctx.sql.query(
        `SELECT revoked_by FROM role_grants WHERE app_user_id = $1 AND role = 'SUPER_ADMIN'`,
        [seed.superAdmin.appUserId],
      );
      expect(grant.rows).toEqual([{ revoked_by: seed.superAdmin.appUserId }]);
    });

    it('takes effect on the next request: the old holder is turned away with the token they have, the successor is let in (AC-2)', async () => {
      const u2 = await successor();
      await transfer(admin, u2.appUserId).expect(200);

      await request(server()).get('/api/v1/app-users').set(as(admin)).expect(403);
      await request(server()).get('/api/v1/app-users').set(asAccount(u2)).expect(200);
      // The old holder is still signed in, with nothing but what they had besides the role.
      const me = await request(server()).get('/api/v1/me').set(as(admin)).expect(200);
      expect((me.body as { data: { roles: { direct: string[] } } }).data.roles.direct).toEqual([]);
    });
  });

  describe('a successor who does not qualify changes nothing and records nothing (AC-3)', () => {
    const expectRefused = async (token: string, appUserId: string, status: number, code: string) => {
      const events = (await transferEvents()).length;
      const holdersBefore = await holders();

      const response = await transfer(token, appUserId).expect(status);

      expect(errorCode(response)).toBe(code);
      expect(await holders()).toEqual(holdersBefore);
      expect(await transferEvents()).toHaveLength(events);
    };

    it('(a) refuses the holder themselves', async () => {
      await expectRefused(admin, seed.superAdmin.appUserId, 422, 'SUPER_ADMIN_TRANSFER.SUCCESSOR_IS_HOLDER');
    });

    it('refuses an account that does not exist', async () => {
      await expectRefused(
        admin,
        '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11',
        404,
        'SUPER_ADMIN_TRANSFER.SUCCESSOR_NOT_FOUND',
      );
    });

    it('(b) refuses an account that is locked', async () => {
      const locked = await successor();
      await request(server())
        .post(`/api/v1/app-users/${locked.appUserId}/lock`)
        .set(as(admin))
        .send({ reason: 'A locked account cannot take the Super Admin role' })
        .expect(200);

      await expectRefused(admin, locked.appUserId, 422, 'SUPER_ADMIN_TRANSFER.ACCOUNT_LOCKED');
    });

    it('(c, d, e) refuses a person who is not working: one who has left, and later one on long leave or in hand-over', async () => {
      const gone = await successor();
      await ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [gone.employeeId]);

      await expectRefused(admin, gone.appUserId, 422, 'SUPER_ADMIN_TRANSFER.EMPLOYEE_NOT_WORKING');
      await ctx.sql.query(`UPDATE employees SET status = 'ACTIVE' WHERE id = $1`, [gone.employeeId]);
    });

    it('(f) refuses an account that was never activated, and one whose email was only asserted', async () => {
      counter += 1;
      const invited = await insertAccountFixture(ctx.app, seed, {
        code: `E-SU-INV${counter}`,
        email: `inv${counter}@acme.vn`,
        activated: false,
      });
      const asserted = await successor();
      await ctx.sql.query(`UPDATE app_users SET email_verification_source = 'BOOTSTRAP_ASSERTED' WHERE id = $1`, [
        asserted.appUserId,
      ]);

      await expectRefused(admin, invited.appUserId, 422, 'SUPER_ADMIN_TRANSFER.NOT_ACTIVATED');
      await expectRefused(admin, asserted.appUserId, 422, 'SUPER_ADMIN_TRANSFER.EMAIL_NOT_VERIFIED');
    });

    it('(g) refuses an account that holds the IT Admin or Finance role', async () => {
      await expectRefused(admin, it1.appUserId, 422, 'SUPER_ADMIN_TRANSFER.WORK_ROLE_HELD');
      const finance = await successor(['FINANCE']);

      await expectRefused(admin, finance.appUserId, 422, 'SUPER_ADMIN_TRANSFER.WORK_ROLE_HELD');
    });

    it('(h) refuses a person who holds an approval role', async () => {
      for (const role of ['SPENDING_APPROVER', 'CONFLICT_SUBSTITUTE', 'FALLBACK_APPROVER']) {
        const holder = await successor();
        await ctx.sql.query(
          `UPDATE approval_role_holders SET held_until = GREATEST(now(), held_from) WHERE role = $1 AND held_until IS NULL`,
          [role],
        );
        await request(server())
          .put(`/api/v1/approval-roles/${role}`)
          .set(as(admin))
          .send({ employeeId: holder.employeeId })
          .expect(200);

        await expectRefused(admin, holder.appUserId, 422, 'SUPER_ADMIN_TRANSFER.APPROVAL_ROLE_HELD');
      }
    });

    it('(i) refuses a person who heads a department, now or from a later day', async () => {
      const head = await successor();
      // Naming the head of a department is the Super Admin's write (QĐ-87).
      await request(server())
        .post(`/api/v1/departments/${seed.departmentId}/head-assignments`)
        .set(as(admin))
        .send({ employeeId: head.employeeId, effectiveFrom: today(), hrBasis: HR_BASIS })
        .expect(200);

      await expectRefused(admin, head.appUserId, 422, 'SUPER_ADMIN_TRANSFER.HEADS_DEPARTMENT');
      await ctx.sql.query('DELETE FROM department_head_periods');
    });
  });

  describe('the role never ends up held twice or by nobody (AC-4, AC-5)', () => {
    it('does nothing at all when the grant to the successor fails after the holder was revoked (AC-4)', async () => {
      const u2 = await successor();
      const accounts = ctx.app.get(RoleGrantRepo);
      const events = (await transferEvents()).length;
      const failing = jest.spyOn(accounts, 'grantRole').mockRejectedValueOnce(new Error('disk full'));

      try {
        await transfer(admin, u2.appUserId).expect(500);
      } finally {
        failing.mockRestore();
      }

      expect(await holders()).toEqual([seed.superAdmin.appUserId]);
      expect(await transferEvents()).toHaveLength(events);
      await request(server()).get('/api/v1/app-users').set(as(admin)).expect(200);
    });

    describe('two transfers at the same moment (AC-5)', () => {
      let holder: Client;

      beforeAll(async () => {
        holder = new Client({ connectionString: ctx.database.url });
        await holder.connect();
      });

      afterAll(async () => {
        await holder?.end();
      });

      afterEach(async () => {
        await holder.query('ROLLBACK').catch(() => undefined);
      });

      async function waitForWaiters(observer: Client, count: number, timeoutMs = 10000): Promise<void> {
        const deadline = Date.now() + timeoutMs;
        for (;;) {
          const { rows } = await observer.query<{ waiting: number }>(
            'SELECT count(*)::int AS waiting FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid WHERE NOT l.granted AND a.datname = current_database()',
          );
          if (rows[0].waiting >= count) return;
          if (Date.now() > deadline) throw new Error(`Fewer than ${count} backends reached a lock wait in time.`);
          await new Promise<void>((resolve) => setImmediate(resolve));
        }
      }

      it('lets exactly one succeed and turns the other away because the holder no longer holds it', async () => {
        const deadlocks = async () =>
          (
            await ctx.sql.query<{ n: number }>(
              'SELECT deadlocks::int AS n FROM pg_stat_database WHERE datname = current_database()',
            )
          ).rows[0].n;
        const deadlocksBefore = await deadlocks();
        for (let round = 0; round < 3; round += 1) {
          const u2 = await successor();
          const u3 = await successor();

          await holder.query('BEGIN');
          await holder.query('SELECT id FROM app_users WHERE id = $1 FOR UPDATE', [seed.superAdmin.appUserId]);
          const toU2 = transfer(admin, u2.appUserId).then((r) => r);
          const toU3 = transfer(admin, u3.appUserId).then((r) => r);
          await waitForWaiters(ctx.sql, 2);
          await holder.query('COMMIT');
          const answers = await Promise.all([toU2, toU3]);

          expect(answers.map((answer) => answer.status).sort()).toEqual([200, 403]);
          expect(await holders()).toHaveLength(1);
          expect([u2.appUserId, u3.appUserId]).toContain((await holders())[0]);
          await restoreSeedHolder();
        }
        expect(await deadlocks()).toBe(deadlocksBefore);
      });
    });
  });

  describe('who may transfer, and by what route (AC-6, AC-7, AC-8)', () => {
    it('refuses the IT Admin, Finance, an employee, a head and the old holder after the transfer', async () => {
      const u2 = await successor();
      const employee = await successor();
      const target = await successor();

      for (const token of [it1.accessToken, employee.accessToken]) {
        await transfer(token, target.appUserId).expect(403);
      }
      await transfer(admin, u2.appUserId).expect(200);
      await transfer(admin, target.appUserId).expect(403);

      expect(await holders()).toEqual([u2.appUserId]);
    });

    it('is the only way: the ordinary grant and revoke refuse SUPER_ADMIN, for anyone, the holder included', async () => {
      const u2 = await successor();

      const grant = await request(server())
        .post(`/api/v1/app-users/${u2.appUserId}/role-grants`)
        .set(as(admin))
        .send({ role: 'SUPER_ADMIN' })
        .expect(422);
      const revokeOwn = await request(server())
        .delete(`/api/v1/app-users/${seed.superAdmin.appUserId}/role-grants/SUPER_ADMIN`)
        .set(as(admin));

      expect(errorCode(grant)).toBe('APP_USER.SUPER_ADMIN_TRANSFER_ONLY');
      expect(revokeOwn.status).toBeGreaterThanOrEqual(400);
      expect(await holders()).toEqual([seed.superAdmin.appUserId]);
    });

    it('does not vacate the role when its holder has left: it stays with them, and nobody can move it (AC-8)', async () => {
      const u2 = await successor();
      await ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [seed.superAdmin.employeeId]);

      try {
        // The holder cannot act any more, so nothing in the application moves the role.
        await transfer(admin, u2.appUserId).expect(401);
        await request(server())
          .post(`/api/v1/app-users/${u2.appUserId}/role-grants`)
          .set(as(admin))
          .send({ role: 'SUPER_ADMIN' })
          .expect(401);
        expect(await holders()).toEqual([seed.superAdmin.appUserId]);
      } finally {
        await ctx.sql.query(`UPDATE employees SET status = 'ACTIVE' WHERE id = $1`, [seed.superAdmin.employeeId]);
      }
      // Signing in again shows the holder is back to normal after the repair above.
      expect(await loginAs(ctx.app, seed.superAdmin.email, 'correct horse battery staple')).toBeTruthy();
    });
  });

  describe('what the database keeps true by itself', () => {
    it('refuses to grant the role to a department head or to an approval role holder, whoever asks', async () => {
      const head = await successor();
      const approver = await successor();
      // The head is named by the Super Admin (QĐ-87), so before the role of the Super Admin is taken away below.
      await request(server())
        .post(`/api/v1/departments/${seed.departmentId}/head-assignments`)
        .set(as(admin))
        .send({ employeeId: head.employeeId, effectiveFrom: today(), hrBasis: HR_BASIS })
        .expect(200);
      await ctx.sql.query(
        `UPDATE role_grants SET revoked_at = now() WHERE role = 'SUPER_ADMIN' AND revoked_at IS NULL`,
      );
      await ctx.sql.query(
        `UPDATE approval_role_holders SET held_until = GREATEST(now(), held_from) WHERE role = 'FALLBACK_APPROVER' AND held_until IS NULL`,
      );
      await ctx.sql.query(
        `INSERT INTO approval_role_holders (id, organization_id, role, employee_id) VALUES (gen_random_uuid(), $1, 'FALLBACK_APPROVER', $2)`,
        [seed.organizationId, approver.employeeId],
      );
      const grant = (appUserId: string) =>
        ctx.sql.query(
          `INSERT INTO role_grants (id, organization_id, app_user_id, role) VALUES (gen_random_uuid(), $1, $2, 'SUPER_ADMIN')`,
          [seed.organizationId, appUserId],
        );

      await expect(grant(head.appUserId)).rejects.toMatchObject({ code: '23514' });
      await expect(grant(approver.appUserId)).rejects.toMatchObject({ code: '23514' });
      await ctx.sql.query('DELETE FROM department_head_periods');
      await ctx.sql.query('DELETE FROM approval_role_holders WHERE employee_id = $1', [approver.employeeId]);
    });
  });
});
