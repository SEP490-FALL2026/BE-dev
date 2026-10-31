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
 * spending approver and the fallback approver, so they have a database of their own.
 */
describe('the queue of the need steps when the person who holds a step changes (integration, real PostgreSQL)', () => {
  let plan: string;
  let internal: string;
  let fallback: Person;
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
    fallback = await h.staff(await h.departmentWithUnit('P-FBK'), 'FBK-R1');
    await h.setRole('FALLBACK_APPROVER', fallback);
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  it('moves a step to the fallback approver when the department has no head, and refuses the screen of the former head at the decision', async () => {
    const u = await unit();
    const r1 = await h.sent(u.member, plan, { termMonths: 1 });
    const other = await h.sent(u.member, internal, { termMonths: 1 });
    expect(await idsOf(u.head.account)).toEqual([r1.id, other.id]);
    expect(await idsOf(fallback.account)).toEqual([]);

    await h.vacateHead(u.department.id).expect(200);

    // The screen the head opened before the change is stale: the step is not theirs, and the decision is not made.
    expect(await idsOf(u.head.account)).toEqual([]);
    const refused = await decide(r1.id, { decision: 'APPROVE' }, u.head.account).expect(404);
    expect(h.codeOf(refused)).toBe('ACCESS_REQUEST.NOT_FOUND');
    expect(await records(r1.id)).toEqual([]);
    // The person who holds it now reads it on their next call, in the role the routing gave them.
    const moved = await queue(fallback.account);
    expect(moved.map((item) => item.requestId)).toEqual([r1.id, other.id]);
    expect(moved.map((item) => item.deciderRole)).toEqual(['FALLBACK_APPROVER', 'FALLBACK_APPROVER']);

    await decide(r1.id, { decision: 'APPROVE' }, fallback.account).expect(200);
    expect(await records(r1.id)).toEqual([
      { decided_by_employee_id: fallback.employeeId, decider_role: 'FALLBACK_APPROVER' },
    ]);
    expect(await idsOf(fallback.account)).toEqual([other.id]);
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
    expect(await idsOf(fallback.account)).not.toContain(r1.id);
    await decide(r1.id, { decision: 'APPROVE' }, u.head.account).expect(404);
    await decide(r1.id, { decision: 'APPROVE' }, successor.account).expect(200);
  });

  it('keeps a step nobody holds out of every queue until somebody valid does, then lists it (last two: they change the approver)', async () => {
    const u = await unit();
    await h.clearRole('SPENDING_APPROVER');
    const own = await h.sent(u.head, internal, { termMonths: 1 });

    expect(own.needStep).toMatchObject({ state: 'WAITING', routingRow: 8, assignee: null });
    for (const account of [u.head.account, h.boss.account, fallback.account, u.member.account, h.it1, h.finance]) {
      expect(await idsOf(account)).not.toContain(own.id);
    }

    await h.setRole('SPENDING_APPROVER', h.boss);

    expect((await h.stepOf(own.id, 'NEED')).state).toBe('PENDING');
    const [item] = (await queue(h.boss.account)).filter((row) => row.requestId === own.id);
    expect(item).toMatchObject({ requestId: own.id, deciderRole: 'SPENDING_APPROVER' });
    expect(await idsOf(u.head.account)).not.toContain(own.id);
  });

  it('moves the need step of a head request to the new spending approver, and refuses the former one at the decision', async () => {
    const u = await unit();
    const r9 = await h.sent(u.head, plan, { termMonths: 1 });
    expect(await idsOf(h.boss.account)).toContain(r9.id);
    const next = await h.staff(await h.departmentWithUnit('P-NXT'), 'NXT-C2');

    await h.setRole('SPENDING_APPROVER', next);

    expect(await idsOf(h.boss.account)).not.toContain(r9.id);
    const [item] = (await queue(next.account)).filter((row) => row.requestId === r9.id);
    expect(item).toMatchObject({ requestId: r9.id, deciderRole: 'SPENDING_APPROVER' });
    const refused = await decide(r9.id, { decision: 'APPROVE' }, h.boss.account).expect(404);
    expect(h.codeOf(refused)).toBe('ACCESS_REQUEST.NOT_FOUND');
    expect(await records(r9.id)).toEqual([]);
    await decide(r9.id, { decision: 'APPROVE' }, next.account).expect(200);
    expect(await idsOf(next.account)).not.toContain(r9.id);
  });
});
