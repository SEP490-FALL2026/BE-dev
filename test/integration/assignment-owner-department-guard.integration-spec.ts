import * as policy from '../../src/modules/licensing/assignment/assignment.policy';
import { ServiceAccountHarness } from '../support/service-account-harness';
import type { Unit } from '../support/spend-harness';

const h = new ServiceAccountHarness();
const M = 1_000_000;
const MISMATCH = 'LICENSE_ASSIGNMENT.SUBSCRIPTION_DEPARTMENT_MISMATCH';

/**
 * `g0-g6-final-business-baseline-remediation`, Task 3.2a (F20, `QĐ-89a`, review `P03-RV-03`, spec K and L.10): a seat that carries an
 * owning department (a service account) sits on a subscription of that department. From the compatibility release the service
 * refuses another department's subscription with 422 `LICENSE_ASSIGNMENT.SUBSCRIPTION_DEPARTMENT_MISMATCH` before it writes, a
 * subscription nobody owns yet is not checked, a row of a seat baseline file that would break it is an `ERROR` of the same code,
 * and the trigger of the final schema, when it answers first, is told in the same 422 and never as a 500.
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
    // the subscription, and a personal seat of the same person, which carries no owning department.
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

      const refused = await h
        .grant({ requestId: id, subscriptionId: foreign.id, accountIdentifier: 'ci-bot' })
        .expect(422);

      expect(h.codeOf(refused)).toBe(MISMATCH);
      expect(await rows()).toEqual(before);
      expect(await h.state(id)).toBe('AWAITING_EXECUTION');
    });

    it('grants the subscription of the department of the account, and the seat carries that department', async () => {
      const u = await unit();
      const own = await subscriptionOf(u.department.id);
      const id = await waiting(u, own.plan);

      await h.grant({ requestId: id, subscriptionId: own.id, accountIdentifier: 'ci-bot' }).expect(201);

      expect(await seatOf(id)).toEqual({ owning_department_id: u.department.id, subscription_id: own.id });
    });

    it('does not check a subscription nobody owns yet', async () => {
      const u = await unit();
      const ownerless = await subscriptionOf(h.seed.departmentId);
      await h.ctx.sql.query(`UPDATE subscriptions SET owner_department_id = NULL WHERE id = $1`, [ownerless.id]);
      const id = await waiting(u, ownerless.plan);

      await h.grant({ requestId: id, subscriptionId: ownerless.id, accountIdentifier: 'ci-bot' }).expect(201);

      expect(await seatOf(id)).toMatchObject({ owning_department_id: u.department.id, subscription_id: ownerless.id });
    });

    // The Prisma driver adapter hands the application the message and the code of a trigger's refusal, not its CONSTRAINT field: the
    // trigger of the final schema therefore names its constraint at the start of its message, and the mapper reads it there.
    it('answers 422, never 500, when only the trigger of the final schema refuses it (the guard of the service turned off)', async () => {
      const u = await unit();
      const guarded = await subscriptionOf(h.seed.departmentId);
      const id = await waiting(u, guarded.plan);
      await h.ctx.sql.query(`
        CREATE FUNCTION test_owner_department_guard() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.subscription_id IS NOT NULL AND NEW.owning_department_id IS NOT NULL
             AND NEW.owning_department_id IS DISTINCT FROM (SELECT owner_department_id FROM subscriptions WHERE id = NEW.subscription_id) THEN
            RAISE EXCEPTION 'license_assignments_owner_department_guard: the department of the seat is not the owner of the subscription'
              USING ERRCODE = '23514', CONSTRAINT = 'license_assignments_owner_department_guard';
          END IF;
          RETURN NEW;
        END $$`);
      await h.ctx.sql.query(`
        CREATE TRIGGER license_assignments_owner_department_guard BEFORE INSERT ON license_assignments
          FOR EACH ROW EXECUTE FUNCTION test_owner_department_guard()`);
      const before = await rows();
      try {
        jest.spyOn(policy, 'assertSubscriptionDepartment').mockImplementation(() => undefined);

        const refused = await h
          .grant({ requestId: id, subscriptionId: guarded.id, accountIdentifier: 'ci-bot' })
          .expect(422);

        expect(h.codeOf(refused)).toBe(MISMATCH);
        expect(await rows()).toEqual(before);
        expect(await h.state(id)).toBe('AWAITING_EXECUTION');
      } finally {
        await h.ctx.sql.query(`DROP TRIGGER license_assignments_owner_department_guard ON license_assignments`);
        await h.ctx.sql.query(`DROP FUNCTION test_owner_department_guard()`);
      }
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
