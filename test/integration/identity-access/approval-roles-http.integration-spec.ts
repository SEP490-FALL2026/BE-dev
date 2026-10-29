import request from 'supertest';
import { Client } from 'pg';
import { ApiAccount, adminToken, createActivatedAccount } from '../../support/api-accounts';
import {
  HttpTestApp,
  SeededInstallation,
  createHttpTestApp,
  insertAccountFixture,
  insertEmployeeFixture,
  seedInstallation,
} from '../../support/http-test-app';

type Role = 'SPENDING_APPROVER' | 'CONFLICT_SUBSTITUTE' | 'FALLBACK_APPROVER';

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
  const derivedRoles = async (account: ApiAccount): Promise<string[]> =>
    (
      (await request(server()).get('/api/v1/me').set(as(account)).expect(200)).body as {
        data: { roles: { derived: string[] } };
      }
    ).data.roles.derived;
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
    it('shows the three roles with nobody in them before anything is set', async () => {
      const response = await request(server()).get('/api/v1/approval-roles').set(asAdmin()).expect(200);

      expect(viewOf(response)).toEqual([
        { role: 'SPENDING_APPROVER', holder: null, history: [], historyHasMore: false },
        { role: 'CONFLICT_SUBSTITUTE', holder: null, history: [], historyHasMore: false },
        { role: 'FALLBACK_APPROVER', holder: null, history: [], historyHasMore: false },
      ]);
    });

    it('names the spending approver, who becomes SPENDING_APPROVER from the next request (AC-1)', async () => {
      const ceo = await person();
      expect(await derivedRoles(ceo)).toEqual([]);

      const response = await setRole('SPENDING_APPROVER', ceo.employeeId).expect(200);

      expect((response.body as { message: string }).message).toBe('APPROVAL_ROLE.SET');
      expect(roleOf(response, 'SPENDING_APPROVER').holder).toMatchObject({
        employeeId: ceo.employeeId,
        employeeCode: ceo.code,
      });
      expect(await derivedRoles(ceo)).toEqual(['SPENDING_APPROVER']);
      const roles = (
        (await request(server()).get('/api/v1/me').set(as(ceo)).expect(200)).body as {
          data: { roles: { direct: string[]; effective: string[] } };
        }
      ).data.roles;
      // The role is derived, never a grant: the account holds no role of its own.
      expect(roles.direct).toEqual([]);
      expect(roles.effective).toEqual(['SPENDING_APPROVER']);
      expect((await auditOf('SPENDING_APPROVER')).at(-1)).toMatchObject({
        action: 'APPROVAL_ROLE.CHANGED',
        before: { role: 'SPENDING_APPROVER', holder: null },
        after: { role: 'SPENDING_APPROVER', holder: ceo.code },
      });
      const actor = await ctx.sql.query<{ actor_kind: string; actor_app_user_id: string }>(
        `SELECT actor_kind, actor_app_user_id FROM audit_events WHERE action = 'APPROVAL_ROLE.CHANGED'
          AND after ->> 'holder' = $1`,
        [ceo.code],
      );
      expect(actor.rows[0]).toMatchObject({ actor_kind: 'USER', actor_app_user_id: seed.superAdmin.appUserId });
    });

    it('changes the holder: the one before stops being SPENDING_APPROVER at once, and the history keeps both (AC-3)', async () => {
      const first = await person();
      const second = await person();
      await setRole('SPENDING_APPROVER', first.employeeId).expect(200);

      const response = await setRole('SPENDING_APPROVER', second.employeeId).expect(200);

      expect(roleOf(response, 'SPENDING_APPROVER').holder).toMatchObject({ employeeCode: second.code });
      expect(
        roleOf(response, 'SPENDING_APPROVER')
          .history.map((entry) => entry.employeeCode)
          .slice(0, 2),
      ).toEqual([second.code, first.code]);
      expect(roleOf(response, 'SPENDING_APPROVER').history[1].until).not.toBeNull();
      expect(await derivedRoles(first)).toEqual([]);
      expect(await derivedRoles(second)).toEqual(['SPENDING_APPROVER']);
      expect((await auditOf('SPENDING_APPROVER')).at(-1)).toMatchObject({
        before: { role: 'SPENDING_APPROVER', holder: first.code },
        after: { role: 'SPENDING_APPROVER', holder: second.code },
      });
      expect((await currentRows()).filter((row) => row.role === 'SPENDING_APPROVER')).toHaveLength(1);
    });

    it('answers the person who already holds the role with the roles and records nothing', async () => {
      const holder = await person();
      await setRole('FALLBACK_APPROVER', holder.employeeId).expect(200);
      const events = (await auditOf('FALLBACK_APPROVER')).length;

      const response = await setRole('FALLBACK_APPROVER', holder.employeeId).expect(200);

      expect(roleOf(response, 'FALLBACK_APPROVER').history).toHaveLength(1);
      expect(await auditOf('FALLBACK_APPROVER')).toHaveLength(events);
    });

    it('lets the fallback approver be a person who also holds another approval role', async () => {
      const both = await person();
      await setRole('SPENDING_APPROVER', both.employeeId).expect(200);

      const response = await setRole('FALLBACK_APPROVER', both.employeeId).expect(200);

      expect(roleOf(response, 'FALLBACK_APPROVER').holder).toMatchObject({ employeeCode: both.code });
    });
  });

  describe('who may hold a role (AC-2, AC-6)', () => {
    it.each<Role>(['SPENDING_APPROVER', 'CONFLICT_SUBSTITUTE', 'FALLBACK_APPROVER'])(
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
        expect(errorCode(await setRole('SPENDING_APPROVER', employeeId).expect(422))).toBe(code);
      }
      expect(await currentRows()).toEqual(before);
    });

    it('is 404 for an employee that does not exist', async () => {
      const response = await setRole('SPENDING_APPROVER', '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11').expect(404);

      expect(errorCode(response)).toBe('ORGANIZATION.EMPLOYEE_NOT_FOUND');
    });

    it('never shows the derived role on a Super Admin even if the data says they hold it (US-01-03 AC-2)', async () => {
      // Written by SQL on purpose: the service refuses it, so only a hand edit or a defect can produce it.
      await ctx.sql.query(
        `UPDATE approval_role_holders SET held_until = GREATEST(now(), held_from) WHERE role = 'SPENDING_APPROVER' AND held_until IS NULL`,
      );
      await ctx.sql.query(
        `INSERT INTO approval_role_holders (id, organization_id, role, employee_id, held_from)
         VALUES (gen_random_uuid(), $1, 'SPENDING_APPROVER', $2, now())`,
        [seed.organizationId, seed.superAdmin.employeeId],
      );

      const me = await request(server()).get('/api/v1/me').set(asAdmin()).expect(200);

      expect((me.body as { data: { roles: { derived: string[] } } }).data.roles.derived).toEqual([]);
      await ctx.sql.query('DELETE FROM approval_role_holders WHERE employee_id = $1', [seed.superAdmin.employeeId]);
    });
  });

  describe('the substitute is never the spending approver (AC-7)', () => {
    it('refuses the approver as the substitute, and the substitute as the approver', async () => {
      const approver = await person();
      const substitute = await person();
      await setRole('SPENDING_APPROVER', approver.employeeId).expect(200);

      expect(errorCode(await setRole('CONFLICT_SUBSTITUTE', approver.employeeId).expect(422))).toBe(
        'APPROVAL_ROLE.SUBSTITUTE_MUST_DIFFER',
      );
      await setRole('CONFLICT_SUBSTITUTE', substitute.employeeId).expect(200);
      expect(errorCode(await setRole('SPENDING_APPROVER', substitute.employeeId).expect(422))).toBe(
        'APPROVAL_ROLE.SUBSTITUTE_MUST_DIFFER',
      );
      const rows = await currentRows();
      expect(rows.find((row) => row.role === 'SPENDING_APPROVER')?.employee_id).toBe(approver.employeeId);
      expect(rows.find((row) => row.role === 'CONFLICT_SUBSTITUTE')?.employee_id).toBe(substitute.employeeId);
    });

    it('is also kept by the database when something writes around the service', async () => {
      const approver = await person();
      await setRole('SPENDING_APPROVER', approver.employeeId).expect(200);
      await ctx.sql.query(
        `UPDATE approval_role_holders SET held_until = GREATEST(now(), held_from) WHERE role = 'CONFLICT_SUBSTITUTE' AND held_until IS NULL`,
      );

      await expect(
        ctx.sql.query(
          `INSERT INTO approval_role_holders (id, organization_id, role, employee_id)
           VALUES (gen_random_uuid(), $1, 'CONFLICT_SUBSTITUTE', $2)`,
          [seed.organizationId, approver.employeeId],
        ),
      ).rejects.toMatchObject({ code: '23514' });
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
      await setRole('SPENDING_APPROVER', ceo.employeeId).expect(200);
      const before = await currentRows();

      for (const headers of [as(finance), as(it1), as(employee), as(ceo)]) {
        await setRole('SPENDING_APPROVER', employee.employeeId, headers).expect(403);
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

    it('lets only one of "approver" and "substitute" for the same person win, in either order, with no deadlock', async () => {
      const deadlocks = async () =>
        (
          await ctx.sql.query<{ n: number }>(
            'SELECT deadlocks::int AS n FROM pg_stat_database WHERE datname = current_database()',
          )
        ).rows[0].n;
      const deadlocksBefore = await deadlocks();
      for (let round = 0; round < 4; round += 1) {
        const target = await person();
        await ctx.sql.query(
          `UPDATE approval_role_holders SET held_until = GREATEST(now(), held_from) WHERE held_until IS NULL`,
        );

        await holder.query('BEGIN');
        await holder.query('SELECT pg_advisory_xact_lock($1)', [APPROVAL_ROLES_LOCK_KEY]);
        const asApprover = setRole('SPENDING_APPROVER', target.employeeId).then((r) => r);
        const asSubstitute = setRole('CONFLICT_SUBSTITUTE', target.employeeId).then((r) => r);
        await waitForWaiters(ctx.sql, 2);
        await holder.query('COMMIT');
        const answers = (await Promise.all([asApprover, asSubstitute])).map((r) => r.status).sort();

        expect(answers).toEqual([200, 422]);
        expect(await currentRows()).toHaveLength(1);
      }
      expect(await deadlocks()).toBe(deadlocksBefore);
    });
  });
});
