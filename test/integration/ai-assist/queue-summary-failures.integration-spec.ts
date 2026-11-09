import request from 'supertest';
import type { ApiAccount } from '../../support/api-accounts';
import { AI_SWITCHES, AiSummaryHarness, type FullStepRow, type SummaryWire } from '../../support/ai-summary-harness';
import { type FakeReply, faithfulAnswer } from '../../support/fake-ai-service';
import type { AccessRequestWire } from '../../support/request-harness';
import type { Unit } from '../../support/spend-harness';

/** The deadline of one call to the AI service, its retry included: long enough for the retry of a 503 after two seconds. */
const h = new AiSummaryHarness(8_000);
const M = 1_000_000;

/**
 * `US-15-05` AC-6 and the switches over the whole application, real PostgreSQL and a local stand-in of the AI service over real
 * HTTP: with the AI switched off nothing is sent and the routes answer 403; with the service down, slow, busy or answering
 * something that is not the contract, the call ends FAILED (or NO_VALID_OUTPUT) with a stable code, read with 200, never a 500. In
 * every case no step changes — state, holder, the time it was given, its SLA — and the head and the spending approver decide by
 * hand as before.
 */
describe('the AI summary when the AI is off or failing (integration, real HTTP to a stand-in AI service, real PostgreSQL)', () => {
  let internal: string;
  let plan: string;
  let design: Unit;
  let r1: AccessRequestWire;
  let r2: AccessRequestWire;
  let spend: string;
  let stepsBefore: FullStepRow[];
  let needQueueBefore: unknown[];
  let spendQueueBefore: unknown[];

  const ids = () => [r1.id, r2.id, spend];
  const needQueue = async (account: ApiAccount) =>
    h.dataOf<{ items: unknown[] }>(
      await request(h.server()).get('/api/v1/need-decisions').query({ pageSize: 100 }).set(h.as(account)).expect(200),
    ).items;
  const spendQueue = async () =>
    h.dataOf<{ items: unknown[] }>(await h.approvals(h.boss.account, { pageSize: 100 }).expect(200)).items;
  /** Nothing of the queues read by hand changed: the steps as the database keeps them and the two queues as their owners read them. */
  const expectQueuesUnchanged = async () => {
    expect(await h.stepRows(ids())).toEqual(stepsBefore);
    expect(await needQueue(design.head.account)).toEqual(needQueueBefore);
    expect(await spendQueue()).toEqual(spendQueueBefore);
  };
  /** Asks for a summary and reads it once its run has ended; the asking is 202 and the reading 200, whatever the AI service did. */
  const summarizeFailing = async (account: ApiAccount): Promise<SummaryWire> => h.summarize(account);

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    internal = await h.plan('K5');
    plan = await h.planOf(await h.subscription(100));
    design = await h.unit('P-DES');
    await h.budgetFor(design, { total: 100 * M });
    r1 = await h.sent(design.member, internal, { businessReason: 'Cần công cụ ghi chú' });
    r2 = await h.sent(design.member, internal, { businessReason: 'Cần công cụ vẽ sơ đồ' });
    spend = await h.waitingForApprover(design, plan, { amount: 5 * M });
    stepsBefore = await h.stepRows(ids());
    needQueueBefore = await needQueue(design.head.account);
    spendQueueBefore = await spendQueue();
  }, 300000);

  beforeEach(() => {
    h.ai.reset();
  });

  afterAll(async () => {
    await h.stop();
  });

  describe('switched off', () => {
    it('both switches start OFF: the source and the asking are 403 AI.DISABLED, nothing is written or sent', async () => {
      for (const account of [design.head.account, h.boss.account]) {
        expect(h.codeOf(await h.source(account).expect(403))).toBe('AI.DISABLED');
        expect(h.codeOf(await h.ask(account, 'a'.repeat(64)).expect(403))).toBe('AI.DISABLED');
      }
      await h.settled();

      expect(h.ai.calls).toHaveLength(0);
      expect(await h.invocationCount()).toBe(0);
      await expectQueuesUnchanged();
    });

    it('one switch ON is not enough: each one alone still answers 403 AI.DISABLED with no call', async () => {
      for (const key of AI_SWITCHES) {
        await h.setSwitch(key, 'ON').expect(200);
        expect(h.codeOf(await h.source(design.head.account).expect(403))).toBe('AI.DISABLED');
        expect(h.codeOf(await h.ask(design.head.account, 'a'.repeat(64)).expect(403))).toBe('AI.DISABLED');
        await h.setSwitch(key, 'OFF').expect(200);
      }
      await h.settled();

      expect(h.ai.calls).toHaveLength(0);
      expect(await h.invocationCount()).toBe(0);
    });
  });

  describe('the AI service failing (AC-6)', () => {
    beforeAll(async () => {
      await h.switchAll('ON');
    });

    const cases: Array<{ name: string; reply: FakeReply; status: string; errorCode: string; calls: number }> = [
      {
        name: 'down (the connection is dropped)',
        reply: { kind: 'reset' },
        status: 'FAILED',
        errorCode: 'AI.PROVIDER_UNAVAILABLE',
        calls: 2,
      },
      {
        name: 'slow (no answer before the deadline)',
        reply: { kind: 'hang' },
        status: 'FAILED',
        errorCode: 'AI.PROVIDER_TIMEOUT',
        calls: 1,
      },
      {
        name: 'loading (503 MODEL_LOADING, then again)',
        reply: { kind: 'status', status: 503, code: 'MODEL_LOADING' },
        status: 'FAILED',
        errorCode: 'AI.PROVIDER_UNAVAILABLE',
        calls: 2,
      },
      {
        name: 'out of quota or busy (429 BUSY, then again)',
        reply: { kind: 'status', status: 429, code: 'BUSY' },
        status: 'FAILED',
        errorCode: 'AI.PROVIDER_UNAVAILABLE',
        calls: 2,
      },
      {
        name: 'timed out on its side (504 MODEL_TIMEOUT)',
        reply: { kind: 'status', status: 504, code: 'MODEL_TIMEOUT' },
        status: 'FAILED',
        errorCode: 'AI.PROVIDER_TIMEOUT',
        calls: 1,
      },
      {
        name: 'refusing the token of the backend (401 UNAUTHORIZED)',
        reply: { kind: 'status', status: 401, code: 'UNAUTHORIZED' },
        status: 'FAILED',
        errorCode: 'AI.PROVIDER_UNAVAILABLE',
        calls: 1,
      },
      {
        name: 'answering a body that is not JSON',
        reply: { kind: 'body', status: 200, body: '<html>oops</html>' },
        status: 'FAILED',
        errorCode: 'AI.OUTPUT_INVALID',
        calls: 1,
      },
      {
        name: 'answering JSON outside the contract',
        reply: { kind: 'body', status: 200, body: JSON.stringify({ items: [] }) },
        status: 'FAILED',
        errorCode: 'AI.OUTPUT_INVALID',
        calls: 1,
      },
      {
        name: 'saying the model output could not be parsed (parseStatus INVALID_JSON)',
        reply: { kind: 'answer', items: null, parseStatus: 'INVALID_JSON' },
        status: 'FAILED',
        errorCode: 'AI.OUTPUT_INVALID',
        calls: 1,
      },
    ];

    it.each(cases)('$name: $status $errorCode read with 200, no line, the queues unchanged', async (scenario) => {
      h.ai.reply(() => scenario.reply);

      const view = await summarizeFailing(design.head.account);

      expect(view).toMatchObject({
        status: scenario.status,
        errorCode: scenario.errorCode,
        lines: [],
        omittedCount: 0,
      });
      expect(h.ai.calls.filter((call) => call.authorized)).toHaveLength(scenario.calls);
      expect(await h.invocationRow(view.invocationId)).toMatchObject({
        status: scenario.status,
        error_code: scenario.errorCode,
      });
      await expectQueuesUnchanged();
      // What is recorded of the failure names no token and no address of the AI service.
      const recorded = JSON.stringify(await h.aiEvents(view.invocationId)) + JSON.stringify(view);
      expect(recorded).not.toContain(h.ai.token);
      expect(recorded).not.toContain('127.0.0.1');
    });

    it('every line rejected by the checks: NO_VALID_OUTPUT with AI.NO_VALID_OUTPUT, and the queues unchanged', async () => {
      h.ai.reply((call) =>
        faithfulAnswer(call, (_item, line) => [{ ...line, summary: `${line.summary} Nên duyệt ngay.` }]),
      );

      const view = await summarizeFailing(design.head.account);

      expect(view).toMatchObject({ status: 'NO_VALID_OUTPUT', errorCode: 'AI.NO_VALID_OUTPUT', lines: [] });
      await expectQueuesUnchanged();
    });

    it('the spending approver C1 under a service that is down: FAILED, and the spend queue unchanged', async () => {
      h.ai.reply(() => ({ kind: 'reset' }));

      const view = await summarizeFailing(h.boss.account);

      expect(view).toMatchObject({ status: 'FAILED', errorCode: 'AI.PROVIDER_UNAVAILABLE', lines: [] });
      await expectQueuesUnchanged();
    });

    it('a run held RUNNING for more than 150 seconds reads as FAILED AI.PROVIDER_TIMEOUT; its late COMPLETED end changes nothing', async () => {
      h.ai.reply(() => ({ kind: 'hang' }));
      const revision = await h.revisionOf(design.head.account);
      const received = h.ai.nextCall();
      const { invocationId } = h.dataOf<{ invocationId: string }>(
        await h.ask(design.head.account, revision).expect(202),
      );
      await received;
      // The run is waiting on the AI service: make it look started three minutes ago.
      await h.ctx.sql.query(`UPDATE ai_invocations SET started_at = now() - interval '3 minutes' WHERE id = $1`, [
        invocationId,
      ]);

      const read = h.dataOf<SummaryWire>(await h.read(design.head.account, invocationId).expect(200));
      // The service comes back: the dropped call is tried again and answered with valid lines, after the run was taken for stuck.
      h.ai.reply((call) => faithfulAnswer(call));
      h.ai.release();
      await h.settled();

      expect(read).toMatchObject({ status: 'FAILED', errorCode: 'AI.PROVIDER_TIMEOUT' });
      expect(h.ai.accepted()).toHaveLength(2);
      expect(await h.invocationRow(invocationId)).toMatchObject({
        status: 'FAILED',
        error_code: 'AI.PROVIDER_TIMEOUT',
        model_id: null,
      });
      expect(await h.contentRow(invocationId)).toMatchObject({ prompt_text: null, raw_response: null, result: null });
      expect((await h.aiEvents(invocationId)).map((event) => event.action)).toEqual([
        'AI_INVOCATION.REQUESTED',
        'AI_INVOCATION.FAILED',
      ]);
    });

    it('a run RUNNING for 100 seconds is not stuck: GET reads it RUNNING and the same revision asked again gives that call', async () => {
      h.ai.reply(() => ({ kind: 'hang' }));
      const revision = await h.revisionOf(design.head.account);
      const received = h.ai.nextCall();
      const { invocationId } = h.dataOf<{ invocationId: string }>(
        await h.ask(design.head.account, revision).expect(202),
      );
      await received;
      await h.ctx.sql.query(`UPDATE ai_invocations SET started_at = now() - interval '100 seconds' WHERE id = $1`, [
        invocationId,
      ]);

      const read = h.dataOf<SummaryWire>(await h.read(design.head.account, invocationId).expect(200));
      const again = h.dataOf<{ invocationId: string; status: string }>(
        await h.ask(design.head.account, revision).expect(202),
      );

      expect(read).toMatchObject({ status: 'RUNNING', errorCode: null });
      expect(again).toEqual({ invocationId, status: 'RUNNING' });
      expect(await h.invocationRow(invocationId)).toMatchObject({ status: 'RUNNING', error_code: null });
      // End it: the call tried again after the dropped connection is refused for good.
      h.ai.reply(() => ({ kind: 'status', status: 400, code: 'CONTEXT_INVALID' }));
      h.ai.release();
      await h.settled();
      expect(await h.invocationRow(invocationId)).toMatchObject({
        status: 'FAILED',
        error_code: 'AI.PROVIDER_UNAVAILABLE',
      });
    });

    it('a POST of the same revision takes a run stuck for more than 150 seconds for FAILED and starts a new call', async () => {
      h.ai.reply(() => ({ kind: 'hang' }));
      const revision = await h.revisionOf(design.head.account);
      const received = h.ai.nextCall();
      const stuck = h.dataOf<{ invocationId: string }>(await h.ask(design.head.account, revision).expect(202));
      await received;
      await h.ctx.sql.query(`UPDATE ai_invocations SET started_at = now() - interval '3 minutes' WHERE id = $1`, [
        stuck.invocationId,
      ]);
      h.ai.reply((call) => faithfulAnswer(call));

      const fresh = h.dataOf<{ invocationId: string; status: string }>(
        await h.ask(design.head.account, revision).expect(202),
      );
      const stuckRow = await h.invocationRow(stuck.invocationId);
      h.ai.release();
      await h.settled();

      expect(fresh.invocationId).not.toBe(stuck.invocationId);
      expect(fresh.status).toBe('PENDING');
      expect(stuckRow).toMatchObject({ status: 'FAILED', error_code: 'AI.PROVIDER_TIMEOUT' });
      expect((await h.aiEvents(stuck.invocationId)).map((event) => event.action)).toEqual([
        'AI_INVOCATION.REQUESTED',
        'AI_INVOCATION.FAILED',
      ]);
      expect(await h.invocationRow(stuck.invocationId)).toMatchObject({ status: 'FAILED' });
      const view = h.dataOf<SummaryWire>(await h.read(design.head.account, fresh.invocationId).expect(200));
      expect(view).toMatchObject({ status: 'COMPLETED' });
      expect(view.lines.map((line) => line.requestId)).toEqual([r1.id, r2.id]);
      await expectQueuesUnchanged();
    });
  });

  it('a switch turned OFF after a summary was made: the next asking is refused and nothing is sent', async () => {
    await h.switchAll('ON');
    const made = await h.summarize(design.head.account);
    expect(made.status).toBe('COMPLETED');
    h.ai.reset();
    await h.setSwitch('AI_ACCESS_REQUEST_SUMMARY_ENABLED', 'OFF').expect(200);

    expect(h.codeOf(await h.ask(design.head.account, 'b'.repeat(64)).expect(403))).toBe('AI.DISABLED');
    await h.settled();

    expect(h.ai.calls).toHaveLength(0);
    await expectQueuesUnchanged();
    await h.switchAll('ON');
  });

  it('AC-6: after the failures above, with the AI switched off again, H1 and C1 decide by hand as before', async () => {
    await h.switchAll('OFF');

    await h.decide(r1.id, { decision: 'APPROVE' }, design.head.account).expect(200);
    await h.decide(r2.id, { decision: 'REJECT', reason: 'Đã có công cụ tương tự' }, design.head.account).expect(200);
    await h.decideSpend(spend, { decision: 'APPROVE' }, h.boss.account).expect(200);

    const records = await h.ctx.sql.query<{ request_id: string; kind: string; decided_by_employee_id: string }>(
      `SELECT r.request_id, s.kind, r.decided_by_employee_id
         FROM approval_records r JOIN access_request_steps s ON s.id = r.step_id
        WHERE r.request_id = ANY($1::uuid[])`,
      [[r1.id, r2.id, spend]],
    );
    expect(records.rows).toEqual(
      expect.arrayContaining([
        { request_id: r1.id, kind: 'NEED', decided_by_employee_id: design.head.employeeId },
        { request_id: r2.id, kind: 'NEED', decided_by_employee_id: design.head.employeeId },
        { request_id: spend, kind: 'SPEND_APPROVAL', decided_by_employee_id: h.boss.employeeId },
      ]),
    );
    expect(h.ai.calls).toHaveLength(0);
  });
});
