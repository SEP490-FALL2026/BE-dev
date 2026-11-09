import { ReassignmentHarness } from '../../support/reassignment-harness';
import { OneStepConversionService } from '../../../src/modules/requests/reassignment/one-step-conversion.service';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import type { AccessRequestWire } from '../../support/request-harness';
const h = new ReassignmentHarness();
describe('BR-MF1-02: lost-head conversion has a marking phase and a finishing phase', () => {
  let plan: string;
  beforeAll(async () => { await h.start(); await h.withApprover(); plan = await h.planOf(await h.subscription(50)); }, 240000);
  afterAll(async () => h.stop());
  it('marks without checking; sweep completes with the same standard check and persists a blocked result', async () => {
    const u = await h.departmentWithHead('P-CONV');
    const sent = await h.sent(u.member, plan);
    const originalChecks = (await h.ctx.sql.query(`SELECT 1 FROM request_budget_checks WHERE request_id=$1`, [sent.id])).rows.length;
    await h.ctx.sql.query(`UPDATE department_head_periods SET valid_to = CURRENT_DATE WHERE department_id=$1`, [u.department.id]);
    const service = h.ctx.app.get(OneStepConversionService, { strict: false });
    await h.ctx.app.get(TransactionRunner, { strict: false }).run((tx) => service.markForDepartment(tx, u.department.id, new Date()));
    expect((await h.ctx.sql.query(`SELECT routing_mode, one_step_reason, state FROM access_requests WHERE id=$1`, [sent.id])).rows).toEqual([{ routing_mode: 'ONE_STEP', one_step_reason: 'HEAD_LEFT', state: 'PENDING' }]);
    expect((await h.ctx.sql.query(`SELECT 1 FROM request_budget_checks WHERE request_id=$1`, [sent.id])).rows).toHaveLength(originalChecks);
    const result = await h.sweep(); expect(result.oneStepFinished).toBeGreaterThanOrEqual(1);
    const final = h.dataOf<{ request: AccessRequestWire }>(await h.fetch(sent.id, u.member.account).expect(200)).request;
    expect(final.state).toBe('AWAITING_REQUESTER_REVISION');
    expect(final.spend?.blockedReasons).toEqual(['NO_APPROVED_BUDGET']);
    expect((await h.sweep()).oneStepFinished).toBe(0);
  });
  it('Q-33: existing internal request remains controlled waiting when head leaves', async () => {
    const u = await h.departmentWithHead('P-CONVFREE'); const sent = await h.sent(u.member, await h.plan('K5'));
    await h.ctx.sql.query(`UPDATE department_head_periods SET valid_to=CURRENT_DATE WHERE department_id=$1`, [u.department.id]);
    await h.sweep();
    const final = h.dataOf<{ request: AccessRequestWire }>(await h.fetch(sent.id, u.member.account).expect(200)).request;
    expect(final.routing.mode).toBe('VIA_HEAD'); expect(final.state).toBe('WAITING_CONTROLLED'); expect(final.needStep.waitingReason).toBe('NO_DEPARTMENT_HEAD');
  });
});
