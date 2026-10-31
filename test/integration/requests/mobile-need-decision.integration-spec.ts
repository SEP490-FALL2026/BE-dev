import request from 'supertest';
import type { ApiAccount } from '../../support/api-accounts';
import type { AccessRequestWire } from '../../support/request-harness';
import type { Unit } from '../../support/spend-harness';
import { StatusHarness } from '../../support/status-harness';

const h = new StatusHarness();
const M = 1_000_000;
const MOBILE = { 'User-Agent': 'SLM-Mobile/1.0 (iOS 19)', 'X-Client': 'mobile' } as const;
const WEB = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0)', 'X-Client': 'web' } as const;
type Label = Record<string, string>;

interface RecordRow {
  decision: string;
  decided_by_employee_id: string;
  decider_role: string;
  department_id: string;
  reason: string | null;
  term_confirmation_reason: string | null;
  decided_at: Date;
}

/**
 * The head decides the need step on the phone (US-16-02): the request, its reason and term, the lines of the plan, approval
 * and refusal, and every way the step can stop being theirs, on the routes of the web with a mobile label. Real HTTP and
 * PostgreSQL. The queue of the head is not here: no route lists the need steps a person holds yet (B-02), see the item spec.
 */
describe('the head decides the need step on the phone (US-16-02, integration)', () => {
  let design: Unit;
  let engineering: Unit;
  let plan: string;
  let internal: string;
  let counter = 0;

  const headers = (account: ApiAccount, label: Label = MOBILE) => ({ ...h.as(account), ...label });
  const get = (path: string, account: ApiAccount, label?: Label) =>
    request(h.server()).get(`/api/v1${path}`).set(headers(account, label));
  const decide = (id: string, body: object, account: ApiAccount, label?: Label) =>
    request(h.server()).post(`/api/v1/access-requests/${id}/need-decision`).set(headers(account, label)).send(body);
  const sentBy = async (unit: Unit, planId: string, extra: Record<string, unknown> = {}) => {
    counter += 1;
    const member = await h.staff(unit.department, `${unit.department.code}-M${counter}`, ['EMPLOYEE']);

    return { member, request: await h.sent(member, planId, { termMonths: 1, ...extra }) };
  };
  const records = async (id: string) =>
    (
      await h.ctx.sql.query<RecordRow>(
        `SELECT decision::text, decided_by_employee_id, decider_role::text, department_id, reason, term_confirmation_reason, decided_at
           FROM approval_records WHERE request_id = $1 ORDER BY decided_at`,
        [id],
      )
    ).rows;
  const wire = async (id: string, account: ApiAccount) =>
    h.dataOf<{ request: AccessRequestWire & { planLineAttached: boolean } }>(
      await get(`/access-requests/${id}`, account).expect(200),
    ).request;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(10));
    internal = await h.plan('K5');
    design = await h.departmentWithHead('P-DES');
    engineering = await h.departmentWithHead('P-ENG');
    await h.budgetFor(design, {
      total: 100 * M,
      lines: [
        h.line({
          description: 'Figma Organization 10 seats',
          planId: plan,
          windowFrom: `${h.year}-12-01`,
          windowTo: `${h.year}-12-31`,
          quoteValidUntil: undefined,
        }),
      ],
    });
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  describe('reading and approving (AC-1, AC-4, AC-8, AC-9)', () => {
    it('shows the head the request, its seats of the same kind and the lines of the plan with no figure of the budget (AC-4, AC-9)', async () => {
      const { request: r1 } = await sentBy(design, plan, { businessReason: 'The project needs a wiki' });

      const read = await wire(r1.id, design.head.account);
      const seats = await get(`/access-requests/${r1.id}/similar-seats`, design.head.account).expect(200);
      const lines = await get(`/access-requests/${r1.id}/plan-line-suggestions`, design.head.account).expect(200);

      expect(read).toMatchObject({
        businessReason: 'The project needs a wiki',
        termMonths: 1,
        pricing: { status: 'PRICED' },
        needStep: { state: 'PENDING', assignee: { employeeId: design.head.employeeId } },
      });
      expect(JSON.stringify(read)).not.toMatch(/standard|toolset/i);
      expect(h.dataOf<{ items: unknown[] }>(seats).items).toEqual([]);
      expect(h.dataOf<{ items: Array<{ position: number; suggested: boolean }> }>(lines).items).toEqual([
        expect.objectContaining({ position: 1, suggested: true, overdue: false }),
      ]);
      expect(JSON.stringify(lines.body)).not.toMatch(/remaining|committed|spent|held|INSUFFICIENT|HIGH_VALUE/);
    });

    it('saves nothing when the head approves without a line or "outside the plan", then approves with the line as the web does (AC-1, AC-9)', async () => {
      const { request: r1 } = await sentBy(design, plan);

      const missing = await decide(r1.id, { decision: 'APPROVE' }, design.head.account).expect(422);
      expect(h.codeOf(missing)).toBe('ACCESS_REQUEST.PLAN_LINE_REQUIRED');
      expect(await records(r1.id)).toEqual([]);

      const approved = await decide(
        r1.id,
        { decision: 'APPROVE', spend: { planLine: { position: 1 }, expectedSpendOn: `${h.year}-12-10` } },
        design.head.account,
      ).expect(200);

      expect(h.dataOf<{ request: AccessRequestWire }>(approved).request).toMatchObject({
        state: 'AWAITING_SPEND_SUBMISSION',
        planLineAttached: true,
        expectedSpendOn: `${h.year}-12-10`,
        needDecision: {
          decision: 'APPROVED',
          deciderRole: 'MANAGER',
          decidedBy: { employeeId: design.head.employeeId },
        },
      });
      const [event] = await h.audit('ACCESS_REQUEST.NEED_APPROVED', r1.needStep.id);
      expect(event.after).toMatchObject({
        assigneeEmployeeId: design.head.employeeId,
        decidedByEmployeeId: design.head.employeeId,
        deciderRole: 'MANAGER',
      });
    });

    it('keeps one electronic record of the decision, with who, in what role, when and why, which nobody can change (AC-8)', async () => {
      const { request: r1 } = await sentBy(design, internal);

      await decide(r1.id, { decision: 'APPROVE' }, design.head.account).expect(200);

      const [kept] = await records(r1.id);
      expect(kept).toMatchObject({
        decision: 'APPROVED',
        decided_by_employee_id: design.head.employeeId,
        decider_role: 'MANAGER',
        department_id: design.department.id,
        reason: null,
      });
      expect(kept.decided_at).toBeInstanceOf(Date);
      await expect(
        h.ctx.sql.query(`UPDATE approval_records SET reason = 'changed' WHERE request_id = $1`, [r1.id]),
      ).rejects.toThrow(/append-only/);
      await expect(h.ctx.sql.query(`DELETE FROM approval_records WHERE request_id = $1`, [r1.id])).rejects.toThrow(
        /append-only/,
      );
    });

    it('needs the head to confirm a term over twelve months with a reason, as on the web (AC-4)', async () => {
      const { request: r1 } = await sentBy(design, internal, { termMonths: 18 });

      const unconfirmed = await decide(r1.id, { decision: 'APPROVE' }, design.head.account).expect(422);
      expect(h.codeOf(unconfirmed)).toBe('ACCESS_REQUEST.TERM_CONFIRMATION_REQUIRED');
      expect(await records(r1.id)).toEqual([]);
      expect((await wire(r1.id, design.head.account)).termMonths).toBe(18);

      await decide(
        r1.id,
        { decision: 'APPROVE', termConfirmation: { reason: 'The project runs for eighteen months' } },
        design.head.account,
      ).expect(200);
      expect(await records(r1.id)).toEqual([
        expect.objectContaining({ term_confirmation_reason: 'The project runs for eighteen months' }),
      ]);
    });
  });

  describe('refusing (AC-2)', () => {
    it('saves no refusal without a reason; with one the request ends refused and the employee is told the reason', async () => {
      const { member, request: r1 } = await sentBy(design, plan);

      const missing = await decide(r1.id, { decision: 'REJECT' }, design.head.account).expect(422);
      const blank = await decide(r1.id, { decision: 'REJECT', reason: '  ' }, design.head.account).expect(422);
      expect([h.codeOf(missing), h.codeOf(blank)]).toEqual(['VALIDATION_ERROR', 'VALIDATION_ERROR']);
      expect(await records(r1.id)).toEqual([]);

      await decide(r1.id, { decision: 'REJECT', reason: 'Notion already does it' }, design.head.account).expect(200);
      await h.project();

      expect((await wire(r1.id, member.account)).state).toBe('REJECTED');
      const told = (await h.noticesOf(member.employeeId, 'REQUEST_REJECTED')).filter((row) => row.subject_id === r1.id);
      expect(told.map((row) => row.params)).toEqual([
        expect.objectContaining({ by: 'NEED', reason: 'Notion already does it' }),
      ]);
    });
  });

  describe("a step that is not, or no longer, the head's (AC-5, AC-6)", () => {
    it("gives the head no decision on the request they sent themselves: the step is the spending approver's (AC-5)", async () => {
      const own = await h.sent(design.head, internal);

      expect(own.needStep).toMatchObject({ routingRow: 2, assignee: { employeeId: h.boss.employeeId } });
      const refused = await decide(own.id, { decision: 'APPROVE' }, design.head.account).expect(403);
      expect(h.codeOf(refused)).toBe('ACCESS_REQUEST.OWN_REQUEST');
      expect(await records(own.id)).toEqual([]);
    });

    it('refuses the phone of a head whose screen was opened before the head decided on the web, and keeps one record (AC-6)', async () => {
      const { request: r1 } = await sentBy(design, internal);
      // 08:55: the screen of the phone is open on the step.
      expect((await wire(r1.id, design.head.account)).needStep.state).toBe('PENDING');
      // 09:00: the head decides on the web.
      await decide(r1.id, { decision: 'APPROVE' }, design.head.account, WEB).expect(200);
      const after = await wire(r1.id, design.head.account);

      // 09:05: the stale screen approves, then refuses.
      const approve = await decide(r1.id, { decision: 'APPROVE' }, design.head.account).expect(409);
      const reject = await decide(r1.id, { decision: 'REJECT', reason: 'Changed my mind' }, design.head.account).expect(
        409,
      );

      expect([h.codeOf(approve), h.codeOf(reject)]).toEqual([
        'ACCESS_REQUEST.STEP_NOT_PENDING',
        'ACCESS_REQUEST.STEP_NOT_PENDING',
      ]);
      expect(await records(r1.id)).toHaveLength(1);
      expect(await wire(r1.id, design.head.account)).toEqual(after);
      expect(await h.audit('ACCESS_REQUEST.NEED_APPROVED', r1.needStep.id)).toHaveLength(1);
    });

    it('refuses the phone once the employee withdrew the request on the web (AC-6)', async () => {
      const { member, request: r1 } = await sentBy(design, internal);
      await request(h.server())
        .post(`/api/v1/access-requests/${r1.id}/withdraw`)
        .set(headers(member.account, WEB))
        .send({})
        .expect(200);

      const refused = await decide(r1.id, { decision: 'APPROVE' }, design.head.account).expect(409);

      expect(h.codeOf(refused)).toBe('ACCESS_REQUEST.STEP_NOT_PENDING');
      expect(await records(r1.id)).toEqual([]);
      expect((await wire(r1.id, member.account)).state).toBe('WITHDRAWN');
    });

    it('refuses the head of another department, who learns nothing of the request (AC-3 boundary, AC-6)', async () => {
      const { request: r1 } = await sentBy(design, internal);

      const opened = await get(`/access-requests/${r1.id}`, engineering.head.account).expect(404);
      const decided = await decide(r1.id, { decision: 'APPROVE' }, engineering.head.account).expect(404);

      expect([h.codeOf(opened), h.codeOf(decided)]).toEqual(['ACCESS_REQUEST.NOT_FOUND', 'ACCESS_REQUEST.NOT_FOUND']);
      expect(await records(r1.id)).toEqual([]);
    });

    it('refuses a head whose head period ended while the screen was open: the step left them (AC-6)', async () => {
      const unit = await h.departmentWithHead('P-OLD');
      const { request: r1 } = await sentBy(unit, internal);
      expect((await wire(r1.id, unit.head.account)).needStep.assignee?.employeeId).toBe(unit.head.employeeId);

      await h.vacateHead(unit.department.id).expect(200);
      const refused = await decide(r1.id, { decision: 'APPROVE' }, unit.head.account).expect(404);

      expect(h.codeOf(refused)).toBe('ACCESS_REQUEST.NOT_FOUND');
      expect(await records(r1.id)).toEqual([]);
      expect((await h.stepOf(r1.id, 'NEED')).assignee_employee_id).not.toBe(unit.head.employeeId);
    });

    it('lets one of two decisions sent at once from the web and the phone through, never both (AC-6)', async () => {
      const { request: r1 } = await sentBy(design, internal);

      const answers = await h.queuedOnRequest(r1.id, [
        () => decide(r1.id, { decision: 'APPROVE' }, design.head.account, WEB),
        () => decide(r1.id, { decision: 'REJECT', reason: 'Not needed' }, design.head.account, MOBILE),
      ]);

      expect(answers.map((answer) => answer.status)).toEqual([200, 409]);
      expect(await records(r1.id)).toEqual([expect.objectContaining({ decision: 'APPROVED' })]);
    });
  });
});
