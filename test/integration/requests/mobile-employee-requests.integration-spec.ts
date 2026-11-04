import request from 'supertest';
import type { ApiAccount } from '../../support/api-accounts';
import type { TaskWire } from '../../support/provisioning-harness';
import type { AccessRequestWire, Department, Person } from '../../support/request-harness';
import { StatusHarness } from '../../support/status-harness';

const h = new StatusHarness();
/** What a client may say about itself; the server reads neither label (A-09), which the comparisons below rely on. */
const MOBILE = { 'User-Agent': 'SLM-Mobile/1.0 (Android 15)', 'X-Client': 'mobile' } as const;
const WEB = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0)', 'X-Client': 'web' } as const;
type Label = Record<string, string>;

interface PreviewWire {
  branch: string;
  canSubmit: boolean;
  existingAccess: { assignmentId: string } | null;
  pricing: { status: string };
  chain: Array<{ kind: string; role: string; assignee: { employeeId: string } | null; expectedWorkingDays: number }>;
  totalExpectedWorkingDays: number;
}
interface RightWire {
  assignmentId: string;
  plan: { id: string };
  status: string;
}

/**
 * The Employee on the phone (US-16-01): their own software and requests, the choice of software, the preview, sending and
 * withdrawing a simple request, all on the routes of the web with a mobile label. Real HTTP and PostgreSQL. The list of the
 * requests the Employee sent is not here: no route lists them yet (B-03), see the item spec.
 */
