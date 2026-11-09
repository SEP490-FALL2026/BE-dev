import request from 'supertest';
import { ACCOUNT_PASSWORD, type ApiAccount } from '../support/api-accounts';
import type { AccessRequestWire, Person } from '../support/request-harness';
import type { Unit } from '../support/spend-harness';
import { StatusHarness, type NoticeWire } from '../support/status-harness';

const h = new StatusHarness();
const M = 1_000_000;
const MOBILE = { 'User-Agent': 'SLM-Mobile/1.0 (Android 15)', 'X-Client': 'mobile' } as const;

interface Session {
  accessToken: string;
}

/**
 * E2E of the two approvers on the phone (US-16-02, US-16-03): a paid request goes from the employee's phone to the head, who
 * reads it from the inbox, chooses the line of the plan and approves; the head sends it on as spend on the web (batches are web
 * only); the spending approver finds it in the queue of the phone, reads the snapshot and approves it alone; then a request the
 * head sent for themselves is decided by the approver twice, need and spend. Real HTTP, real PostgreSQL, the worker's
 * projection run by hand. It proves the BE sequence only: the native app and its screens are the Mobile developer's.
 */
describe('the approvers on the phone: need step, spend step and the request a head sent for themselves (e2e)', () => {
  let unit: Unit;
  let employee: Person;
  let plan: string;
  let paid: string;
  let own: string;
  const sessions = new Map<string, Session>();

  const signIn = async (account: ApiAccount): Promise<void> => {
    const session = h.dataOf<Session>(
      await request(h.server())
        .post('/api/v1/auth/login')
        .set(MOBILE)
        .send({ email: account.email, password: ACCOUNT_PASSWORD })
        .expect(200),
    );
    sessions.set(account.appUserId, session);
  };
  /** The headers of the phone of the account: its own session, signed in once with the mobile label. */
  const phone = (account: ApiAccount) => {
    const session = sessions.get(account.appUserId);
    if (!session) throw new Error('The account has not signed in on the phone.');

    return { Authorization: `Bearer ${session.accessToken}`, ...MOBILE };
  };
  const get = (path: string, account: ApiAccount) => request(h.server()).get(`/api/v1${path}`).set(phone(account));
  const post = (path: string, account: ApiAccount, body: object) =>
    request(h.server()).post(`/api/v1${path}`).set(phone(account)).send(body);
  const inboxAbout = async (account: ApiAccount, id: string) =>
    h
      .dataOf<{ items: NoticeWire[] }>(await get('/notifications?pageSize=50', account).expect(200))
      .items.filter((item) => item.subject?.id === id);
  const queueOf = async (account: ApiAccount) =>
    h.dataOf<{ items: Array<{ requestId: string; samePersonAsSpend: boolean }> }>(
      await get('/spend-approvals?pageSize=100', account).expect(200),
    ).items;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(10));
    await h
      .declareTaxProfile((await h.vendorOf(plan)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
    unit = await h.departmentWithHead('P-DES');
    employee = await h.staff(unit.department, 'DES-E1', 'EMPLOYEE');
    await h.budgetFor(unit, {
      total: 100 * M,
      lines: [
        h.line({
          description: 'Figma Organization 10 seats',
          planId: plan,
        }),
      ],
    });
    for (const account of [employee.account, unit.head.account, h.boss.account]) await signIn(account);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('the employee sends a paid request from the phone; the head is told the need step is theirs', async () => {
    const body = { planId: plan, businessReason: 'Design system', termMonths: 1 };
    paid = h.dataOf<{ request: AccessRequestWire }>(await post('/access-requests', employee.account, body).expect(201))
      .request.id;
    await h.project();

    const told = await inboxAbout(unit.head.account, paid);
    expect(told.map((item) => [item.code, item.params.stepKind])).toEqual([['STEP_ASSIGNED', 'NEED']]);
  });

  it('the head opens it from the notice and approves with the decision alone: no line of the plan is chosen (QĐ-101n)', async () => {
    const read = h.dataOf<{ request: AccessRequestWire }>(
      await get(`/access-requests/${paid}`, unit.head.account).expect(200),
    );
    expect(read.request).toMatchObject({ businessReason: 'Design system', pricing: { status: 'PRICED' } });

    const decided = await post(`/access-requests/${paid}/need-decision`, unit.head.account, {
      decision: 'APPROVE',
    }).expect(200);

    expect(h.dataOf<{ request: AccessRequestWire }>(decided).request).toMatchObject({
      state: 'AWAITING_SPEND_SUBMISSION',
      needDecision: { decision: 'APPROVED', deciderRole: 'MANAGER' },
    });
  });

  it('the head sends it on as spend on the web; the approver finds it in the queue of the phone with its snapshot', async () => {
    await h.sendOn([paid], unit.head.account).expect(201);

    expect((await queueOf(h.boss.account)).map((item) => item.requestId)).toContain(paid);
    const detail = h.dataOf<{ spendApproval: Record<string, unknown> }>(
      await get(`/access-requests/${paid}/spend-approval`, h.boss.account).expect(200),
    ).spendApproval;
    expect(detail).toMatchObject({ need: { decidedBy: { employeeId: unit.head.employeeId } } });
    const years = h.dataOf<{ items: Array<Record<string, unknown>> }>(
      await get(`/access-requests/${paid}/budget-check/years`, h.boss.account).expect(200),
    ).items;
    expect(years[0]).toMatchObject({ code: 'BUDGET_OK', budget: { amount: String(100 * M) } });
  });

  it('the approver approves that one request on the phone: money is held once and the employee is told', async () => {
    await post(`/access-requests/${paid}/spend-approval`, h.boss.account, { decision: 'APPROVE' }).expect(200);
    await h.project();

    const held = await h.ctx.sql.query(`SELECT 1 FROM budget_commitments WHERE request_id = $1`, [paid]);
    expect(held.rowCount).toBe(1);
    expect((await inboxAbout(employee.account, paid)).map((item) => item.code)).toContain('REQUEST_SPEND_APPROVED');
    // The decider role of each step is the role that decided it: the head for the need, the spending approver alone for the spend; no substitute is ever recorded (QĐ-93c).
    const roles = await h.ctx.sql.query<{ kind: string; decider_role: string }>(
      `SELECT s.kind::text, r.decider_role::text FROM approval_records r JOIN access_request_steps s ON s.id = r.step_id
        WHERE r.request_id = $1 ORDER BY r.decided_at`,
      [paid],
    );
    expect(roles.rows).toEqual([
      { kind: 'NEED', decider_role: 'MANAGER' },
      { kind: 'SPEND_APPROVAL', decider_role: 'SPENDING_APPROVER' },
    ]);
  });

  it('the head sends a request for themselves; the approver decides its need, then its spend, in two decisions', async () => {
    const body = { planId: plan, businessReason: 'Own seat', termMonths: 1 };
    own = h.dataOf<{ request: AccessRequestWire }>(await post('/access-requests', unit.head.account, body).expect(201))
      .request.id;
    await h.project();
    expect((await inboxAbout(h.boss.account, own)).map((item) => [item.code, item.params.stepKind])).toEqual([
      ['STEP_ASSIGNED', 'NEED'],
    ]);
    await post(`/access-requests/${own}/need-decision`, unit.head.account, { decision: 'APPROVE' }).expect(403);

    await post(`/access-requests/${own}/need-decision`, h.boss.account, { decision: 'APPROVE' }).expect(200);
    expect((await queueOf(h.boss.account)).find((item) => item.requestId === own)).toMatchObject({
      samePersonAsSpend: true,
    });
    await post(`/access-requests/${own}/spend-approval`, h.boss.account, { decision: 'APPROVE' }).expect(200);

    const kept = await h.ctx.sql.query<{ kind: string; decider_role: string }>(
      `SELECT s.kind::text, r.decider_role::text FROM approval_records r JOIN access_request_steps s ON s.id = r.step_id
        WHERE r.request_id = $1 ORDER BY r.decided_at`,
      [own],
    );
    expect(kept.rows).toEqual([
      { kind: 'NEED', decider_role: 'SPENDING_APPROVER' },
      { kind: 'SPEND_APPROVAL', decider_role: 'SPENDING_APPROVER' },
    ]);
  });
});
