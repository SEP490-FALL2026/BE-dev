import request from 'supertest';
import type { ApiAccount } from '../../support/api-accounts';
import { GroupHarness } from '../../support/group-harness';
import type { Person } from '../../support/request-harness';
import type { Unit } from '../../support/spend-harness';

const h = new GroupHarness();

interface EventWire {
  kind: string;
  actorKind: string;
  actorRole: string | null;
  line: { employeeId: string } | null;
  reason: string | null;
}
interface MyRow {
  id: string;
  involvement: string;
  canWithdraw: boolean;
  myLine: { state: string; outcomeReason: string | null } | null;
}

/**
 * Who reads one request, its time, its people and its history, over real PostgreSQL (`canReadRequest`): the people of the history of
 * their role read the detail of each row it lists; nobody else learns that the request exists (404, the Super Admin included); a person a
 * request for a group is for reads only their own line and the entries about themselves; reading gives no right to act.
 */
describe('the detail of a request by role (integration, real PostgreSQL)', () => {
  let paid: string;
  let design: Unit;
  let other: Unit;
  let e2: Person;
  let e3: Person;
  let lateHead: Person;
  let waiting: string;
  let approved: string;
  let refusedBySpender: string;
  let withdrawn: string;
  let group: string;
  let noHead: string;

  const read = (path: string, account: ApiAccount) => request(h.server()).get(path).set(h.as(account));
  const readAsAdmin = (path: string) =>
    request(h.server())
      .get(path)
      .set({ Authorization: `Bearer ${h.admin}` });
  const detailPaths = (id: string) => [
    `/api/v1/access-requests/${id}`,
    `/api/v1/access-requests/${id}/timings`,
    `/api/v1/access-requests/${id}/events`,
  ];
  const eventsOf = async (id: string, account: ApiAccount) =>
    h.dataOf<{ items: EventWire[] }>(
      await read(`/api/v1/access-requests/${id}/events?pageSize=100`, account).expect(200),
    ).items;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    paid = await h.planOf(await h.subscription(100));
    design = await h.departmentWithHead('P-RRD');
    other = await h.departmentWithHead('P-RRO');
    await h.roomFor(design);
    await h.setItAdminInCharge(design.department, { employeeId: h.it1.employeeId, account: h.it1 });

    waiting = (await h.sent(design.member, paid, { termMonths: 1 })).id;
    approved = await h.waitingForApprover(design, paid, { amount: 10_000_000 });
    await h.decideSpend(approved, { decision: 'APPROVE' }, h.boss.account).expect(200);
    refusedBySpender = await h.waitingForApprover(design, paid, { amount: 10_000_000 });
    await h.decideSpend(refusedBySpender, { decision: 'REJECT', reason: 'Over the plan' }, h.boss.account).expect(200);
    withdrawn = (await h.sent(design.member, paid, { termMonths: 1 })).id;
    await h.withdrawRequest(withdrawn, { reason: 'Found another tool' }, design.member.account).expect(200);

    // A group the head sent for two people: the approver approves E2 and refuses E3 with a reason.
    e2 = await h.colleague(design);
    e3 = await h.colleague(design);
    group = await h.groupWaiting(design, paid, [e2, e3]);
    await h
      .decideSpendLines(
        group,
        {
          lines: [
            { employeeId: e2.employeeId, decision: 'APPROVE' },
            { employeeId: e3.employeeId, decision: 'REJECT', reason: 'Only one seat this quarter' },
          ],
        },
        h.boss.account,
      )
      .expect(200);

    // A request of a department that had no head when it was sent: nobody holds a need step of it.
    const lonely = await h.departmentWithUnit('P-RRN');
    noHead = (await h.sent(await h.staff(lonely, 'RRN-E1'), await h.plan('K5'))).id;
    lateHead = await h.staff(lonely, 'RRN-H1');
    await h.makeHead(lonely, lateHead);
  }, 600000);

  afterAll(async () => {
    await h.stop();
  });

  describe('who reads the detail, the time and the history', () => {
    it.each([
      ['the head today of its department, who holds no step of it', () => lateHead.account, () => noHead],
      ['the head of the department, after the request left their queue', () => design.head.account, () => approved],
      ['the spending approver, after deciding it', () => h.boss.account, () => approved],
      ['the spending approver, after refusing it', () => h.boss.account, () => refusedBySpender],
      ['Finance, once the spend was approved', () => h.finance, () => approved],
      ['the IT Admin', () => h.it1, () => waiting],
      ['the sender', () => design.member.account, () => withdrawn],
    ])('lets %s read it, 200', async (_who, account, id) => {
      for (const path of detailPaths(id())) await read(path, account()).expect(200);
    });

    it.each([
      ['the head of another department', () => other.head.account, () => approved],
      ['the spending approver, before the spend step', () => h.boss.account, () => waiting],
      ['Finance, before the spend was approved', () => h.finance, () => waiting],
      ['Finance, when the spend was refused', () => h.finance, () => refusedBySpender],
      ['an employee with no part in it', () => other.member.account, () => approved],
    ])('answers %s that it does not exist, 404', async (_who, account, id) => {
      for (const path of detailPaths(id())) {
        expect(h.codeOf(await read(path, account()).expect(404))).toBe('ACCESS_REQUEST.NOT_FOUND');
      }
    });

    it('answers the Super Admin that no request exists, a paid and approved one included (SoD-1)', async () => {
      for (const path of [...detailPaths(approved), `/api/v1/access-requests/${group}/lines`]) {
        expect(h.codeOf(await readAsAdmin(path).expect(404))).toBe('ACCESS_REQUEST.NOT_FOUND');
      }
    });

    it('answers 404 for a request that does not exist', async () => {
      const missing = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d98';
      expect(h.codeOf(await read(`/api/v1/access-requests/${missing}/events`, h.it1).expect(404))).toBe(
        'ACCESS_REQUEST.NOT_FOUND',
      );
    });

    it('opens no action: Finance still cannot decide the spend and the head still cannot withdraw for the sender', async () => {
      const spend = await h.decideSpend(waiting, { decision: 'APPROVE' }, h.finance);
      // The request has no spend step yet: there is nothing to decide, whoever asks (Finance never holds one, QĐ-97c).
      expect([spend.status, h.codeOf(spend)]).toEqual([409, 'SPEND.NO_SPEND_STEP']);
      const withdrawal = await h.withdrawRequest(waiting, { reason: 'x' }, other.head.account);
      expect([403, 404]).toContain(withdrawal.status);
    });
  });

  describe('the history of one request (accessRequestEventList)', () => {
    it('tells a paid request from the sending to the spend approved, in order, with the role of each decider', async () => {
      const kinds = (await eventsOf(approved, design.head.account)).map((event) => event.kind);

      expect(kinds.slice(0, 3)).toEqual(['SUBMITTED', 'NEED_APPROVED', 'SPEND_APPROVED']);
      const spend = (await eventsOf(approved, h.boss.account)).find((event) => event.kind === 'SPEND_APPROVED');
      expect(spend).toMatchObject({ actorKind: 'USER', actorRole: 'SPENDING_APPROVER', reason: null });
    });

    it('carries the reason a person wrote when they withdrew', async () => {
      const entry = (await eventsOf(withdrawn, design.member.account)).find((event) => event.kind === 'WITHDRAWN');

      expect(entry?.reason).toBe('Found another tool');
    });

    it('answers no key of the record of the event beyond the entry', async () => {
      const events = await eventsOf(approved, h.it1);

      for (const event of events) {
        expect(Object.keys(event).sort()).toEqual(
          ['actor', 'actorKind', 'actorRole', 'id', 'kind', 'line', 'occurredAt', 'reason'].sort(),
        );
      }
      expect(JSON.stringify(events)).not.toMatch(/amount|budget|checkId|overBy|snapshot/i);
    });
  });

  describe('a request for a group, read by one of its people (US-05-15 AC-9)', () => {
    it('gives E2 only their own line and the entries about the whole request or about themselves', async () => {
      const lines = h.dataOf<{ items: { employee: { employeeId: string } }[] }>(
        await h.linesOf(group, e2.account).expect(200),
      ).items;
      expect(lines.map((line) => line.employee.employeeId)).toEqual([e2.employeeId]);

      const events = await eventsOf(group, e2.account);
      expect(events.some((event) => event.line?.employeeId === e3.employeeId)).toBe(false);
      expect(JSON.stringify(events)).not.toContain('Only one seat this quarter');
      expect(events.some((event) => event.kind === 'SUBMITTED')).toBe(true);
    });

    it('gives the head who sent it, and the approver, every line and every entry', async () => {
      const lines = h.dataOf<{ items: unknown[] }>(await h.linesOf(group, design.head.account).expect(200)).items;
      expect(lines).toHaveLength(2);

      const events = await eventsOf(group, h.boss.account);
      expect(
        events.find((event) => event.line?.employeeId === e3.employeeId && event.kind === 'LINE_SPEND_DECIDED'),
      ).toMatchObject({
        reason: 'Only one seat this quarter',
      });
    });

    it('lists the group in "my requests" of E3 only when asked for what was sent for them, with their own line', async () => {
      const mine = async (query: string) =>
        h.dataOf<{ items: MyRow[] }>(
          await read(`/api/v1/me/access-requests?pageSize=100${query}`, e3.account).expect(200),
        ).items;

      expect((await mine('')).map((row) => row.id)).not.toContain(group);
      const row = (await mine('&involvement=FOR_ME')).find((item) => item.id === group);
      expect(row).toMatchObject({
        involvement: 'FOR_ME',
        canWithdraw: false,
        myLine: { state: 'SPEND_REJECTED', outcomeReason: 'Only one seat this quarter' },
      });
      expect((await mine('&involvement=ALL')).map((item) => item.id)).toContain(group);
    });

    it('keeps the list of the sender as it was when no involvement is asked for', async () => {
      const rows = h.dataOf<{ items: MyRow[] }>(
        await read('/api/v1/me/access-requests?pageSize=100', design.head.account).expect(200),
      ).items;

      expect(rows.find((row) => row.id === group)).toMatchObject({ involvement: 'SENT', myLine: null });
    });
  });
});