describe('the Employee on the phone: own software, own requests, send and withdraw a simple request (US-16-01, integration)', () => {
  let design: Department;
  let head: Person;
  let e1: Person;
  let e2: Person;
  let internalPlan: string;
  let paidPlan: string;
  let counter = 0;

  const headers = (account: ApiAccount, label: Label = MOBILE) => ({ ...h.as(account), ...label });
  const get = (path: string, account: ApiAccount, query: Record<string, string | number> = {}, label?: Label) =>
    request(h.server()).get(`/api/v1${path}`).query(query).set(headers(account, label));
  const post = (path: string, account: ApiAccount, body?: object, label?: Label) =>
    request(h.server()).post(`/api/v1${path}`).set(headers(account, label)).send(body);
  const form = (planId: string, extra: Record<string, unknown> = {}) => ({
    planId,
    businessReason: 'Design the new brand',
    termMonths: 6,
    ...extra,
  });
  const sent = async (person: Person, planId: string, extra: Record<string, unknown> = {}, label?: Label) =>
    h.dataOf<{ request: AccessRequestWire }>(
      await post('/access-requests', person.account, form(planId, extra), label).expect(201),
    ).request;
  const read = async (id: string, account: ApiAccount) =>
    h.dataOf<{ request: AccessRequestWire & { withdrawal: unknown } }>(
      await get(`/access-requests/${id}`, account).expect(200),
    ).request;
  const employee = async () => {
    counter += 1;

    return h.staff(design, `DES-M${counter}`, 'EMPLOYEE');
  };
  /** The internal request of the person approved by the head on the web, granted by the IT Admin and, unless told, taken. */
  const approvedAndGranted = async (person: Person, options: { take?: boolean } = {}) => {
    const asked = await sent(person, internalPlan);
    await h.decide(asked.id, { decision: 'APPROVE' }, head.account).expect(200);
    const task = h.dataOf<{ task: TaskWire }>(await h.grant({ requestId: asked.id }).expect(201)).task;
    if (options.take !== false) await h.claim(task.id).expect(200);

    return { id: asked.id, task };
  };

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    // A paid plan of the catalog whose subscription the department owns, and an internal application (K5) with no price.
    paidPlan = await h.planOf(await h.subscription(10));
    internalPlan = await h.plan('K5');
    design = await h.departmentWithUnit('P-DES');
    head = await h.staff(design, 'DES-H1');
    await h.makeHead(design, head);
    e1 = await h.staff(design, 'DES-E1', 'EMPLOYEE');
    e2 = await h.staff(design, 'DES-E2', 'EMPLOYEE');
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  describe('my software and my requests (AC-1, AC-2 by id, AC-3)', () => {
    it('lists on the phone the software granted from a request of the employee, to them alone and with no figure of money (AC-1)', async () => {
      const person = await employee();
      const { task } = await approvedAndGranted(person);
      await h.complete(task.id, { evidence: 'Added to the portal by IT1' }).expect(200);

      const mine = await get('/me/software-rights', person.account).expect(200);
      const theirs = await get('/me/software-rights', e2.account).expect(200);

      expect(h.dataOf<{ items: RightWire[] }>(mine).items.map((item) => [item.assignmentId, item.plan.id])).toEqual([
        [task.assignmentId, internalPlan],
      ]);
      expect(h.dataOf<{ items: RightWire[] }>(theirs).items.map((item) => item.assignmentId)).not.toContain(
        task.assignmentId,
      );
      expect(JSON.stringify(mine.body)).not.toMatch(/"(amount|price|unitPrice|cost|currency)"/);
    });

    it('reads each request of the employee by id with the state the web shows: waiting on whom, granted, refused with its reason (AC-2)', async () => {
      const person = await employee();
      const waiting = await sent(person, internalPlan);
      const granted = await approvedAndGranted(person);
      await h.complete(granted.task.id, { evidence: 'Done' }).expect(200);
      const refused = await sent(person, paidPlan, { termMonths: 1 });
      await h
        .decide(refused.id, { decision: 'REJECT', reason: 'The team already has seats' }, head.account)
        .expect(200);

      expect(await read(waiting.id, person.account)).toMatchObject({
        state: 'PENDING',
        needStep: { state: 'PENDING', assignee: { employeeId: head.employeeId } },
      });
      expect((await read(granted.id, person.account)).state).toBe('COMPLETED');
      expect(await read(refused.id, person.account)).toMatchObject({
        state: 'REJECTED',
        needDecision: { decision: 'REJECTED', reason: 'The team already has seats' },
      });
      // What the phone can list today is the drafts, and a request that was sent is not one: the list of B-03 is still missing.
      const drafts = h.dataOf<{ items: unknown[] }>(await get('/access-requests/drafts', person.account).expect(200));
      expect(drafts.items).toEqual([]);
    });

    it('refuses the request of a colleague of the same department, even by its address, and says nothing of it (AC-3)', async () => {
      const r9 = await sent(e2, internalPlan);

      const opened = await get(`/access-requests/${r9.id}`, e1.account).expect(404);
      const withdrawn = await post(`/access-requests/${r9.id}/withdraw`, e1.account, {}).expect(404);

      expect([h.codeOf(opened), h.codeOf(withdrawn)]).toEqual(['ACCESS_REQUEST.NOT_FOUND', 'ACCESS_REQUEST.NOT_FOUND']);
      for (const answer of [opened, withdrawn]) {
        expect(JSON.stringify(answer.body)).not.toContain(e2.employeeId);
        expect(Object.keys(answer.body as object).sort()).toEqual(['error', 'success']);
      }
      expect((await read(r9.id, e2.account)).state).toBe('PENDING');
    });
  });

  describe('choosing, previewing and sending (AC-4, AC-5, AC-8)', () => {
    it('does not send a request with no business reason, or a blank one, and keeps nothing (AC-4)', async () => {
      const before = await h.requestRows();

      const missing = await post('/access-requests', e1.account, { planId: paidPlan, termMonths: 6 }).expect(422);
      const blank = await post('/access-requests', e1.account, form(paidPlan, { businessReason: '   ' })).expect(422);

      for (const answer of [missing, blank]) {
        expect(h.codeOf(answer)).toBe('VALIDATION_ERROR');
        expect(JSON.stringify(h.detailsOf(answer))).toContain('businessReason');
      }
      expect(await h.requestRows()).toBe(before);
    });

    it('finds the plan in the catalog for requests, with no part of a standard toolset, and previews the price, the chain and the time (AC-4, AC-5)', async () => {
      const plans = await get('/requestable-plans', e1.account, { pageSize: 100 }).expect(200);
      const picked = h
        .dataOf<{ items: Array<{ id: string; price: { status: string } }> }>(plans)
        .items.find((plan) => plan.id === paidPlan);
      expect(picked).toMatchObject({ price: { status: 'PRICED' } });
      expect(JSON.stringify(plans.body)).not.toMatch(/standard|toolset|outsideStandard/i);

      const preview = h.dataOf<{ preview: PreviewWire }>(
        await post('/access-requests/preview', e1.account, { planId: paidPlan, termMonths: 1 }).expect(200),
      ).preview;

      expect(preview).toMatchObject({
        branch: 'PAID_IN_CATALOG',
        canSubmit: true,
        existingAccess: null,
        pricing: { status: 'PRICED' },
      });
      expect(preview.chain.map((step) => step.kind)).toEqual([
        'NEED',
        'SPEND_SUBMISSION',
        'SPEND_APPROVAL',
        'IT_EXECUTION',
      ]);
      expect(preview.chain[0]).toMatchObject({ role: 'MANAGER', assignee: { employeeId: head.employeeId } });
      expect(preview.totalExpectedWorkingDays).toBeGreaterThan(0);
    });

    it('sends from the phone the request the web would send: same preview, branch, chain, deadline and audit trail (AC-5, AC-8)', async () => {
      const fromPhone = await employee();
      const fromWeb = await employee();
      const previewOf = async (person: Person, label: Label) =>
        h.dataOf<{ preview: PreviewWire }>(
          await post('/access-requests/preview', person.account, { planId: paidPlan, termMonths: 1 }, label).expect(
            200,
          ),
        ).preview;

      expect(await previewOf(fromPhone, MOBILE)).toEqual(await previewOf(fromWeb, WEB));
      const phone = await sent(fromPhone, paidPlan, { termMonths: 1 }, MOBILE);
      const web = await sent(fromWeb, paidPlan, { termMonths: 1 }, WEB);

      const shape = (wire: AccessRequestWire) => ({
        type: wire.type,
        branch: wire.branch,
        state: wire.state,
        pricing: wire.pricing,
        policy: wire.policy,
        routingRow: wire.needStep.routingRow,
        assignee: wire.needStep.assignee?.employeeId,
        sla: wire.needStep.slaWorkingDays,
      });
      expect(shape(phone)).toEqual(shape(web));
      expect(shape(phone)).toMatchObject({ type: 'GRANT', branch: 'PAID_IN_CATALOG', policy: { hasSpendStep: true } });
      const trail = async (id: string) =>
        (await h.auditOf('ACCESS_REQUEST', id)).map((event) => [event.action, Object.keys(event.after ?? {}).sort()]);
      expect(await trail(phone.id)).toEqual(await trail(web.id));
      expect((await trail(phone.id)).map(([action]) => action)).toContain('ACCESS_REQUEST.SUBMITTED');
    });

    it('sends internal software of the catalog from the phone on the internal branch, with no price and no spend step (AC-8)', async () => {
      const asked = await sent(e1, internalPlan);

      expect(asked).toMatchObject({
        type: 'GRANT',
        branch: 'INTERNAL_FREE',
        state: 'PENDING',
        pricing: { status: 'NOT_APPLICABLE', amount: null },
        policy: { hasSpendStep: false },
        needStep: { assignee: { employeeId: head.employeeId } },
      });
    });

    it('blocks software the employee already holds, and shows the seat they hold (AC-5)', async () => {
      const person = await employee();
      const { task } = await approvedAndGranted(person);
      await h.complete(task.id, { evidence: 'Done' }).expect(200);
      const before = await h.requestRows();

      const preview = h.dataOf<{ preview: PreviewWire }>(
        await post('/access-requests/preview', person.account, { planId: internalPlan, termMonths: 6 }).expect(200),
      ).preview;
      const refused = await post('/access-requests', person.account, form(internalPlan)).expect(409);

      expect(preview).toMatchObject({ canSubmit: false, existingAccess: { assignmentId: task.assignmentId } });
      expect(h.codeOf(refused)).toBe('ACCESS_REQUEST.ALREADY_HOLDS_ACCESS');
      expect((h.detailsOf(refused).assignment as { assignmentId: string }).assignmentId).toBe(task.assignmentId);
      expect(await h.requestRows()).toBe(before);
    });
  });

  describe('withdrawing (AC-6)', () => {
    it('withdraws a waiting request from the phone, tells the holder of the step, and refuses a second withdrawal', async () => {
      const person = await employee();
      const r1 = await sent(person, internalPlan);
      await h.project();

      const withdrawn = await post(`/access-requests/${r1.id}/withdraw`, person.account, {}).expect(200);
      await h.project();
      const again = await post(`/access-requests/${r1.id}/withdraw`, person.account, {}).expect(409);

      expect(h.dataOf<{ request: AccessRequestWire }>(withdrawn).request.state).toBe('WITHDRAWN');
      expect(await h.codesFor(head.employeeId, r1.id)).toEqual(['STEP_ASSIGNED', 'STEP_CLOSED_BY_WITHDRAWAL']);
      expect(h.codeOf(again)).toBe('ACCESS_REQUEST.ALREADY_ENDED');
    });

    it('does not let anyone but the requester withdraw, and the request does not move', async () => {
      const r1 = await sent(e1, internalPlan);

      await post(`/access-requests/${r1.id}/withdraw`, e2.account, {}).expect(404);
      const byHead = await post(`/access-requests/${r1.id}/withdraw`, head.account, { reason: 'Not now' }).expect(403);

      expect(h.codeOf(byHead)).toBe('ACCESS_REQUEST.NOT_REQUESTER');
      expect((await read(r1.id, e1.account)).state).toBe('PENDING');
    });

    it('refuses while the grant is being carried out, and sends a granted request to the return on the web', async () => {
      const person = await employee();
      const running = await approvedAndGranted(person);
      const other = await employee();
      const done = await approvedAndGranted(other);
      await h.complete(done.task.id, { evidence: 'Done' }).expect(200);

      const whileRunning = await post(`/access-requests/${running.id}/withdraw`, person.account, {}).expect(409);
      const afterGrant = await post(`/access-requests/${done.id}/withdraw`, other.account, {}).expect(409);

      expect(h.codeOf(whileRunning)).toBe('ACCESS_REQUEST.GRANT_RUNNING');
      expect((await read(running.id, person.account)).state).toBe('EXECUTING');
      expect(h.codeOf(afterGrant)).toBe('ACCESS_REQUEST.GRANT_COMPLETED');
      expect(h.detailsOf(afterGrant)).toEqual({ assignmentId: done.task.assignmentId });
      expect((await read(done.id, other.account)).state).toBe('COMPLETED');
    });
  });
});
