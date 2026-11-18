import { randomUUID } from 'node:crypto';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { MigrationPreflightRepo } from '../../../src/modules/installation/migration-preflight/migration-preflight.repo';
import { Department, Person, RequestHarness } from '../../support/request-harness';

const h = new RequestHarness();

/**
 * `qd93-remove-fallback-substitute-approvers`, Task 1 (M5, spec › Migration): the two rows of `--recovery-target` that this release
 * adds count what a runtime before it cannot read — a request or a line closed for the spending approver with nobody who closed it, and a
 * step that waits as `NO_DEPARTMENT_HEAD` or `SPENDING_APPROVER_IS_PARTY` — on the database as migrated, not on a mock of it.
 */
describe('ops:preflight --recovery-target counts the rows of QĐ-93 (integration, PostgreSQL)', () => {
  let department: Department;
  let person: Person;
  let planId: string;
  const repo = new MigrationPreflightRepo();

  const facts = () => h.ctx.app.get(TransactionRunner).run((tx) => repo.recoveryTargetFacts(tx));

  const insertRequest = async (over: Record<string, string | null>): Promise<string> => {
    const id = randomUUID();
    await h.ctx.sql.query(
      `INSERT INTO access_requests
         (id, organization_id, branch, state, plan_id, requester_employee_id, department_id, cost_center_id, business_reason,
          term_months, policy, created_by_app_user_id, cancelled_at, cancel_cause, cancelled_by_employee_id)
       VALUES ($1, $2, 'INTERNAL_FREE', $3::"AccessRequestState", $4, $5, $6, $7, 'Design', 6, '{"version":1}'::jsonb, $8,
               $9::timestamptz, $10::"AccessRequestCancelCause", $11)`,
      [
        id,
        h.seed.organizationId,
        over.state ?? 'PENDING',
        planId,
        person.employeeId,
        department.id,
        department.unitId,
        randomUUID(),
        over.cancelledAt ?? null,
        over.cause ?? null,
        over.closer ?? null,
      ],
    );

    return id;
  };

  beforeAll(async () => {
    await h.start();
    department = await h.departmentWithUnit('P-RTF');
    person = await h.staff(department, 'RTF-E1');
    planId = await h.plan('K5');
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('counts a request closed for the spending approver, and a step that waits for a head, and nothing else', async () => {
    const before = await facts();
    expect(before.rows['access-request-cancel-spending-approver-party']).toBe(0);
    expect(before.rows['access-request-step-qd93-waiting-reason']).toBe(0);

    // A request closed for another cause is not this representation, and neither is a step waiting for another reason.
    await insertRequest({
      state: 'CANCELLED',
      cancelledAt: new Date().toISOString(),
      cause: 'BENEFICIARY_LEFT',
      closer: person.employeeId,
    });
    const waiting = await insertRequest({});
    await h.ctx.sql.query(
      `INSERT INTO access_request_steps (id, kind, request_id, sequence, state, routing_row, waiting_reason, sla_working_days)
       VALUES (gen_random_uuid(), 'NEED', $1, 1, 'WAITING', 8, 'NO_SPENDING_APPROVER', 2)`,
      [waiting],
    );
    expect((await facts()).rows['access-request-step-qd93-waiting-reason']).toBe(0);

    await insertRequest({
      state: 'CANCELLED',
      cancelledAt: new Date().toISOString(),
      cause: 'SPENDING_APPROVER_PARTY',
    });
    const headless = await insertRequest({});
    await h.ctx.sql.query(
      `INSERT INTO access_request_steps (id, kind, request_id, sequence, state, routing_row, waiting_reason, sla_working_days)
       VALUES (gen_random_uuid(), 'NEED', $1, 1, 'WAITING', 4, 'NO_DEPARTMENT_HEAD', 2)`,
      [headless],
    );

    const after = await facts();
    expect(after.migrated).toBe(true);
    expect(after.rows['access-request-cancel-spending-approver-party']).toBe(1);
    expect(after.rows['access-request-step-qd93-waiting-reason']).toBe(1);
  });
});
