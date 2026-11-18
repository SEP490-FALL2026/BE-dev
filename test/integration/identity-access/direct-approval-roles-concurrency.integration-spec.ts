import { Client } from 'pg';
import request from 'supertest';
import { AccountManagementHttpHarness, errorCode } from '../../support/account-management-http-harness';
import { waitForLockWaiters } from '../../support/lock-wait';
import { OrganizationReadApi } from '../../../src/modules/organization/public/organization-read.api';

/** The advisory key every change of the approval roles and every grant of SPENDING_APPROVER takes first (`role-grant.repo.ts`). */
const APPROVAL_ROLES_LOCK_KEY = 7_300_001;

/**
 * `qd93-direct-manager-spending-approver-roles`, Task 11 (spec › Rủi ro đua; US-01-03 AC-10, AC-11, US-01-01 AC-21, QĐ-93a): what the
 * database and the lock protocol keep true when two writers meet. The order of the two is not left to chance: a holder connection takes
 * the lock the writers queue on, each writer is sent and seen waiting (`pg_locks`), and only then is the holder released, so the first
 * of the pair to be served is the one sent first.
 */
describe('MANAGER and SPENDING_APPROVER when two writers meet (integration, real PostgreSQL)', () => {
  const h = new AccountManagementHttpHarness();
  let holder: Client;

  beforeAll(async () => {
    await h.start();
    holder = new Client({ connectionString: h.ctx.database.url });
    await holder.connect();
  }, 120000);

  afterEach(async () => {
    await holder.query('ROLLBACK').catch(() => undefined);
    await holder.query('SELECT pg_advisory_unlock_all()');
    await h.ctx.sql.query(
      `UPDATE role_grants SET revoked_at = GREATEST(now(), granted_at) WHERE role = 'SPENDING_APPROVER' AND revoked_at IS NULL`,
    );
    await h.ctx.sql.query('DELETE FROM department_head_periods');
    await h.afterEach();
  });

  afterAll(async () => {
    await holder.end();
    await h.stop();
  });

  const day = async (offset: number): Promise<string> =>
    // The business day of the organization (Asia/Ho_Chi_Minh), not current_date of the database (UTC): a head from today.
    (
      await h.ctx.sql.query<{ d: string }>('SELECT ($1::date + $2::int)::text AS d', [
        await h.ctx.app.get(OrganizationReadApi, { strict: false }).businessToday(),
        offset,
      ])
    ).rows[0].d;
  const grant = (appUserId: string, role: string) =>
    h.admin.put(`/api/v1/app-users/${appUserId}/role`, { role }).then((response) => response);
  const revoke = (appUserId: string, role: string) =>
    h.admin
      .put(`/api/v1/app-users/${appUserId}/role`)
      .send({ role: role === 'SUPER_ADMIN' ? role : 'EMPLOYEE' })
      .then((response) => response);
  const assignHead = async (employeeId: string) =>
    h.admin
      .post(`/api/v1/departments/${h.seed.departmentId}/head-assignments`, { employeeId, effectiveFrom: await day(0) })
      .then((response) => response);
  const designateSuccessor = async (employeeId: string) =>
    h.admin
      .post(`/api/v1/departments/${h.seed.departmentId}/successor-designations`, {
        employeeId,
        effectiveFrom: await day(5),
      })
      .then((response) => response);
  const rolesOf = async (appUserId: string): Promise<string[]> =>
    (
      (await h.admin.get(`/api/v1/app-users/${appUserId}`).expect(200)).body as { data: { roles: string[] } }
    ).data.roles.slice();
  const periodsOf = async (employeeId: string): Promise<number> =>
    Number(
      (
        await h.ctx.sql.query<{ n: string }>(
          'SELECT count(*) AS n FROM department_head_periods WHERE employee_id = $1',
          [employeeId],
        )
      ).rows[0].n,
    );
  /** No head period of the day belongs to a person who does not hold MANAGER (QĐ-93a): the invariant the two writers must not break. */
  const headsWithoutManager = async (): Promise<number> =>
    Number(
      (
        await h.ctx.sql.query<{ n: string }>(
          `SELECT count(*) AS n FROM department_head_periods p JOIN app_users u ON u.employee_id = p.employee_id
            WHERE (p.valid_to IS NULL OR p.valid_to > current_date)
              AND NOT EXISTS (SELECT 1 FROM role_grants g WHERE g.app_user_id = u.id AND g.role = 'MANAGER' AND g.revoked_at IS NULL)`,
        )
      ).rows[0].n,
    );
  /** Takes the account row of the person for update in the holder connection, so the writers queue on it. */
  const holdAccount = async (appUserId: string) => {
    await holder.query('BEGIN');
    await holder.query('SELECT id FROM app_users WHERE id = $1 FOR UPDATE', [appUserId]);
  };

  describe('two grants of SPENDING_APPROVER (US-01-03 AC-10)', () => {
    it('lets exactly one of two concurrent grants through, and tells the other the role is taken (409)', async () => {
      const first = await h.activatedAccount([]);
      const second = await h.activatedAccount([]);
      await holder.query('SELECT pg_advisory_lock($1)', [APPROVAL_ROLES_LOCK_KEY]);

      const one = grant(first.appUserId, 'SPENDING_APPROVER');
      await waitForLockWaiters(h.ctx.sql, 1);
      const two = grant(second.appUserId, 'SPENDING_APPROVER');
      await waitForLockWaiters(h.ctx.sql, 2);
      await holder.query('SELECT pg_advisory_unlock($1)', [APPROVAL_ROLES_LOCK_KEY]);
      const answers = await Promise.all([one, two]);

      expect(answers.map((answer) => answer.status).sort()).toEqual([200, 409]);
      const refused = answers.find((answer) => answer.status === 409);
      expect(errorCode(refused as request.Response)).toBe('APP_USER.SPENDING_APPROVER_ALREADY_ASSIGNED');
      const holders = await h.ctx.sql.query(
        `SELECT 1 FROM role_grants WHERE role = 'SPENDING_APPROVER' AND revoked_at IS NULL`,
      );
      expect(holders.rowCount).toBe(1);
    });
  });

  describe('naming a head and revoking MANAGER of the same person (US-01-01 AC-21)', () => {
    it('revoke first: the head assignment then finds no MANAGER (422) and no period is written', async () => {
      const person = await h.activatedAccount(['MANAGER']);
      await holdAccount(person.appUserId);

      const revoked = revoke(person.appUserId, 'MANAGER');
      await waitForLockWaiters(h.ctx.sql, 1);
      const assigned = assignHead(person.employeeId);
      await waitForLockWaiters(h.ctx.sql, 2);
      await holder.query('COMMIT');
      const [revokeAnswer, assignAnswer] = await Promise.all([revoked, assigned]);

      expect(revokeAnswer.status).toBe(200);
      expect([assignAnswer.status, errorCode(assignAnswer)]).toEqual([422, 'DEPARTMENT.HEAD_MANAGER_ROLE_REQUIRED']);
      expect(await periodsOf(person.employeeId)).toBe(0);
      expect(await rolesOf(person.appUserId)).toEqual(['EMPLOYEE']);
      expect(await headsWithoutManager()).toBe(0);
    });

    it('assignment first: the revoke then sees the period and is refused with 409, never a 500', async () => {
      const person = await h.activatedAccount(['MANAGER']);
      await holdAccount(person.appUserId);

      const assigned = assignHead(person.employeeId);
      await waitForLockWaiters(h.ctx.sql, 1);
      const revoked = revoke(person.appUserId, 'MANAGER');
      await waitForLockWaiters(h.ctx.sql, 2);
      await holder.query('COMMIT');
      const [assignAnswer, revokeAnswer] = await Promise.all([assigned, revoked]);

      expect(assignAnswer.status).toBe(200);
      expect([revokeAnswer.status, errorCode(revokeAnswer)]).toEqual([409, 'APP_USER.MANAGER_STILL_HEADING']);
      expect(await periodsOf(person.employeeId)).toBe(1);
      expect(await rolesOf(person.appUserId)).toEqual(['MANAGER']);
      expect(await headsWithoutManager()).toBe(0);
    });
  });

  describe('naming a successor and revoking MANAGER of the successor (US-01-01 AC-21)', () => {
    const headed = async () => {
      const head = await h.activatedAccount(['MANAGER']);
      const heir = await h.activatedAccount(['MANAGER']);
      await assignHead(head.employeeId).then((answer) => expect(answer.status).toBe(200));

      return { head, heir };
    };

    it('revoke first: the designation finds no MANAGER (422) and names nobody', async () => {
      const { heir } = await headed();
      await holdAccount(heir.appUserId);

      const revoked = revoke(heir.appUserId, 'MANAGER');
      await waitForLockWaiters(h.ctx.sql, 1);
      const designated = designateSuccessor(heir.employeeId);
      await waitForLockWaiters(h.ctx.sql, 2);
      await holder.query('COMMIT');
      const [revokeAnswer, designateAnswer] = await Promise.all([revoked, designated]);

      expect(revokeAnswer.status).toBe(200);
      expect([designateAnswer.status, errorCode(designateAnswer)]).toEqual([
        422,
        'DEPARTMENT.HEAD_MANAGER_ROLE_REQUIRED',
      ]);
      expect(await periodsOf(heir.employeeId)).toBe(0);
      expect(await headsWithoutManager()).toBe(0);
    });

    it('designation first: the revoke sees the period of the successor and is refused with 409', async () => {
      const { heir } = await headed();
      await holdAccount(heir.appUserId);

      const designated = designateSuccessor(heir.employeeId);
      await waitForLockWaiters(h.ctx.sql, 1);
      const revoked = revoke(heir.appUserId, 'MANAGER');
      await waitForLockWaiters(h.ctx.sql, 2);
      await holder.query('COMMIT');
      const [designateAnswer, revokeAnswer] = await Promise.all([designated, revoked]);

      expect(designateAnswer.status).toBe(200);
      expect([revokeAnswer.status, errorCode(revokeAnswer)]).toEqual([409, 'APP_USER.MANAGER_STILL_HEADING']);
      expect(await rolesOf(heir.appUserId)).toEqual(['MANAGER']);
      expect(await headsWithoutManager()).toBe(0);
    });
  });

  describe('two grants of SPENDING_APPROVER at once, for two people (QĐ-93a)', () => {
    it.each([
      ['the first person first', true],
      ['the second person first', false],
    ])('lets exactly one of the two through, whichever is served first: %s', async (_name, firstPersonFirst) => {
      await h.ctx.sql.query(
        `UPDATE role_grants SET revoked_at = now() WHERE role = 'SPENDING_APPROVER' AND revoked_at IS NULL`,
      );
      const one = await h.activatedAccount([]);
      const other = await h.activatedAccount([]);
      await holder.query('SELECT pg_advisory_lock($1)', [APPROVAL_ROLES_LOCK_KEY]);

      const sends = [
        () => grant(one.appUserId, 'SPENDING_APPROVER'),
        () => grant(other.appUserId, 'SPENDING_APPROVER'),
      ];
      const ordered = firstPersonFirst ? sends : [...sends].reverse();
      const first = ordered[0]();
      await waitForLockWaiters(h.ctx.sql, 1);
      const second = ordered[1]();
      await waitForLockWaiters(h.ctx.sql, 2);
      await holder.query('SELECT pg_advisory_unlock($1)', [APPROVAL_ROLES_LOCK_KEY]);
      const [firstAnswer, secondAnswer] = await Promise.all([first, second]);

      // The one served first holds the role; the other is refused with the code of the single holder, and nothing of it is written.
      expect([firstAnswer.status, secondAnswer.status]).toEqual([200, 409]);
      expect(errorCode(secondAnswer)).toBe('APP_USER.SPENDING_APPROVER_ALREADY_ASSIGNED');
      const held = await h.ctx.sql.query(
        `SELECT u.employee_id FROM role_grants g JOIN app_users u ON u.id = g.app_user_id
          WHERE g.role = 'SPENDING_APPROVER' AND g.revoked_at IS NULL`,
      );
      expect(held.rows).toHaveLength(1);
    });
  });
});
