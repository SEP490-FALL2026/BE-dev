import request from 'supertest';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import type { SystemActor } from '../../../src/modules/licensing/public/licensing.types';
import { RequestsApi } from '../../../src/modules/requests/public/requests.api';
import type { BeneficiaryGoneInput } from '../../../src/modules/requests/public/requests.types';
import { ReturnHarness } from '../../support/return-harness';
import type { Person } from '../../support/request-harness';
import type { Unit } from '../../support/spend-harness';

const h = new ReturnHarness();
const M = 1_000_000;
const SYSTEM: SystemActor = { kind: 'SYSTEM', correlationId: 'beneficiary-gone:renewal-test' };

/**
 * `QĐ-110d`: a request to go on using a right that was approved waits in `AWAITING_EXECUTION` with the task that extends the right
 * already open (`EXTEND`, opened at approval, `BR-MF1-08d`). The system must not cancel the request under that task: the commitment would go
 * back while the task stays alive, and the IT Admin who completes it would extend the right at the vendor with nothing held for it. So it is
 * left to the IT Admin, who closes it by hand with the route that cancels the task with the request.
 */
describe('a renewal approved and waiting for its extension, when the person is gone (integration, real PostgreSQL)', () => {
  let paid: { subscriptionId: string; planId: string };
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    const subscriptionId = await h.subscription(20, 'K2');
    paid = { subscriptionId, planId: await h.planOf(subscriptionId) };
    await h
      .declareTaxProfile((await h.vendorOf(paid.planId)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const run = (input: BeneficiaryGoneInput) =>
    h.ctx.app
      .get(TransactionRunner, { strict: false })
      .run((tx) => h.ctx.app.get(RequestsApi, { strict: false }).cancelForBeneficiaryGone(tx, SYSTEM, input));
  /** An approved paid renewal of the seat of the member: the approval opened the task that extends the right. */
  const approvedRenewal = async (): Promise<{ unit: Unit; member: Person; requestId: string; taskId: string }> => {
    counter += 1;
    const unit = await h.departmentWithHead(`P-GR${counter}`);
    await h.budgetFor(unit, { total: 100 * M });
    await h.setItAdminInCharge(unit.department, { employeeId: h.it1.employeeId, account: h.it1 });
    const assignmentId = await h.seatOf(unit.member, paid, { expectedEndDate: h.inDays(5) });
    const { request: renewal } = await h.renewed(unit.member.account, {
      assignmentId,
      extensionMonths: 11,
      businessReason: 'The work goes on',
    });
    await h.decide(renewal.id, { decision: 'APPROVE' }, unit.head.account).expect(200);
    await h.setPayments(renewal.id, { amount: 5 * M });
    await h.sendOn([renewal.id], unit.head.account).expect(201);
    await h.decideSpend(renewal.id, { decision: 'APPROVE' }, h.boss.account).expect(200);
    const [extension] = (
      await h.ctx.sql.query<{ id: string }>(
        `SELECT id FROM provisioning_tasks WHERE request_id = $1 AND kind = 'EXTEND'`,
        [renewal.id],
      )
    ).rows;

    return { unit, member: unit.member, requestId: renewal.id, taskId: extension.id };
  };
  const stateOf = async (id: string) =>
    (await h.ctx.sql.query<{ state: string }>(`SELECT state::text FROM access_requests WHERE id = $1`, [id])).rows[0]
      .state;
  const taskStatus = async (id: string) =>
    (await h.ctx.sql.query<{ status: string }>(`SELECT status::text FROM provisioning_tasks WHERE id = $1`, [id]))
      .rows[0].status;
  const commitment = async (requestId: string) =>
    (
      await h.ctx.sql.query<{ amount_minor: string; released_minor: string }>(
        `SELECT amount_minor::text, released_minor::text FROM budget_commitments WHERE request_id = $1`,
        [requestId],
      )
    ).rows[0];

  it('leaves the request, its extension task and its commitment as they are, and tells the IT Admin in charge, for a person who left', async () => {
    const { member, requestId, taskId } = await approvedRenewal();
    expect(await stateOf(requestId)).toBe('AWAITING_EXECUTION');
    const held = await commitment(requestId);
    expect(held).toBeDefined();

    const result = await run({ employeeId: member.employeeId, scope: { kind: 'ALL_OPEN' } });
    await run({ employeeId: member.employeeId, scope: { kind: 'ALL_OPEN' } });

    expect(result).toEqual({ cancelled: [], needsItCheck: [{ requestId, line: false }] });
    expect(await stateOf(requestId)).toBe('AWAITING_EXECUTION');
    expect(await taskStatus(taskId)).not.toBe('CANCELLED');
    expect(await commitment(requestId)).toEqual(held);
    const notices = (
      await h.ctx.sql.query<{ recipient_employee_id: string; code: string }>(
        `SELECT recipient_employee_id, code FROM in_app_notifications WHERE subject_id = $1 AND code = 'REQUEST_BENEFICIARY_GONE_IT_CHECK'`,
        [requestId],
      )
    ).rows;
    expect(notices).toEqual([{ recipient_employee_id: h.it1.employeeId, code: 'REQUEST_BENEFICIARY_GONE_IT_CHECK' }]);
  });

  it('does the same for a person who was moved, for the renewal sent from the old department', async () => {
    const { unit, member, requestId, taskId } = await approvedRenewal();

    const result = await run({
      employeeId: member.employeeId,
      scope: { kind: 'PAID_OLD_DEPARTMENT', oldDepartmentId: unit.department.id },
    });

    expect(result).toEqual({ cancelled: [], needsItCheck: [{ requestId, line: false }] });
    expect(await stateOf(requestId)).toBe('AWAITING_EXECUTION');
    expect(await taskStatus(taskId)).not.toBe('CANCELLED');
  });

  it('is closed by the IT Admin by hand, which cancels the extension task with the request and gives the commitment back: nothing is left alive', async () => {
    const { member, requestId, taskId } = await approvedRenewal();
    await run({ employeeId: member.employeeId, scope: { kind: 'ALL_OPEN' } });
    await h.ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [member.employeeId]);

    await request(h.server())
      .post(`/api/v1/access-requests/${requestId}/cancellation`)
      .set(h.as(h.it1))
      .send({ cause: 'BENEFICIARY_LEFT' })
      .expect(200);

    expect(await stateOf(requestId)).toBe('CANCELLED');
    expect(await taskStatus(taskId)).toBe('CANCELLED');
    expect((await commitment(requestId)).released_minor).toBe((await commitment(requestId)).amount_minor);
  });
});
