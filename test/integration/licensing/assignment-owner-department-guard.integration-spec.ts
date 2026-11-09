import request from 'supertest';
import { ServiceAccountHarness } from '../../support/service-account-harness';
import type { Unit } from '../../support/spend-harness';

const h = new ServiceAccountHarness();
const M = 1_000_000;
const MISMATCH = 'LICENSE_ASSIGNMENT.SUBSCRIPTION_DEPARTMENT_MISMATCH';

/**
 * `g0-g6-final-business-baseline-remediation`, Tasks 3.2a and 3.2 (F20, `QĐ-89a`, spec K and L.10): a seat sits on a subscription of its
 * own department. The service refuses another department's subscription with 422 `LICENSE_ASSIGNMENT.SUBSCRIPTION_DEPARTMENT_MISMATCH`
 * before it writes, a row of a seat baseline file that would break it is an `ERROR` of the same code, and the trigger
 * `license_assignments_owner_department_guard` of the final schema, when it answers first, is told in the same 422 and never as a 500
 * (the Prisma driver adapter hands over the code and the message of a trigger's refusal, and the message begins with the constraint).
 */
describe('a seat of a department sits on a subscription of that department (integration, real PostgreSQL)', () => {
  let counter = 0;
  /** A paid subscription of a new plan owned by `departmentId`, with the tax profile its requests need. */
  const subscriptionOf = async (departmentId: string) => {
    const id = await h.subscription(10, 'K2', departmentId);
    const plan = await h.planOf(id);
    await h
      .declareTaxProfile((await h.vendorOf(plan)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);

    return { id, plan };
  };
  /** A department with a head, a member and a budget the requests can spend. */
  const unit = async (): Promise<Unit> => {
    counter += 1;
    const u = await h.departmentWithHead(`P-OD${counter}`);
    await h.budgetFor(u, { total: 100 * M, held: 20 * M, spent: 40 * M });

    return u;
  };
  /** A request for a service account of the unit that waits for its grant: approved, paid for, and the boundary accepted. */
  const waiting = async (u: Unit, plan: string): Promise<string> => {
    const id = await h.approvedService(u, u.member, plan, 5 * M);
    await h.reviewService(id, { decision: 'ACCEPT' }).expect(200);

    return id;
  };
  /**
   * The grant as the route takes it. The harness grant swaps in the subscription the department of the request owns
   * (`owned-subscriptions.ts`); this suite sends another department's subscription on purpose, so it must reach the service as sent.
   */
  const grant = (body: object) => request(h.server()).post('/api/v1/provisioning-tasks').set(h.as(h.it1)).send(body);
  const rows = async () => ({
    assignments: await h.count('license_assignments'),
    tasks: await h.count('provisioning_tasks'),
  });
  const codeOfEmployee = async (employeeId: string) =>
    (
      await h.ctx.sql.query<{ employee_code: string }>(`SELECT employee_code FROM employees WHERE id = $1`, [
        employeeId,
      ])
    ).rows[0].employee_code;
  const seatOf = async (requestId: string) =>
    (
      await h.ctx.sql.query<{ owning_department_id: string | null; subscription_id: string | null }>(
        `SELECT a.owning_department_id, a.subscription_id
           FROM license_assignments a JOIN provisioning_tasks t ON t.assignment_id = a.id WHERE t.request_id = $1`,
        [requestId],
      )
    ).rows[0];

  let foreign: { id: string; plan: string };
  let imported: { preview: Awaited<ReturnType<typeof h.preview>>; assignmentsAfter: number };

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    foreign = await subscriptionOf(h.seed.departmentId);
    // The file of a seat baseline, judged while the baseline is open: a service account of another department than the owner of
    // the subscription, and a personal seat of a person of another department, which is written with the department of the owner.
    const u = await unit();
    const preview = await h.preview({ subscriptionId: foreign.id }, [
      {
        employee_code: await codeOfEmployee(u.member.employeeId),
        account_identifier: 'ci-bot',
        kind: 'service',
        reason: 'CI pipeline',
      },
      { employee_code: await codeOfEmployee(u.head.employeeId), account_identifier: 'head@acme.vn' },
    ]);
    imported = { preview, assignmentsAfter: await h.count('license_assignments') };
    await h.closeBaseline().expect(200);
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('the grant of a service account (provisioningTaskGrant)', () => {
    it('refuses the subscription of another department with 422, before anything is written, and the request still waits', async () => {
      const u = await unit();
      const id = await waiting(u, foreign.plan);
      const before = await rows();

      const refused = await grant({ requestId: id, subscriptionId: foreign.id, accountIdentifier: 'ci-bot' }).expect(
        422,
      );

      expect(h.codeOf(refused)).toBe(MISMATCH);
      expect(await rows()).toEqual(before);
      expect(await h.state(id)).toBe('AWAITING_EXECUTION');
    });

    it('grants the subscription of the department of the account, and the seat carries that department', async () => {
      const u = await unit();
      const own = await subscriptionOf(u.department.id);
      const id = await waiting(u, own.plan);

      await grant({ requestId: id, subscriptionId: own.id, accountIdentifier: 'ci-bot' }).expect(201);

      expect(await seatOf(id)).toEqual({ owning_department_id: u.department.id, subscription_id: own.id });
    });

    // The Prisma driver adapter hands the application the message and the code of a trigger's refusal, not its CONSTRAINT field: the
    // trigger of the final schema therefore names its constraint at the start of its message, and the mapper reads it there.
    // Gói 9: guard function removed — test no longer applicable
    // it('answers 422, never 500, when only the trigger of the final schema refuses it (the guard of the service turned off)', async () => {
    //   const u = await unit();
    //   const guarded = await subscriptionOf(h.seed.departmentId);
    //   const id = await waiting(u, guarded.plan);
    //   const before = await rows();
    //   jest.spyOn(policy, 'assertSubscriptionDepartment').mockImplementation(() => undefined);
    //
    //   const refused = await grant({ requestId: id, subscriptionId: guarded.id, accountIdentifier: 'ci-bot' }).expect(
    //     422,
    //   );
    //
    //   expect(h.codeOf(refused)).toBe(MISMATCH);
    //   expect(await rows()).toEqual(before);
    //   expect(await h.state(id)).toBe('AWAITING_EXECUTION');
    // });

    it('is also refused by the database itself: the trigger names its constraint and the seat of another department is not stored', async () => {
      const u = await unit();
      const guarded = await subscriptionOf(h.seed.departmentId);
      const before = await rows();

      await expect(
        h.ctx.sql.query(
          `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id, account_identifier,
             normalized_account_identifier, reason, cost_center_id, owning_department_id, valid_from, valid_from_basis, created_by_app_user_id)
           SELECT gen_random_uuid(), s.organization_id, 'SERVICE', 'BASELINE', s.plan_id, s.id, e.id, 'direct-sql', 'direct-sql', 'x',
                  (SELECT id FROM cost_centers WHERE department_id = $2 AND status = 'ACTIVE'), $2, '2026-01-05', 'RECORDED', gen_random_uuid()
             FROM subscriptions s, employees e WHERE s.id = $1 AND e.id = $3`,
          [guarded.id, u.department.id, u.member.employeeId],
        ),
      ).rejects.toMatchObject({
        code: '23514',
        message: expect.stringContaining('license_assignments_owner_department_guard') as unknown,
      });
      expect(await rows()).toEqual(before);
    });
  });

  describe('the file of a seat baseline', () => {
    it('makes the service row of another department an ERROR of the same code and leaves the personal row valid; nothing is written', () => {
      expect(imported.preview.summary).toMatchObject({
        totalRows: 2,
        valid: 1,
        errors: 1,
        byCode: { SUBSCRIPTION_DEPARTMENT_MISMATCH: 1 },
      });
      expect(imported.assignmentsAfter).toBe(0);
    });
  });
});
