import request from 'supertest';
import type { ApiAccount } from '../../support/api-accounts';
import { GroupHarness } from '../../support/group-harness';
import type { Person } from '../../support/request-harness';
import type { Unit } from '../../support/spend-harness';
import { RequestsDashboardApi } from '../../../src/modules/requests/public/requests-dashboard.api';

const h = new GroupHarness();
const M = 1_000_000;

interface PageWire {
  pagination: { totalItems: number };
}

describe('RequestsDashboardApi facts agree with source lists (integration, real PostgreSQL)', () => {
  let paid: string;
  let internal: string;
  let design: Unit;
  let engineering: Unit;
  let e1: Person;
  let api: RequestsDashboardApi;
  let number = 0;

  const myRequestsTotal = async (account: ApiAccount, view?: 'open' | 'ended'): Promise<number> => {
    const res = await request(h.server())
      .get('/api/v1/me/access-requests')
      .query({ ...(view ? { view } : {}), pageSize: 1 })
      .set(h.as(account))
      .expect(200);
    return h.dataOf<PageWire>(res).pagination.totalItems;
  };

  const needDecisionsTotal = async (account: ApiAccount): Promise<number> => {
    const res = await request(h.server())
      .get('/api/v1/need-decisions')
      .query({ pageSize: 1 })
      .set(h.as(account))
      .expect(200);
    return h.dataOf<PageWire>(res).pagination.totalItems;
  };

  /** The fixture codes of a department and its people must stay unique inside the file. */
  const unit = async (): Promise<Unit> => {
    number += 1;

    return h.departmentWithHead(`P-RDQ${number}`);
  };
  const employeeOf = async (u: Unit): Promise<Person> => {
    number += 1;

    return h.staff(u.department, `${u.department.code}-X${number}`, 'EMPLOYEE');
  };
  /** A K5 plan of its own, so that one person can send, and be granted, as many requests as a test needs. */
  const freshInternal = () => h.plan('K5');

  /** What the facade says of the open requests of a person, and what the list "my requests" says. */
  const openCounts = async (person: Person) => ({
    facade: await api.openRequestsSentBy(person.employeeId),
    list: await myRequestsTotal(person.account, 'open'),
  });
  /** What the facade says of the need steps a person holds, and what the list of need decisions says. */
  const needCounts = async (person: Person) => ({
    facade: await api.needDecisionsHeldBy(person.employeeId),
    list: await needDecisionsTotal(person.account),
  });

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    api = h.ctx.app.get(RequestsDashboardApi);

    paid = await h.planOf(await h.subscription(100));
    internal = await h.plan('K5');
    design = await h.departmentWithHead('P-RDF1');
    engineering = await h.departmentWithHead('P-RDF2');
    e1 = await h.staff(design.department, 'RDF-E1', 'EMPLOYEE');

    await h.budgetFor(design, { total: 100 * M, held: 20 * M, spent: 40 * M });
    await h.budgetFor(engineering, { total: 100 * M, held: 20 * M, spent: 40 * M });
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  describe('openRequestsSentBy', () => {
    it('returns 0 when employee has sent no requests, agreeing with meAccessRequestList?view=open', async () => {
      const listCount = await myRequestsTotal(e1.account, 'open');
      const count = await api.openRequestsSentBy(e1.employeeId);

      expect(count).toBe(0);
      expect(count).toBe(listCount);
    });

    it('counts open requests sent by employee, exactly matching meAccessRequestList?view=open (both > 0)', async () => {
      await h.sent(e1, internal);
      await h.sent(e1, paid, { termMonths: 1 });

      const listCount = await myRequestsTotal(e1.account, 'open');
      const count = await api.openRequestsSentBy(e1.employeeId);

      expect(count).toBe(2);
      expect(count).toBe(listCount);
    });

    it('counts 0 for the Super Admin, who sends no request but reads their own list like every account (QĐ-95d)', async () => {
      const count = await api.openRequestsSentBy(h.seed.superAdmin.employeeId);

      expect(count).toBe(0);
    });

    it('counts exactly the open requests of the person: not a completed, refused or withdrawn one, a draft, a colleague request or one sent on their behalf', async () => {
      const u = await unit();
      const person = await employeeOf(u);
      const colleague = await employeeOf(u);
      expect(await openCounts(person)).toEqual({ facade: 0, list: 0 });

      await h.sent(person, await freshInternal());
      await h.sent(person, await freshInternal(), { termMonths: 1 });
      expect(await openCounts(person)).toEqual({ facade: 2, list: 2 });

      // Requests that are over: refused by the head, completed (granted), withdrawn.
      const refused = await h.sent(person, await freshInternal());
      await h
        .decide(refused.id, { decision: 'REJECT', reason: 'The team already has seats' }, u.head.account)
        .expect(200);
      const done = await h.sent(person, await freshInternal());
      await h.decide(done.id, { decision: 'APPROVE' }, u.head.account).expect(200);
      const task = h.dataOf<{ task: { id: string } }>(await h.grant({ requestId: done.id }).expect(201)).task;
      await h.claim(task.id).expect(200);
      await h.complete(task.id, { evidence: 'Added to the portal' }).expect(200);
      const withdrawn = await h.sent(person, await freshInternal());
      await h.withdrawRequest(withdrawn.id, { reason: 'No longer needed' }, person.account).expect(200);
      // The three are really there, as ended requests of the person.
      expect(await myRequestsTotal(person.account, 'ended')).toBe(3);

      // A draft is not a request.
      await request(h.server())
        .post('/api/v1/access-requests/drafts')
        .set(h.as(person.account))
        .send({ kind: 'INDIVIDUAL', planId: paid, businessReason: 'Design the new brand' })
        .expect(201);
      // Somebody else's request is not theirs, and nor is one the head sent for them and a colleague: it is the head's.
      await h.sent(colleague, await freshInternal());
      await h.sentForPeople(paid, [person, colleague], u.head.account, { termMonths: 6 });

      // Two are open. Every state of a sent request together would be five, so the filter is what makes it two.
      expect(await openCounts(person)).toEqual({ facade: 2, list: 2 });
      expect(await myRequestsTotal(person.account)).toBe(5);
      // The head is the requester of the one they sent for the two, and of nothing else.
      expect(await openCounts(u.head)).toEqual({ facade: 1, list: 1 });
      expect(await openCounts(colleague)).toEqual({ facade: 1, list: 1 });
    });
  });

  describe('needDecisionsHeldBy', () => {
    it('returns 0 when head holds no need decisions, agreeing with needDecisionList', async () => {
      const listCount = await needDecisionsTotal(engineering.head.account);
      const count = await api.needDecisionsHeldBy(engineering.head.employeeId);

      expect(count).toBe(0);
      expect(count).toBe(listCount);
    });

    it('counts need decisions held by the head, exactly matching needDecisionList, one more for each request sent', async () => {
      const before = await needCounts(design.head);
      expect(before.facade).toBe(before.list);

      await h.sent(design.member, internal);

      const after = await needCounts(design.head);
      expect(after.facade).toBe(after.list);
      expect(after.facade).toBe(before.facade + 1);
    });

    it('counts exactly the need steps the head holds now: not their own request, a decided step, a group of people more than once or a handed-over step', async () => {
      const u = await unit();
      const member = await employeeOf(u);
      expect(await needCounts(u.head)).toEqual({ facade: 0, list: 0 });

      const first = await h.sent(member, await freshInternal());
      await h.sent(member, await freshInternal());
      const third = await h.sent(member, await freshInternal());
      expect(await needCounts(u.head)).toEqual({ facade: 3, list: 3 });

      // MF1-D (BR-MF1-02): the request of the head goes one step: it is a need step of nobody, the head and the approver alike.
      const approverBefore = await needCounts(h.boss);
      await h.sent(u.head, await freshInternal());
      expect(await needCounts(u.head)).toEqual({ facade: 3, list: 3 });
      expect(await needCounts(h.boss)).toEqual({ facade: approverBefore.list, list: approverBefore.list });

      // A step the head decided is no longer waiting for them.
      await h.decide(third.id, { decision: 'APPROVE' }, u.head.account).expect(200);
      expect(await needCounts(u.head)).toEqual({ facade: 2, list: 2 });

      // A request for a group is one step of the head, whatever the number of people.
      const people = await h.colleagues(u, 3);
      await h.submitGroup(h.groupBody(paid, people), people[0].account).expect(201);
      expect(await needCounts(u.head)).toEqual({ facade: 3, list: 3 });

      // A step withdrawn by the one who sent it leaves the count too.
      await h.withdrawRequest(first.id, { reason: 'No longer needed' }, member.account).expect(200);
      expect(await needCounts(u.head)).toEqual({ facade: 2, list: 2 });
    });

    it('moves a step from the head who held it to the one who holds it now', async () => {
      const u = await unit();
      const member = await employeeOf(u);
      await h.sent(member, await freshInternal());
      await h.sent(member, await freshInternal());
      expect(await needCounts(u.head)).toEqual({ facade: 2, list: 2 });
      const successor = await h.staff(u.department, `${u.department.code}-S${number}`);

      await h.vacateHead(u.department.id).expect(200);
      await h.makeHead(u.department, successor);
      await h.sweep();

      expect(await needCounts(u.head)).toEqual({ facade: 0, list: 0 });
      expect(await needCounts(successor)).toEqual({ facade: 2, list: 2 });
    });
  });
});
