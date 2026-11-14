import request from 'supertest';
import type { ApiAccount } from '../../support/api-accounts';
import type { Person } from '../../support/request-harness';
import { StatusHarness } from '../../support/status-harness';
import type { Unit } from '../../support/spend-harness';

const h = new StatusHarness();
const MOBILE = { 'User-Agent': 'SLM-Mobile/1.0 (iOS 19)', 'X-Client': 'mobile' } as const;

interface QueueItem {
  requestId: string;
  stepId: string;
  deciderRole: string;
  assignedAt: string | null;
  openedAt: string;
}

/**
 * Who a step is given to changes between two reads of the queue (US-05-04, US-05-11): the step leaves the queue of the person who held
 * it and enters the queue of the one who holds it now, a step nobody holds is in no queue until somebody does, and a screen opened
 * before the change is refused at the decision, which is judged again on the locked request. These tests change the head, the
 * spending approver, so they have a database of their own.
 */
describe('the queue of the need steps when the person who holds a step changes (integration, real PostgreSQL)', () => {
  let plan: string;
  let internal: string;
  /** A person who holds no role: a person whose queue must stay empty. */
  let bystander: Person;
  let number = 0;

  const read = (account: ApiAccount) =>
    request(h.server())
      .get('/api/v1/need-decisions')
      .query({ pageSize: 100 })
      .set({ ...h.as(account), ...MOBILE });
  const queue = async (account: ApiAccount) => h.dataOf<{ items: QueueItem[] }>(await read(account).expect(200)).items;
  const idsOf = async (account: ApiAccount) => (await queue(account)).map((item) => item.requestId);
  const unit = async (): Promise<Unit> => {
    number += 1;

    return h.departmentWithHead(`P-H${number}`);
  };
  const decide = (id: string, body: object, account: ApiAccount) =>
    request(h.server())
      .post(`/api/v1/access-requests/${id}/need-decision`)
      .set({ ...h.as(account), ...MOBILE })
      .send(body);
  const spendIdsOf = async (account: ApiAccount) =>
    h
      .dataOf<{ items: Array<{ requestId: string }> }>(
        await request(h.server())
          .get('/api/v1/spend-approvals')
          .query({ pageSize: 100 })
          .set(h.as(account))
          .expect(200),
      )
      .items.map((item) => item.requestId);
  const spendDecide = (id: string, body: object, account: ApiAccount) =>
    request(h.server()).post(`/api/v1/access-requests/${id}/spend-approval`).set(h.as(account)).send(body);
  const records = async (id: string) =>
    (
      await h.ctx.sql.query<{ decided_by_employee_id: string; decider_role: string }>(
        `SELECT decided_by_employee_id, decider_role::text FROM approval_records WHERE request_id = $1`,
        [id],
      )
    ).rows;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(100));
    internal = await h.plan('K5');
    bystander = await h.staff(await h.departmentWithUnit('P-BYS'), 'BYS-R1');
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  it('takes a step out of every queue when the department has no head, and refuses the screen of the former head at the decision', async () => {
    const u = await unit();
    const r1 = await h.sent(u.member, plan, { termMonths: 1 });
    const other = await h.sent(u.member, internal, { termMonths: 1 });
    expect(await idsOf(u.head.account)).toEqual([r1.id, other.id]);
    expect(await idsOf(bystander.account)).toEqual([]);

    await h.vacateHead(u.department.id).expect(200);

    // The screen the head opened before the change is stale: the step is not theirs, and the decision is not made.
    expect(await idsOf(u.head.account)).toEqual([]);
    // QĐ-110i (MF1-X): a paid request that was with a head who left with no successor does not become one step; its need step waits for a
    // head and holds nobody, so the former head no longer reads it: the decision is refused as for a request that is not theirs (it was a
    // 409 on the closed step the earlier one-step rule left them as holder).
    const refused = await decide(r1.id, { decision: 'APPROVE' }, u.head.account).expect(404);
    expect(h.codeOf(refused)).toBe('ACCESS_REQUEST.NOT_FOUND');
    expect(await records(r1.id)).toEqual([]);
    expect(await h.stepOf(r1.id, 'NEED')).toMatchObject({
      state: 'WAITING',
      assignee_employee_id: null,
      waiting_reason: 'NO_DEPARTMENT_HEAD',
    });
    // Nobody takes the need step of an internal request in place of a head (QĐ-93c, Q-33): it waits, and is in nobody's queue, the
    // spending approver's included.
    expect(await h.stepOf(other.id, 'NEED')).toMatchObject({
      state: 'WAITING',
      assignee_employee_id: null,
      waiting_reason: 'NO_DEPARTMENT_HEAD',
    });
    for (const account of [h.boss.account, bystander.account, u.member.account, h.it1, h.finance]) {
      const ids = await idsOf(account);
      expect(ids).not.toContain(r1.id);
      expect(ids).not.toContain(other.id);
    }
    await decide(other.id, { decision: 'APPROVE' }, h.boss.account).expect(404);
    expect(await records(other.id)).toEqual([]);
  });

  it('hands a step to the new head when the Super Admin names one, with the step keeping its age', async () => {
    const u = await unit();
    const r1 = await h.sent(u.member, internal, { termMonths: 1 });
    const [before] = await queue(u.head.account);
    const successor = await h.staff(u.department, `${u.department.code}-S`);

    await h.vacateHead(u.department.id).expect(200);
    await h.makeHead(u.department, successor);
    await h.sweep();

    expect(await idsOf(u.head.account)).toEqual([]);
    const [after] = (await queue(successor.account)).filter((item) => item.requestId === r1.id);
    expect(after).toMatchObject({ requestId: r1.id, deciderRole: 'MANAGER', openedAt: before.openedAt });
    expect(await idsOf(bystander.account)).not.toContain(r1.id);
    await decide(r1.id, { decision: 'APPROVE' }, u.head.account).expect(404);
    await decide(r1.id, { decision: 'APPROVE' }, successor.account).expect(200);
  });

  it('keeps the own request of a head out of every need queue, whoever holds the approver role (last two: they change the approver)', async () => {
    const u = await unit();
    await h.clearRole('SPENDING_APPROVER');
    const own = await h.sent(u.head, internal, { termMonths: 1 });

    // MF1-D (QĐ-104): a head's own request is one step: its need step is not required (routing row 2), so no need queue lists it.
    expect(own.needStep).toMatchObject({ state: 'NOT_REQUIRED', routingRow: 2, assignee: null });
    for (const account of [u.head.account, h.boss.account, bystander.account, u.member.account, h.it1, h.finance]) {
      expect(await idsOf(account)).not.toContain(own.id);
    }

    await h.setRole('SPENDING_APPROVER', h.boss);

    expect((await h.stepOf(own.id, 'NEED')).state).toBe('NOT_REQUIRED');
    for (const account of [u.head.account, h.boss.account]) expect(await idsOf(account)).not.toContain(own.id);
  });

  it('moves the spend step of a head request to the new spending approver, and refuses the former one at the decision', async () => {
    const u = await unit();
    // A spend step is opened only on an approved budget of the department (else the request goes back to its head).
    await h.budgetFor(u, { total: 100_000_000, held: 0, spent: 0 });
    const r9 = await h.sent(u.head, plan, { termMonths: 1 });
    // MF1-D: the paid request of a head is one step: no need step, its spend step is the spending approver's.
    expect(await idsOf(h.boss.account)).not.toContain(r9.id);
    expect(await spendIdsOf(h.boss.account)).toContain(r9.id);
    const next = await h.staff(await h.departmentWithUnit('P-NXT'), 'NXT-C2');

    await h.setRole('SPENDING_APPROVER', next);

    expect(await spendIdsOf(h.boss.account)).not.toContain(r9.id);
    expect(await spendIdsOf(next.account)).toContain(r9.id);
    // The screen of the former approver is stale: the spend step is no longer theirs, and the decision is not made.
    const refused = await spendDecide(r9.id, { decision: 'APPROVE' }, h.boss.account).expect(403);
    expect(h.codeOf(refused)).toBe('SPEND.NOT_THE_ASSIGNEE');
    expect(await records(r9.id)).toEqual([]);
    await spendDecide(r9.id, { decision: 'APPROVE' }, next.account).expect(200);
    expect(await spendIdsOf(next.account)).not.toContain(r9.id);
  });
});
