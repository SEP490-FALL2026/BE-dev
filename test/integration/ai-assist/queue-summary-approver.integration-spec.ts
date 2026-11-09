import { CatalogApi } from '../../../src/modules/catalog/public/catalog.api';
import { AiSummaryHarness, type FullStepRow, type SummaryWire } from '../../support/ai-summary-harness';
import { type RecordedCall, faithfulAnswer } from '../../support/fake-ai-service';
import type { AccessRequestWire } from '../../support/request-harness';
import type { Unit } from '../../support/spend-harness';

const h = new AiSummaryHarness();
const M = 1_000_000;
const RENEWAL_OPINION = 'Gia hạn gói thiết kế của phòng trong năm tới';

interface QueueItem {
  requestId: string;
  stepId: string;
  amount: { amount: string; currency: string } | null;
}

/**
 * The AI summary of the queue of the spending approver C1 (`US-15-05` AC-8, AC-13, AC-14, AC-15) over the whole application, real
 * PostgreSQL and a local stand-in of the AI service over real HTTP. C1 holds the spend step of R9 (sent by the head H1 for
 * themselves: one step, no need step — MF1-D, QĐ-104), of R10 (branch (b), in the catalog, 21 million) and of R11 (branch (c), software
 * assessed by the IT Admin); R1 waits for H1 and R12 for the assessment of the IT Admin. The budget of the Cost Center of R10 is the example of
 * `US-06-01` AC-1: 100 million, 40 spent, 20 held, 40 left.
 */
