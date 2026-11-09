import request from 'supertest';
import { ServiceAccountHarness } from '../../support/service-account-harness';
import type { Unit } from '../../support/spend-harness';

const h = new ServiceAccountHarness();
const M = 1_000_000;

/**
 * `g0-g6-final-business-baseline-remediation` Tasks 3.2a and 3.2 (F20, `QĐ-89a`, spec K and L.10) as `BR-MF1-09` / `QĐ-103d` changed them
 * (rewritten, the cases are kept with their new expectation): the seats of a subscription are one pool for every department, so a seat does
 * not have to sit on a subscription of its own department. Before, the service refused another department's subscription with 422
 * `LICENSE_ASSIGNMENT.SUBSCRIPTION_DEPARTMENT_MISMATCH` before it wrote, a baseline file row that broke it was an `ERROR` of the same code, and
 * the trigger `license_assignments_owner_department_guard` answered the same in 422. Now the grant of another department's subscription is
 * 201, the file row is valid, and the trigger no longer exists (migration `shared_pool_grant`).
 */
describe('a seat sits on a subscription of any department (integration, real PostgreSQL)', () => {
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
   * The grant as the route takes it: the subscription goes to the service as it is sent, whichever department owns it.
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
    // the subscription, and a personal seat of a person of another department, which is written with the department of the person.
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
    it('grants the subscription of another department with 201 (it was 422 SUBSCRIPTION_DEPARTMENT_MISMATCH): the seat carries the department of the account', async () => {
      const u = await unit();
      const id = await waiting(u, foreign.plan);
      const before = await rows();

      await grant({ requestId: id, subscriptionId: foreign.id, accountIdentifier: 'ci-bot' }).expect(201);

      const after = await rows();
      expect(after).toEqual({ assignments: before.assignments + 1, tasks: before.tasks + 1 });
      // The subscription is the seeded department's; the account is the unit's: the seat is the account's department's.
      expect(await seatOf(id)).toEqual({ owning_department_id: u.department.id, subscription_id: foreign.id });
    });

    it('grants the subscription of the department of the account, and the seat carries that department', async () => {
      const u = await unit();
      const own = await subscriptionOf(u.department.id);
      const id = await waiting(u, own.plan);

      await grant({ requestId: id, subscriptionId: own.id, accountIdentifier: 'ci-bot' }).expect(201);

      expect(await seatOf(id)).toEqual({ owning_department_id: u.department.id, subscription_id: own.id });
    });

    it('has no trigger of the owner department any more: the database does not refuse the seat of another department', async () => {
      const { rows: triggers } = await h.ctx.sql.query<{ tgname: string }>(
        `SELECT tgname FROM pg_trigger WHERE tgname = 'license_assignments_owner_department_guard'`,
      );

      expect(triggers).toEqual([]);
    });
  });

  describe('the file of a seat baseline', () => {
    it('accepts the service row of another department and the personal row of a person of another department (they were an ERROR); nothing is written by a preview', () => {
      expect(imported.preview.summary).toMatchObject({ totalRows: 2, valid: 2, errors: 0 });
      expect(imported.assignmentsAfter).toBe(0);
    });
  });
});
