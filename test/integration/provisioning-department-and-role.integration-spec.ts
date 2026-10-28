import { IdentityAccessService } from '../../src/modules/identity-access/identity-access.service';
import { ProvisioningDecisionService } from '../../src/modules/licensing/provisioning/provisioning-decision.service';
import { ProvisioningItAdminRequiredError } from '../../src/modules/licensing/provisioning/provisioning.errors';
import { ProvisioningService } from '../../src/modules/licensing/provisioning/provisioning.service';
import type { AuthenticatedPrincipal } from '../../src/infrastructure/security/tokens/access-token-verifier.port';
import type { ApiAccount } from '../support/api-accounts';
import { ProvisioningHarness } from '../support/provisioning-harness';

const h = new ProvisioningHarness();
const MISMATCH = 'LICENSE_ASSIGNMENT.SUBSCRIPTION_DEPARTMENT_MISMATCH';

/**
 * F20 (the grant of a request goes only on a subscription of the department of the request, `QĐ-89a`), F13 (the IT Admin role is judged
 * by the policy of the work and not only by the guard of its route) and F24 (`SoD-5`: the IT Admin who serves themselves is counted in
 * the transaction of the act, marked in the audit event and told to the Super Admin), on real PostgreSQL.
 */
describe('the grant of a seat and the work on a task: the department of the seat, the role and SoD-5 (integration, real PostgreSQL)', () => {
  let own: { subscriptionId: string; planId: string };
  let other: { id: string; code: string };
  let foreignSubscription: { subscriptionId: string; planId: string };

  const subscriptionOf = async (departmentId?: string) => {
    const subscriptionId = await h.subscription(5, 'K2', departmentId);

    return { subscriptionId, planId: await h.planOf(subscriptionId) };
  };
  const seatOf = async (assignmentId: string) =>
    (
      await h.ctx.sql.query<{ owning_department_id: string | null; subscription_id: string | null }>(
        `SELECT owning_department_id, subscription_id FROM license_assignments WHERE id = $1`,
        [assignmentId],
      )
    ).rows[0];
  const counts = async () => ({
    assignments: await h.count('license_assignments'),
    tasks: await h.count('provisioning_tasks'),
  });
  const principalOf = (employeeId: string, roles: string[]): AuthenticatedPrincipal => ({
    subject: 'test',
    appUserId: '00000000-0000-4000-8000-000000000001',
    sessionId: 'test',
    employeeId,
    directRoles: roles,
    derivedRoles: [],
    roles,
  });
  const notices = async (taskId: string) =>
    (
      await h.ctx.sql.query<{ recipient_employee_id: string; params: Record<string, string> }>(
        `SELECT recipient_employee_id, params FROM in_app_notifications WHERE code = 'IT_ADMIN_SELF_EXECUTED' AND subject_id = $1`,
        [taskId],
      )
    ).rows;

  beforeAll(async () => {
    await h.start();
    other = await h.department('P-OTH');
    own = await subscriptionOf();
    foreignSubscription = await subscriptionOf(other.id);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  describe('the grant target of a request (F20)', () => {
    it('refuses a subscription of another department than the one of the request: 422, nothing written, the request still waits', async () => {
      const person = await h.person('E-DR1');
      const before = await counts();
      const requestId = h.gate.grantable(person, foreignSubscription.planId);

      const refused = await h.grant({ requestId, subscriptionId: foreignSubscription.subscriptionId }).expect(422);

      expect(h.codeOf(refused)).toBe(MISMATCH);
      expect(await counts()).toEqual(before);
      expect(h.gate.outcomes).toEqual([]);
    });

    it('grants the subscription of the department of the request, and the seat carries the department that owns the subscription', async () => {
      const person = await h.person('E-DR2');
      const task = await h.granted(person, own.planId, { subscriptionId: own.subscriptionId });

      expect(await seatOf(task.assignmentId)).toEqual({
        owning_department_id: h.seed.departmentId,
        subscription_id: own.subscriptionId,
      });
    });

    it('grants a request of another department on a subscription of that department: the seat is counted on that subscription alone, with no pool between departments', async () => {
      const person = await h.person('E-DR3');
      const ownFree = await h.freeSeats(own.subscriptionId);

      const task = await h.granted(person, foreignSubscription.planId, {
        subscriptionId: foreignSubscription.subscriptionId,
        departmentId: other.id,
      });

      expect(await seatOf(task.assignmentId)).toEqual({
        owning_department_id: other.id,
        subscription_id: foreignSubscription.subscriptionId,
      });
      expect(await h.freeSeats(foreignSubscription.subscriptionId)).toBe(4);
      expect(await h.freeSeats(own.subscriptionId)).toBe(ownFree);
    });
  });

  describe('the role of whoever works the queue (F13)', () => {
    it('refuses, in the services and not only at the guard of the routes, a person who is not an IT Admin: nothing changes', async () => {
      const person = await h.person('E-DR4');
      const task = await h.granted(person, own.planId, { subscriptionId: own.subscriptionId });
      const outsider = principalOf(person, ['FINANCE']);
      const decisions = h.ctx.app.get(ProvisioningDecisionService, { strict: false });
      const queue = h.ctx.app.get(ProvisioningService, { strict: false });
      const before = await counts();

      const attempts = [
        () => queue.claim(outsider, task.id),
        () => queue.complete(outsider, task.id, { evidence: 'x' }),
        () => queue.reportFailure(outsider, task.id, { reason: 'x' }),
        () => decisions.retry(outsider, task.id),
        () => decisions.handOff(outsider, task.id),
        () => decisions.closeFailed(outsider, task.id, { reason: 'x' }),
        () => decisions.cancel(outsider, task.id),
        () =>
          queue.grant(outsider, {
            requestId: h.gate.grantable(person, own.planId),
            subscriptionId: own.subscriptionId,
          }),
      ];
      for (const attempt of attempts) await expect(attempt()).rejects.toBeInstanceOf(ProvisioningItAdminRequiredError);

      expect(await counts()).toEqual(before);
      expect((await h.getTask(task.id).expect(200)).body).toMatchObject({ data: { task: { status: 'QUEUED' } } });
    });
  });

  describe('the evidence of the work by hand, for every kind of grant (F08, T-8)', () => {
    const taskStatus = async (id: string): Promise<string> =>
      (await h.ctx.sql.query<{ status: string }>(`SELECT status FROM provisioning_tasks WHERE id = $1`, [id])).rows[0]
        .status;
    /** A grant task of a K4 purchase, which the queue does not grant yet (the key vault and the devices come later): written as the database allows. */
    const keyTask = async (): Promise<string> => {
      const subscriptionId = await h.subscription(5, 'K4');
      const employeeId = await h.person(`E-K4-${subscriptionId.slice(0, 6)}`);
      const assignmentId = (
        await h.ctx.sql.query<{ id: string }>(
          `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id, account_identifier,
             normalized_account_identifier, valid_from, valid_from_basis, created_by_app_user_id)
           SELECT gen_random_uuid(), s.organization_id, 'PERSONAL', 'REQUEST', s.plan_id, s.id, $2, 'k4@acme.vn', 'k4@acme.vn',
                  '2026-10-01', 'ACTUAL', gen_random_uuid()
             FROM subscriptions s WHERE s.id = $1 RETURNING id`,
          [subscriptionId, employeeId],
        )
      ).rows[0].id;

      return (
        await h.ctx.sql.query<{ id: string }>(
          `INSERT INTO provisioning_tasks (id, organization_id, assignment_id, kind, channel, request_id, max_attempts, created_by_app_user_id)
           SELECT gen_random_uuid(), organization_id, id, 'GRANT', 'MANUAL', gen_random_uuid(), 4, gen_random_uuid()
             FROM license_assignments WHERE id = $1 RETURNING id`,
          [assignmentId],
        )
      ).rows[0].id;
    };
    const grantOfKind = async (kind: 'K1' | 'K2' | 'K5'): Promise<string> => {
      const person = await h.person(`E-EV-${kind}`);
      if (kind === 'K5') return (await h.granted(person, await h.plan('K5'))).id;
      const subscriptionId = await h.subscription(5, kind);

      return (await h.granted(person, await h.planOf(subscriptionId), { subscriptionId })).id;
    };

    it.each([['K1'], ['K2'], ['K5'], ['K4']] as const)(
      '%s: completing with no evidence, or with blank evidence, is refused 422 and the task stays in progress',
      async (kind) => {
        const id = kind === 'K4' ? await keyTask() : await grantOfKind(kind);
        await h.claim(id).expect(200);

        for (const body of [{}, { evidence: '   ' }]) {
          expect(h.codeOf(await h.complete(id, body).expect(422))).toBe('PROVISIONING_TASK.EVIDENCE_REQUIRED');
        }
        expect(await taskStatus(id)).toBe('IN_PROGRESS');

        await h.complete(id, { evidence: `đã làm ${kind}` }).expect(200);
        expect(await taskStatus(id)).toBe('COMPLETED');
      },
    );
  });

  describe('SoD-5: the IT Admin who serves themselves (F24)', () => {
    let selfEmployee: string;
    let selfAccount: ApiAccount;

    beforeAll(async () => {
      selfEmployee = await h.person('E-SELF');
      selfAccount = await h.account('E-SELF', selfEmployee, ['IT_ADMIN']);
    });

    it('does not mark or tell anything while another IT Admin can do the work, and the work is refused', async () => {
      const task = await h.granted(selfEmployee, own.planId, { subscriptionId: own.subscriptionId });

      const refused = await h.claim(task.id, selfAccount).expect(403);

      expect(h.codeOf(refused)).toBe('PROVISIONING.ANOTHER_IT_ADMIN_NEEDED');
      expect(await notices(task.id)).toEqual([]);
    });

    it('counts the other IT Admins in the transaction of the act, marks the audit event and tells the Super Admin once, when no other IT Admin can act', async () => {
      const task = await h.granted(selfEmployee, foreignSubscription.planId, {
        subscriptionId: foreignSubscription.subscriptionId,
        departmentId: other.id,
      });
      // The one other IT Admin of the installation cannot act any more.
      await h.ctx.sql.query(`UPDATE app_users SET status = 'LOCKED' WHERE id = $1`, [h.it1.appUserId]);
      const identity = h.ctx.app.get(IdentityAccessService, { strict: false });
      const count = jest.spyOn(identity, 'countUsableItAdminsExcept');

      await h.claim(task.id, selfAccount).expect(200);

      // The count is made with the transaction of the claim, not on a connection of its own.
      expect(count.mock.calls.length).toBeGreaterThan(0);
      expect(count.mock.calls.every(([employeeId, tx]) => employeeId === selfEmployee && tx !== undefined)).toBe(true);
      count.mockRestore();
      const claimed = (await h.auditEvents('ProvisioningTask', task.id)).find(
        (event) => event.action === 'PROVISIONING_TASK.CLAIMED',
      );
      expect(claimed?.after).toMatchObject({ selfExecuted: true });
      await h.complete(task.id, { evidence: 'đã làm cho chính mình' }, selfAccount).expect(200);
      const told = await notices(task.id);
      expect(told).toHaveLength(1);
      expect(told[0].params).toEqual({ taskId: task.id, employeeId: selfEmployee });
      expect(told[0].recipient_employee_id).not.toBe(selfEmployee);
    });
  });
});