describe('the AI summary of the queue of the spending approver (integration, real HTTP to a stand-in AI service, real PostgreSQL)', () => {
  let plan: string;
  let internal: string;
  let design: Unit;
  let engineering: Unit;
  let r1: AccessRequestWire;
  let r9: AccessRequestWire;
  let r10: string;
  let r11: string;
  let r12: AccessRequestWire;
  let invalid: SummaryWire;
  let view: SummaryWire;
  let call: RecordedCall;
  let stepsBefore: FullStepRow[];
  let renewal: { renewalId: string; subscriptionId: string };

  const allIds = () => [r1.id, r9.id, r10, r11, r12.id];
  const spendQueue = async (): Promise<QueueItem[]> =>
    h.dataOf<{ items: QueueItem[] }>(await h.approvals(h.boss.account, { pageSize: 100 }).expect(200)).items;
  const pendingSpendStep = async (requestId: string): Promise<string> =>
    (
      await h.ctx.sql.query<{ id: string }>(
        `SELECT id FROM access_request_steps WHERE request_id = $1 AND kind = 'SPEND_APPROVAL' AND state = 'PENDING'`,
        [requestId],
      )
    ).rows[0].id;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    await h.switchAll('ON');
    plan = await h.planOf(await h.subscription(100));
    internal = await h.plan('K5');
    design = await h.unit('P-DES');
    engineering = await h.unit('P-ENG');
    const it = { employeeId: h.it1.employeeId, account: h.it1 };
    await h.setItAdminInCharge(design.department, it);
    await h.budgetFor(design, { total: 100 * M, held: 20 * M, spent: 40 * M });
    await h.budgetFor(engineering, { total: 100 * M });

    r1 = await h.sent(design.member, internal, { businessReason: 'Nhân viên cần công cụ ghi chú' });
    r9 = await h.sent(design.head, plan, { businessReason: 'Trưởng phòng cần công cụ thiết kế' });
    // The amount of the request is the months left of the year, which depends on the day the suite runs: it is written, so that it is within the base once R10 waits (40 - 21 = 19 million left): its spend step goes straight to C1 (BR-MF1-06g).
    await h.setPayments(r9.id, { amount: 15 * M });
    r10 = await h.waitingForApprover(design, plan, { amount: 21 * M });
    r11 = await h.staleRequest(engineering, 10 * M);
    await h.ctx.sql.query(
      `UPDATE access_request_assessments SET quote_valid_until = current_date + 30 WHERE request_id = $1`,
      [r11],
    );
    await h.sendOn([r11], engineering.head.account).expect(201);
    r12 = await h.proposed(design.member, { softwareName: 'Loom' });
    await h.decide(r12.id, { decision: 'APPROVE' }, design.head.account).expect(200);
    // S1 of AC-13: a renewal of a subscription that waits for the decision of C1, which is no Access Request.
    renewal = await h.proposedRenewal(design.department.id, RENEWAL_OPINION);
    stepsBefore = await h.stepRows(allIds());

    // First a model that writes figures of its own on every line: nothing is shown and the call is not kept for the revision.
    h.ai.reply((received) =>
      faithfulAnswer(received, (item, line) => {
        if (item.sourceRef === 'R001') return [{ ...line, summary: `${line.summary} Ngân sách còn 40 triệu.` }];
        if (item.sourceRef === 'R002')
          return [{ ...line, summary: line.summary.replace('{{cost:C002}}', '21 triệu đồng') }];

        return [{ ...line, summary: line.summary.replace('{{cost:C003}}', '10000000 VND') }];
      }),
    );
    invalid = await h.summarize(h.boss.account);
    h.ai.reset();
    view = await h.summarize(h.boss.account);
    [call] = h.ai.accepted();
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  it('a model that writes a cost or a budget figure itself has every such line dropped: NO_VALID_OUTPUT, which is not kept', async () => {
    expect(invalid).toMatchObject({ status: 'NO_VALID_OUTPUT', errorCode: 'AI.NO_VALID_OUTPUT', lines: [] });
    const content = h.dataOf<{ result: { rejections: unknown[] } }>(await h.content(invalid.invocationId).expect(200));
    expect(content.result.rejections).toEqual([
      { code: 'INVENTED_NUMBER', sourceRef: 'R001' },
      { code: 'INVENTED_NUMBER', sourceRef: 'R002' },
      { code: 'INVENTED_NUMBER', sourceRef: 'R003' },
    ]);
    // The same revision asked again was a new call, answered by the faithful model.
    expect(view.invocationId).not.toBe(invalid.invocationId);
  });

  it('AC-8: exactly 3 lines, R9 (one step, MF1-D), R10 and R11 spend steps, each opening its own step; nothing of R1 or R12', async () => {
    expect(view).toMatchObject({ status: 'COMPLETED', omittedCount: 0, sourceStale: false });
    expect(view.lines.map((line) => [line.requestId, line.stepKind])).toEqual([
      [r9.id, 'SPEND_APPROVAL'],
      [r10, 'SPEND_APPROVAL'],
      [r11, 'SPEND_APPROVAL'],
    ]);
    // The request of a head for themselves has no need step (MF1-D): it is the spending approver's spend step from the start.
    const own = h.dataOf<{ request: AccessRequestWire }>(await h.fetch(r9.id, h.boss.account).expect(200)).request;
    expect(own.needStep).toMatchObject({ state: 'NOT_REQUIRED' });
    for (const line of view.lines) {
      const detail = h.dataOf<{
        spendApproval: { requestId: string; step: { id: string; assignee: { employeeId: string } } };
      }>(await h.approvalOf(line.requestId, h.boss.account).expect(200)).spendApproval;
      expect(detail).toMatchObject({
        requestId: line.requestId,
        step: { id: line.stepId, assignee: { employeeId: h.boss.employeeId } },
      });
    }
    for (const text of [JSON.stringify(view), call.raw]) {
      for (const absent of [r1.id, r12.id, r1.businessReason, 'Loom']) expect(text).not.toContain(absent);
    }
    expect(await h.stepRows(allIds())).toEqual(stepsBefore);
  });

  it('AC-11, AC-15: sends the allow-listed fields with a reference for each cost, never an amount or a figure of a budget', async () => {
    const [{ applicationName }] = await h.ctx.app.get(CatalogApi, { strict: false }).getPlanSummaries([plan]);
    const names = await Promise.all(
      [design.head, design.member, engineering.member].map((p) => h.fullNameOf(p.employeeId)),
    );

    expect(call.body.context.requests).toEqual([
      {
        sourceRef: 'R001',
        stepKind: 'SPEND_APPROVAL',
        softwareName: applicationName,
        beneficiaryDisplayName: names[0],
        reason: r9.businessReason,
        // A request carries an end date now, not months (`QĐ-104a`): the AI source has no duration in months to give.
        requestedDurationLabel: null,
        estimatedCostRef: 'C001',
      },
      {
        sourceRef: 'R002',
        stepKind: 'SPEND_APPROVAL',
        softwareName: applicationName,
        beneficiaryDisplayName: names[1],
        reason: expect.any(String) as string,
        requestedDurationLabel: null,
        estimatedCostRef: 'C002',
      },
      {
        sourceRef: 'R003',
        stepKind: 'SPEND_APPROVAL',
        softwareName: 'Miro',
        beneficiaryDisplayName: names[2],
        reason: expect.any(String) as string,
        requestedDurationLabel: null,
        estimatedCostRef: 'C003',
      },
    ]);
    for (const figure of ['100000000', '40000000', '20000000', '21000000', '15000000', '10000000']) {
      expect(call.raw).not.toContain(figure);
    }
    expect(call.raw).not.toMatch(/budget|amount|currency|VND|remaining|pending|held|spent/i);
  });

  it('AC-15: the line of R10 carries the cost of the backend, 21 million as the step shows it, and no figure of the budget', async () => {
    const queued = (await spendQueue()).find((item) => item.requestId === r10);
    const line = view.lines.find((one) => one.requestId === r10);

    expect(queued?.amount).toEqual({ amount: String(21 * M), currency: 'VND' });
    expect(line?.summary).toContain(`Chi phí ước tính ${String(21 * M)} VND.`);
    const numbers = line?.summary.match(/\d+/g) ?? [];
    for (const figure of ['100000000', '40000000', '20000000']) expect(numbers).not.toContain(figure);
    // The snapshot is still all there when C1 opens R10 (US-06-01).
    const years = h.dataOf<{ items: Array<Record<string, { amount: string }>> }>(
      await h.checkYears(r10, h.boss.account).expect(200),
    ).items;
    expect(years[0]).toMatchObject({
      budget: { amount: String(100 * M) },
      held: { amount: String(20 * M) },
      spent: { amount: String(40 * M) },
    });
    // MF1-B (RV-10, M-05): R9 waits for C1's spend decision (one step), so what it costs this year is pending and comes off what is left:
    // 100 - 40 spent - 20 held - pending. Its amount is the months left of the year at its check, which depends on the day the suite runs.
    const pending = Number(years[0].pending.amount);
    expect(pending).toBeGreaterThan(0);
    expect(years[0].remaining).toEqual({ amount: String(40 * M - pending), currency: 'VND' });
  });

  it('AC-13: a renewal waiting for its decision stays out of the summary of C1, who no longer reads renewals (QĐ-101, step 13)', async () => {
    // The head of the owning department confirms a renewal now, not the spending approver: C1 is refused the renewal queue.
    expect(h.codeOf(await h.renewalQueue(h.boss.account).expect(403))).toBe('SUBSCRIPTION_RENEWAL.READ_FORBIDDEN');
    const waiting = (
      await h.ctx.sql.query<{ id: string }>(
        `SELECT id FROM subscription_renewals WHERE id = $1 AND state = 'PROPOSED'`,
        [renewal.renewalId],
      )
    ).rows;
    const subscription = (
      await h.ctx.sql.query<{ name: string }>(
        `SELECT a.name FROM subscriptions s JOIN plans p ON p.id = s.plan_id JOIN applications a ON a.id = p.application_id
          WHERE s.id = $1`,
        [renewal.subscriptionId],
      )
    ).rows[0];

    expect(waiting).toHaveLength(1);
    // The three Access Request lines of AC-8 and nothing else, though the renewal waited for C1 when the summary was made.
    expect(view.lines.map((line) => line.requestId)).toEqual([r9.id, r10, r11]);
    expect(call.body.context.requests).toHaveLength(3);
    for (const text of [call.raw, JSON.stringify(view)]) {
      for (const absent of [renewal.renewalId, renewal.subscriptionId, RENEWAL_OPINION, subscription.name]) {
        expect(text).not.toContain(absent);
      }
      expect(text).not.toMatch(/renew|gia hạn/i);
    }
  });

  it('AC-9, AC-13: the IT Admin who holds the assessment of R12 and the head H1 holding R1 see nothing of the approver', async () => {
    expect(await h.steps(r12.id, 'IT_ASSESSMENT')).toEqual([
      expect.objectContaining({ state: 'PENDING', assignee_employee_id: h.it1.employeeId }),
    ]);
    const revision = await h.revisionOf(h.it1);
    expect(h.codeOf(await h.ask(h.it1, revision).expect(403))).toBe('AI.NO_ASSIGNED_STEPS');
    expect(h.codeOf(await h.read(design.head.account, view.invocationId).expect(404))).toBe('AI.NOT_FOUND');
  });

  it('AC-5: C1 approves R10 by hand; the approval record names C1, not the AI, and R10 leaves the summary', async () => {
    const step = await pendingSpendStep(r10);

    await h.decideSpend(r10, { decision: 'APPROVE' }, h.boss.account).expect(200);

    const records = await h.ctx.sql.query<{ decided_by_employee_id: string }>(
      `SELECT decided_by_employee_id FROM approval_records WHERE step_id = $1`,
      [step],
    );
    expect(records.rows).toEqual([{ decided_by_employee_id: h.boss.employeeId }]);
    const reread = h.dataOf<SummaryWire>(await h.read(h.boss.account, view.invocationId).expect(200));
    expect(reread.lines.map((line) => line.requestId)).toEqual([r9.id, r11]);
    expect(reread.sourceStale).toBe(true);
  });

  it('AC-14, MF1-D: R9 has no need step for C1 to approve; its spend step is C1s from the start (no review of Finance), and a new summary shows it with R11', async () => {
    h.ai.reset();
    expect(await h.steps(r9.id, 'NEED')).toEqual([expect.objectContaining({ state: 'NOT_REQUIRED' })]);
    // Finance has no step of any request (QĐ-97c): it has nothing a summary reads.
    expect(h.codeOf(await h.ask(h.finance, await h.revisionOf(h.finance)).expect(403))).toBe('AI.NO_ASSIGNED_STEPS');
    expect(await h.steps(r9.id, 'SPEND_APPROVAL')).toEqual([
      expect.objectContaining({ state: 'PENDING', assignee_employee_id: h.boss.employeeId }),
    ]);

    const again = await h.summarize(h.boss.account);

    expect(again.lines.map((line) => [line.requestId, line.stepKind])).toEqual([
      [r9.id, 'SPEND_APPROVAL'],
      [r11, 'SPEND_APPROVAL'],
    ]);
    expect(h.ai.accepted()).toHaveLength(1);
  });
});
