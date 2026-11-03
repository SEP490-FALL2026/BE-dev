import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import {
  HttpTestApp,
  SeededInstallation,
  createHttpTestApp,
  insertAccountFixture,
  insertEmployeeFixture,
  seedInstallation,
} from '../../support/http-test-app';

const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';

describe('role grant constraints (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let second: { appUserId: string };
  let third: { appUserId: string };

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    seed = await seedInstallation(ctx.app);
    second = await insertAccountFixture(ctx.app, seed, { code: 'E-2', email: 'two@acme.vn', activated: true });
    third = await insertAccountFixture(ctx.app, seed, { code: 'E-3', email: 'three@acme.vn', activated: true });
  }, 90000);

  afterAll(async () => {
    await ctx?.close();
  });

  const grant = (client: Client, appUserId: string, role: string, revoked = false) =>
    client.query(
      `INSERT INTO role_grants (id, organization_id, app_user_id, role, revoked_at)
       VALUES ($1, $2, $3, $4::"AppRole", ${revoked ? 'now()' : 'NULL'})`,
      [randomUUID(), seed.organizationId, appUserId, role],
    );

  const superAdminGrants = async () =>
    Number(
      (
        await ctx.sql.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM role_grants WHERE role = 'SUPER_ADMIN' AND revoked_at IS NULL",
        )
      ).rows[0].n,
    );

  it('starts with exactly one effective SUPER_ADMIN grant from the installation', async () => {
    expect(await superAdminGrants()).toBe(1);
  });

  it('rejects a second effective SUPER_ADMIN grant for another account (US-01-01 AC-14, data part)', async () => {
    await expect(grant(ctx.sql, second.appUserId, 'SUPER_ADMIN')).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
    expect(await superAdminGrants()).toBe(1);
  });

  it('rejects two concurrent SUPER_ADMIN grants once the first is revoked: exactly one survives', async () => {
    await ctx.sql.query("UPDATE role_grants SET revoked_at = now() WHERE role = 'SUPER_ADMIN' AND revoked_at IS NULL");
    expect(await superAdminGrants()).toBe(0);

    const a = new Client({ connectionString: ctx.database.url });
    const b = new Client({ connectionString: ctx.database.url });
    await Promise.all([a.connect(), b.connect()]);
    try {
      const results = await Promise.allSettled([
        grant(a, second.appUserId, 'SUPER_ADMIN'),
        grant(b, third.appUserId, 'SUPER_ADMIN'),
      ]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toMatchObject({ code: UNIQUE_VIOLATION });
      expect(await superAdminGrants()).toBe(1);
    } finally {
      await Promise.all([a.end(), b.end()]);
    }
  });

  it('rejects a duplicate effective (account, role) grant but keeps history of revoked ones', async () => {
    await grant(ctx.sql, third.appUserId, 'EMPLOYEE');
    await expect(grant(ctx.sql, third.appUserId, 'EMPLOYEE')).rejects.toMatchObject({ code: UNIQUE_VIOLATION });

    await ctx.sql.query("UPDATE role_grants SET revoked_at = now() WHERE app_user_id = $1 AND role = 'EMPLOYEE'", [
      third.appUserId,
    ]);
    await grant(ctx.sql, third.appUserId, 'EMPLOYEE');
    await grant(ctx.sql, third.appUserId, 'EMPLOYEE', true);
    const { rows } = await ctx.sql.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM role_grants WHERE app_user_id = $1 AND role = 'EMPLOYEE'",
      [third.appUserId],
    );
    expect(rows[0].n).toBe(3);
  });

  it('rejects the Super Admin role for a department head, whoever writes the row (the database is the last guard of a role transfer)', async () => {
    const head = await insertAccountFixture(ctx.app, seed, { code: 'E-5', email: 'five@acme.vn', activated: true });
    await ctx.sql.query(
      `INSERT INTO department_head_periods (id, organization_id, department_id, employee_id, valid_from)
       VALUES (gen_random_uuid(), $1, $2, $3, now()::date)`,
      [seed.organizationId, seed.departmentId, head.employeeId],
    );
    await ctx.sql.query("UPDATE role_grants SET revoked_at = now() WHERE role = 'SUPER_ADMIN' AND revoked_at IS NULL");

    try {
      await expect(grant(ctx.sql, head.appUserId, 'SUPER_ADMIN')).rejects.toMatchObject({ code: CHECK_VIOLATION });
      expect(await superAdminGrants()).toBe(0);
    } finally {
      await ctx.sql.query('DELETE FROM department_head_periods WHERE employee_id = $1', [head.employeeId]);
      await grant(ctx.sql, second.appUserId, 'SUPER_ADMIN');
    }
  });

  it('keeps an account attached to the one person it was made for: the employee of an account never changes (US-01-09 AC-16)', async () => {
    const other = await insertEmployeeFixture(ctx.app, seed, { code: 'E-6', email: 'six@acme.vn' });
    const employeeOf = async () =>
      (
        await ctx.sql.query<{ employee_id: string }>('SELECT employee_id FROM app_users WHERE id = $1', [
          second.appUserId,
        ])
      ).rows[0].employee_id;
    const original = await employeeOf();

    await expect(
      ctx.sql.query('UPDATE app_users SET employee_id = $2 WHERE id = $1', [second.appUserId, other.employeeId]),
    ).rejects.toMatchObject({ code: CHECK_VIOLATION });

    expect(await employeeOf()).toBe(original);
    // Writing the same person again, as any full-row update does, is not a change.
    await ctx.sql.query('UPDATE app_users SET employee_id = $2 WHERE id = $1', [second.appUserId, original]);
    expect(await employeeOf()).toBe(original);
  });

  /*
   * `qd93-direct-manager-spending-approver-roles`, Task 3 (QĐ-93a, QĐ-93b, US-01-01 AC-12, AC-21, US-01-03 AC-10, AC-11): the rules
   * of MANAGER and SPENDING_APPROVER at the database, whoever writes the row — with the Super Admin exclusions of
   * `20261016190000_super_admin_exclusions`, whose approval-role half had no test once the transfer route was gone.
   */
  describe('the roles MANAGER and SPENDING_APPROVER (QĐ-93)', () => {
    let counter = 0;
    const fresh = async () => {
      counter += 1;
      const code = `E-Q${counter}`;

      return insertAccountFixture(ctx.app, seed, { code, email: `q${counter}@acme.vn`, activated: true });
    };
    const rejected = (promise: Promise<unknown>) => expect(promise).rejects.toMatchObject({ code: CHECK_VIOLATION });
    /** The SQLSTATE and the message of a statement the database refused (the message names the rule that refused it). */
    const refusal = async (promise: Promise<unknown>): Promise<{ code: string | undefined; message: string }> => {
      try {
        await promise;
      } catch (error) {
        const { code, message } = error as { code?: string; message: string };

        return { code, message };
      }
      throw new Error('The statement was not refused.');
    };
    const revokeAll = (appUserId: string) =>
      ctx.sql.query('UPDATE role_grants SET revoked_at = now() WHERE app_user_id = $1 AND revoked_at IS NULL', [
        appUserId,
      ]);
    /** The effective SUPER_ADMIN grant is set aside while `fn` runs, so a grant of the role is judged by its rules, not by "only one". */
    const withoutSuperAdmin = async (fn: () => Promise<void>) => {
      const { rows } = await ctx.sql.query<{ id: string }>(
        "UPDATE role_grants SET revoked_at = now() WHERE role = 'SUPER_ADMIN' AND revoked_at IS NULL RETURNING id",
      );
      try {
        await fn();
      } finally {
        for (const row of rows) await ctx.sql.query('UPDATE role_grants SET revoked_at = NULL WHERE id = $1', [row.id]);
      }
    };
    const superAdminHolder = async () =>
      (
        await ctx.sql.query<{ app_user_id: string }>(
          "SELECT app_user_id FROM role_grants WHERE role = 'SUPER_ADMIN' AND revoked_at IS NULL",
        )
      ).rows[0].app_user_id;
    const headPeriod = (employeeId: string, from: string, to: string | null) =>
      ctx.sql.query(
        `INSERT INTO department_head_periods (id, organization_id, department_id, employee_id, valid_from, valid_to)
         VALUES (gen_random_uuid(), $1, $2, $3, $4::date, $5::date)`,
        [seed.organizationId, seed.departmentId, employeeId, from, to],
      );
    const clearHeads = () =>
      ctx.sql.query('DELETE FROM department_head_periods WHERE department_id = $1', [seed.departmentId]);
    const day = async (offset: number) =>
      (await ctx.sql.query<{ d: string }>('SELECT (current_date + $1::int)::text AS d', [offset])).rows[0].d;

    it.each([
      ['SUPER_ADMIN', 'IT_ADMIN'],
      ['SUPER_ADMIN', 'FINANCE'],
      ['SUPER_ADMIN', 'MANAGER'],
      ['SUPER_ADMIN', 'SPENDING_APPROVER'],
      ['SPENDING_APPROVER', 'IT_ADMIN'],
      ['SPENDING_APPROVER', 'FINANCE'],
      ['SPENDING_APPROVER', 'MANAGER'],
    ])('refuses %s together with %s, whichever is written first (US-01-01 AC-12, US-01-03 AC-11)', async (a, b) => {
      for (const [first, second] of [
        [a, b],
        [b, a],
      ]) {
        const account = await fresh();
        await withoutSuperAdmin(async () => {
          await grant(ctx.sql, account.appUserId, first);
          await rejected(grant(ctx.sql, account.appUserId, second));
          await revokeAll(account.appUserId);
        });
      }
    });

    it('allows the pairs the spec allows: MANAGER with IT_ADMIN or FINANCE, and EMPLOYEE with each role', async () => {
      const account = await fresh();
      for (const role of ['MANAGER', 'IT_ADMIN', 'FINANCE', 'EMPLOYEE']) await grant(ctx.sql, account.appUserId, role);
      await revokeAll(account.appUserId);
      const approver = await fresh();
      await grant(ctx.sql, approver.appUserId, 'SPENDING_APPROVER');
      await grant(ctx.sql, approver.appUserId, 'EMPLOYEE');
      await revokeAll(approver.appUserId);
    });

    it('allows one effective SPENDING_APPROVER, whatever the state of the holder (a locked account keeps it), and not a second (US-01-03 AC-10)', async () => {
      const first = await fresh();
      const second = await fresh();
      await grant(ctx.sql, first.appUserId, 'SPENDING_APPROVER');
      await ctx.sql.query("UPDATE app_users SET status = 'LOCKED' WHERE id = $1", [first.appUserId]);

      await expect(grant(ctx.sql, second.appUserId, 'SPENDING_APPROVER')).rejects.toMatchObject({
        code: UNIQUE_VIOLATION,
        constraint: 'role_grants_one_spending_approver',
      });

      await revokeAll(first.appUserId);
      await grant(ctx.sql, second.appUserId, 'SPENDING_APPROVER');
      await revokeAll(second.appUserId);
    });

    it('refuses SPENDING_APPROVER for a head today or from a later day, and allows it for one whose period ended (QĐ-93b)', async () => {
      const current = await fresh();
      const future = await fresh();
      const past = await fresh();
      try {
        await headPeriod(current.employeeId, await day(0), null);
        const refused = await refusal(grant(ctx.sql, current.appUserId, 'SPENDING_APPROVER'));
        expect(refused.code).toBe(CHECK_VIOLATION);
        expect(refused.message).toContain('role_grants_spending_approver_not_head');
        await clearHeads();
        await headPeriod(future.employeeId, await day(10), null);
        await rejected(grant(ctx.sql, future.appUserId, 'SPENDING_APPROVER'));
        await clearHeads();
        await headPeriod(past.employeeId, await day(-30), await day(-1));
        await grant(ctx.sql, past.appUserId, 'SPENDING_APPROVER');
      } finally {
        await clearHeads();
        await revokeAll(past.appUserId);
      }
    });

    it('refuses revoking MANAGER of a head today or from a later day, and allows it once the period ended (US-01-01 AC-21)', async () => {
      const current = await fresh();
      const future = await fresh();
      const former = await fresh();
      const plain = await fresh();
      const revoke = (appUserId: string) =>
        ctx.sql.query(
          "UPDATE role_grants SET revoked_at = now() WHERE app_user_id = $1 AND role = 'MANAGER' AND revoked_at IS NULL",
          [appUserId],
        );
      try {
        for (const account of [current, future, former, plain]) await grant(ctx.sql, account.appUserId, 'MANAGER');
        await headPeriod(current.employeeId, await day(0), null);
        const refused = await refusal(revoke(current.appUserId));
        expect(refused.code).toBe(CHECK_VIOLATION);
        expect(refused.message).toContain('role_grants_manager_revoke_guard');
        await clearHeads();
        await headPeriod(future.employeeId, await day(10), null);
        await rejected(revoke(future.appUserId));
        await clearHeads();
        await headPeriod(former.employeeId, await day(-30), await day(-1));
        await revoke(former.appUserId);
        await revoke(plain.appUserId);
        await clearHeads();
        await revoke(current.appUserId);
        await revoke(future.appUserId);
      } finally {
        await clearHeads();
      }
    });

    it('refuses the Super Admin role for someone who holds an approval role, until the holding ends (the other half of the exclusions)', async () => {
      const holder = await fresh();
      for (const role of ['CONFLICT_SUBSTITUTE', 'FALLBACK_APPROVER']) {
        await ctx.sql.query(
          `INSERT INTO approval_role_holders (id, organization_id, role, employee_id, held_from)
           VALUES (gen_random_uuid(), $1, $2::"ApprovalRole", $3, now() - interval '1 day')`,
          [seed.organizationId, role, holder.employeeId],
        );
        await withoutSuperAdmin(async () => {
          const refused = await refusal(grant(ctx.sql, holder.appUserId, 'SUPER_ADMIN'));
          expect(refused.code).toBe(CHECK_VIOLATION);
          expect(refused.message).toContain('holds an approval role');
          await ctx.sql.query(
            `UPDATE approval_role_holders SET held_until = GREATEST(now(), held_from)
              WHERE employee_id = $1 AND role = $2::"ApprovalRole" AND held_until IS NULL`,
            [holder.employeeId, role],
          );
          await grant(ctx.sql, holder.appUserId, 'SUPER_ADMIN');
          await revokeAll(holder.appUserId);
        });
      }
    });

    it('gives the holder of the Super Admin role neither MANAGER nor SPENDING_APPROVER (US-01-03 AC-2)', async () => {
      const holder = await superAdminHolder();

      await rejected(grant(ctx.sql, holder, 'MANAGER'));
      await rejected(grant(ctx.sql, holder, 'SPENDING_APPROVER'));
    });
  });
});
