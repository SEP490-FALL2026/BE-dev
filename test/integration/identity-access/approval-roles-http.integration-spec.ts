import request from 'supertest';
import { Client } from 'pg';
import { ApiAccount, adminToken, createActivatedAccount } from '../../support/api-accounts';
import { setSpendingApprover } from '../../support/builders/account.builder';
import {
  HttpTestApp,
  SeededInstallation,
  createHttpTestApp,
  insertAccountFixture,
  insertEmployeeFixture,
  seedInstallation,
} from '../../support/http-test-app';

/** The two roles configured here; the spending approver is a role grant since QĐ-93a (direct-approval-roles). */
type Role = 'CONFLICT_SUBSTITUTE' | 'FALLBACK_APPROVER';

interface RoleView {
  role: Role;
  holder: { employeeId: string; employeeCode: string; since: string } | null;
  history: { employeeId: string; employeeCode: string; from: string; until: string | null }[];
}

const APPROVAL_ROLES_LOCK_KEY = 7_300_001;

describe('the approval roles over HTTP (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let admin: string;
  let it1: ApiAccount;
  let finance: ApiAccount;
  let counter = 0;
  const server = () => ctx.app.getHttpServer();
  const asAdmin = () => ({ Authorization: `Bearer ${admin}` });
  const as = (account: ApiAccount) => ({ Authorization: `Bearer ${account.accessToken}` });

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    seed = await seedInstallation(ctx.app);
    admin = await adminToken(ctx, seed);
    it1 = await createActivatedAccount(ctx, seed, { code: 'E-IT1', email: 'it1@acme.vn', roles: ['IT_ADMIN'], admin });
    finance = await createActivatedAccount(ctx, seed, {
      code: 'E-FIN',
      email: 'fin@acme.vn',
      roles: ['FINANCE'],
      admin,
    });
  }, 120000);

  afterAll(async () => {
    await ctx?.close();
  });

  const person = async (): Promise<ApiAccount & { code: string }> => {
    counter += 1;
    const code = `E-AR${counter}`;

    return {
      ...(await createActivatedAccount(ctx, seed, { code, email: `ar${counter}@acme.vn`, roles: [], admin })),
      code,
    };
  };
  const setRole = (role: Role, employeeId: string, headers = asAdmin()) =>
    request(server()).put(`/api/v1/approval-roles/${role}`).set(headers).send({ employeeId });
  const viewOf = (response: request.Response): RoleView[] =>
    (response.body as { data: { items: RoleView[] } }).data.items;
  const roleOf = (response: request.Response, role: Role): RoleView =>
    viewOf(response).find((view) => view.role === role) as RoleView;
  const errorCode = (response: request.Response) => (response.body as { error: { code: string } }).error.code;
  const revokeApprover = () =>
    ctx.sql.query("UPDATE role_grants SET revoked_at = now() WHERE role = 'SPENDING_APPROVER' AND revoked_at IS NULL");
  const grantSpendingApprover = (appUserId: string) =>
    request(server())
      .post(`/api/v1/app-users/${appUserId}/role-grants`)
      .set(asAdmin())
      .send({ role: 'SPENDING_APPROVER' });
  const currentRows = async () =>
    (
      await ctx.sql.query<{ role: string; employee_id: string }>(
        'SELECT role, employee_id FROM approval_role_holders WHERE held_until IS NULL ORDER BY role',
      )
    ).rows;
  const auditOf = async (role: Role) =>
    (
      await ctx.sql.query<{ action: string; before: unknown; after: unknown }>(
        `SELECT a.action, a.before, a.after FROM audit_events a
          WHERE a.action = 'APPROVAL_ROLE.CHANGED' AND a.after ->> 'role' = $1 ORDER BY a.occurred_at, a.id`,
        [role],
      )
    ).rows;

  describe('configuring the roles (US-01-03 AC-1, AC-3)', () => {
    it('shows the two roles with nobody in them before anything is set (the spending approver is a role grant now)', async () => {
      const response = await request(server()).get('/api/v1/approval-roles').set(asAdmin()).expect(200);

      expect(viewOf(response)).toEqual([
        { role: 'CONFLICT_SUBSTITUTE', holder: null, history: [], historyHasMore: false },
        { role: 'FALLBACK_APPROVER', holder: null, history: [], historyHasMore: false },
      ]);
    });

    it('names the substitute for a conflict of interest, and says who did it in the Audit Trail (AC-1)', async () => {
      const substitute = await person();

      const response = await setRole('CONFLICT_SUBSTITUTE', substitute.employeeId).expect(200);

      expect((response.body as { message: string }).message).toBe('APPROVAL_ROLE.SET');
      expect(roleOf(response, 'CONFLICT_SUBSTITUTE').holder).toMatchObject({
        employeeId: substitute.employeeId,
        employeeCode: substitute.code,
      });
      expect((await auditOf('CONFLICT_SUBSTITUTE')).at(-1)).toMatchObject({
        action: 'APPROVAL_ROLE.CHANGED',
        before: { role: 'CONFLICT_SUBSTITUTE', holder: null },
        after: { role: 'CONFLICT_SUBSTITUTE', holder: substitute.code },
      });
      const actor = await ctx.sql.query<{ actor_kind: string; actor_app_user_id: string }>(
        `SELECT actor_kind, actor_app_user_id FROM audit_events WHERE action = 'APPROVAL_ROLE.CHANGED'
          AND after ->> 'holder' = $1`,
        [substitute.code],
      );
      expect(actor.rows[0]).toMatchObject({ actor_kind: 'USER', actor_app_user_id: seed.superAdmin.appUserId });
    });

    it('changes the holder: the history keeps both and the table keeps one current holder (AC-3)', async () => {
      const first = await person();
      const second = await person();
      await setRole('FALLBACK_APPROVER', first.employeeId).expect(200);

      const response = await setRole('FALLBACK_APPROVER', second.employeeId).expect(200);

      expect(roleOf(response, 'FALLBACK_APPROVER').holder).toMatchObject({ employeeCode: second.code });
      expect(
        roleOf(response, 'FALLBACK_APPROVER')
          .history.map((entry) => entry.employeeCode)
          .slice(0, 2),
      ).toEqual([second.code, first.code]);
      expect(roleOf(response, 'FALLBACK_APPROVER').history[1].until).not.toBeNull();
      expect((await auditOf('FALLBACK_APPROVER')).at(-1)).toMatchObject({
        before: { role: 'FALLBACK_APPROVER', holder: first.code },
        after: { role: 'FALLBACK_APPROVER', holder: second.code },
      });
      expect((await currentRows()).filter((row) => row.role === 'FALLBACK_APPROVER')).toHaveLength(1);
    });

    it('answers the person who already holds the role with the roles and records nothing', async () => {
      const holder = await person();
      await setRole('FALLBACK_APPROVER', holder.employeeId).expect(200);
      const events = (await auditOf('FALLBACK_APPROVER')).length;

      const historyBefore = roleOf(
        await request(server()).get('/api/v1/approval-roles').set(asAdmin()),
        'FALLBACK_APPROVER',
      ).history;

      const response = await setRole('FALLBACK_APPROVER', holder.employeeId).expect(200);

      expect(roleOf(response, 'FALLBACK_APPROVER').history).toEqual(historyBefore);
      expect(await auditOf('FALLBACK_APPROVER')).toHaveLength(events);
    });

    it('lets the fallback approver be the spending approver too', async () => {
      const both = await person();
      await grantSpendingApprover(both.appUserId).expect(201);

      const response = await setRole('FALLBACK_APPROVER', both.employeeId).expect(200);

      expect(roleOf(response, 'FALLBACK_APPROVER').holder).toMatchObject({ employeeCode: both.code });
    });
  });

  describe('who may hold a role (AC-2, AC-6)', () => {
    it.each<Role>(['CONFLICT_SUBSTITUTE', 'FALLBACK_APPROVER'])(
      'refuses the Super Admin as the %s, and nothing changes (AC-2)',
      async (role) => {
        const before = await currentRows();

        const response = await setRole(role, seed.superAdmin.employeeId).expect(422);

        expect(errorCode(response)).toBe('APPROVAL_ROLE.SUPER_ADMIN_CANNOT_HOLD');
        expect(await currentRows()).toEqual(before);
      },
    );

    it('refuses a person who has left, a person with no account, one who never activated, and one who is locked (AC-6)', async () => {
      const left = await insertEmployeeFixture(ctx.app, seed, { code: 'E-AR-LEFT', email: null, terminated: true });
      const noAccount = await insertEmployeeFixture(ctx.app, seed, { code: 'E-AR-NOACC', email: null });
      counter += 1;
      const invited = await insertAccountFixture(ctx.app, seed, {
        code: 'E-AR-INV',
        email: `inv${counter}@acme.vn`,
        activated: false,
      });
      const locked = await person();
      await request(server())
        .post(`/api/v1/app-users/${locked.appUserId}/lock`)
        .set(asAdmin())
        .send({ reason: 'A locked account cannot hold an approval role' })
        .expect(200);
      const before = await currentRows();

      const cases: [string, string, string][] = [
        ['who has left', left.employeeId, 'APPROVAL_ROLE.EMPLOYEE_NOT_ACTIVE'],
        ['with no account', noAccount.employeeId, 'APPROVAL_ROLE.NO_USABLE_ACCOUNT'],
        ['whose account is not activated', invited.employeeId, 'APPROVAL_ROLE.NO_USABLE_ACCOUNT'],
        ['whose account is locked', locked.employeeId, 'APPROVAL_ROLE.NO_USABLE_ACCOUNT'],
      ];
      for (const [, employeeId, code] of cases) {
        expect(errorCode(await setRole('CONFLICT_SUBSTITUTE', employeeId).expect(422))).toBe(code);
      }
      expect(await currentRows()).toEqual(before);
    });

    it('is 404 for an employee that does not exist', async () => {
      const response = await setRole('CONFLICT_SUBSTITUTE', '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11').expect(404);

      expect(errorCode(response)).toBe('ORGANIZATION.EMPLOYEE_NOT_FOUND');
    });
  });

  describe('the substitute is never the spending approver (AC-7)', () => {
    it('refuses the approver as the substitute, and the substitute as the approver', async () => {
      const approver = await person();
      const substitute = await person();
      await revokeApprover();
      await setRole('CONFLICT_SUBSTITUTE', substitute.employeeId).expect(200);
      expect(errorCode(await grantSpendingApprover(substitute.appUserId).expect(422))).toBe(
        'APPROVAL_ROLE.SUBSTITUTE_MUST_DIFFER',
      );
      await setSpendingApprover(ctx, admin, approver.employeeId);
      expect(errorCode(await setRole('CONFLICT_SUBSTITUTE', approver.employeeId).expect(422))).toBe(
        'APPROVAL_ROLE.SUBSTITUTE_MUST_DIFFER',
      );
      const rows = await currentRows();
      expect(rows.find((row) => row.role === 'CONFLICT_SUBSTITUTE')?.employee_id).toBe(substitute.employeeId);
      expect(
        (
          await ctx.sql.query<{ employee_id: string }>(
            `SELECT u.employee_id FROM role_grants g JOIN app_users u ON u.id = g.app_user_id
              WHERE g.role = 'SPENDING_APPROVER' AND g.revoked_at IS NULL`,
          )
        ).rows.map((row) => row.employee_id),
      ).toEqual([approver.employeeId]);
    });

    it('keeps at most one current holder per role', async () => {
      const first = await person();
      const second = await person();
      await setRole('FALLBACK_APPROVER', first.employeeId).expect(200);

      await expect(
        ctx.sql.query(
          `INSERT INTO approval_role_holders (id, organization_id, role, employee_id)
           VALUES (gen_random_uuid(), $1, 'FALLBACK_APPROVER', $2)`,
          [seed.organizationId, second.employeeId],
        ),
      ).rejects.toMatchObject({ code: '23505' });
    });
  });

  describe('who may configure them (AC-4, AC-5)', () => {
    it('refuses Finance, an IT Admin, an employee and the approver, and changes nothing', async () => {
      const ceo = await person();
      const employee = await person();
      await setSpendingApprover(ctx, admin, ceo.employeeId);
      const before = await currentRows();

      for (const headers of [as(finance), as(it1), as(employee), as(ceo)]) {
        await setRole('CONFLICT_SUBSTITUTE', employee.employeeId, headers).expect(403);
        await request(server()).get('/api/v1/approval-roles').set(headers).expect(403);
      }

      expect(await currentRows()).toEqual(before);
    });
  });

  describe('the lock protocol: two changes at once', () => {
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

    it('lets only one of "spending approver" (the grant) and "substitute" (the PUT) for the same person win, in either order, with no deadlock', async () => {
      const deadlocks = async () =>
        (
          await ctx.sql.query<{ n: number }>(
            'SELECT deadlocks::int AS n FROM pg_stat_database WHERE datname = current_database()',
          )
        ).rows[0].n;
      await revokeApprover();
      const deadlocksBefore = await deadlocks();
      for (let round = 0; round < 4; round += 1) {
        const target = await person();
        await ctx.sql.query(
          `UPDATE approval_role_holders SET held_until = GREATEST(now(), held_from) WHERE held_until IS NULL`,
        );

        await holder.query('BEGIN');
        await holder.query('SELECT pg_advisory_xact_lock($1)', [APPROVAL_ROLES_LOCK_KEY]);
        const asApprover = grantSpendingApprover(target.appUserId).then((r) => r);
        const asSubstitute = setRole('CONFLICT_SUBSTITUTE', target.employeeId).then((r) => r);
        await waitForWaiters(ctx.sql, 2);
        await holder.query('COMMIT');
        const answers = (await Promise.all([asApprover, asSubstitute])).map((r) => r.status);

        // Exactly one of the two takes the person, the other is refused with 422, and either order is fine.
        expect(answers.filter((status) => status === 422)).toHaveLength(1);
        expect(answers.filter((status) => status === 200 || status === 201)).toHaveLength(1);
        await ctx.sql.query(
          `UPDATE role_grants SET revoked_at = now() WHERE role = 'SPENDING_APPROVER' AND revoked_at IS NULL`,
        );
      }
      expect(await deadlocks()).toBe(deadlocksBefore);
    });
  });
});
