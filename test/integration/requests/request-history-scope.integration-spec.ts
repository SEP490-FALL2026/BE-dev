import request from 'supertest';
import type { ApiAccount } from '../../support/api-accounts';
import { GroupHarness } from '../../support/group-harness';
import type { Person } from '../../support/request-harness';
import type { Unit } from '../../support/spend-harness';

const h = new GroupHarness();

interface HistoryRow {
  id: string;
  state: string;
  requester: { employeeId: string };
  department: { id: string; code: string };
  routing: { mode: string; oneStepReason: string | null };
  reserveUsed: boolean;
  flags: { manyPaidSoftware: { count: number; reason: string } | null };
  awaitingMe?: boolean;
}
interface HistoryPage {
  items: HistoryRow[];
  pagination: { totalItems: number };
}
interface FlagRow {
  requestId: string;
  flag: string;
  routingReason: string | null;
  requester: { employeeId: string };
  department: { id: string };
  grant: { itAdmin: { employeeId: string } | null; completedAt: string } | null;
}

/**
 * The histories of requests by role over real PostgreSQL (`FR-3.7`, `SoD-1`, `SoD-3`, `SoD-7`): a request that was decided, granted or
 * refused stays in the history of the head of its department, of the spending approver once it reached the spend step, of Finance once its
 * spend was approved, and of the IT Admin; nobody reads more than their role reaches; the Super Admin reads only the narrow flag of the
 * audit report. The detail of each request by role is in `request-read-by-role.integration-spec.ts`.
 */
describe('the histories of requests by role (integration, real PostgreSQL)', () => {
  let paid: string;
  let design: Unit;
  let finance: Unit;
  let headless: { department: Unit['department']; member: Person; head: Person };
  const r: Record<string, string> = {};

  const get = (path: string, account: ApiAccount, query: Record<string, string | number> = {}) =>
    request(h.server()).get(path).query(query).set(h.as(account));
  const asAdmin = (path: string, query: Record<string, string | number> = {}) =>
    request(h.server())
      .get(path)
      .query(query)
      .set({ Authorization: `Bearer ${h.admin}` });
  const idsOf = async (path: string, account: ApiAccount, query: Record<string, string | number> = {}) =>
    h.dataOf<HistoryPage>(await get(path, account, { pageSize: 100, ...query }).expect(200)).items.map((row) => row.id);
  const departmentPath = (unit: { department: { id: string } }) =>
    `/api/v1/departments/${unit.department.id}/access-requests`;

  /** An internal request granted to the end by the IT Admin: the task made, claimed and completed with evidence. */
  const grantToTheEnd = async (requestId: string) => {
    const task = h.dataOf<{ task: { id: string } }>(await h.grant({ requestId }).expect(201)).task;
    await h.claim(task.id).expect(200);
    await h.complete(task.id, { evidence: 'Added to the portal' }).expect(200);
  };

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    paid = await h.planOf(await h.subscription(100));
    design = await h.departmentWithHead('P-RHD');
    finance = await h.departmentWithHead('P-RHF');
    await h.budgetFor(design, { total: 100_000_000 });
    await h.setItAdminInCharge(design.department, { employeeId: h.it1.employeeId, account: h.it1 });

    // Waiting for the head, and refused by the head: the spend step is never reached.
    r.waiting = (await h.sent(design.member, paid, { termMonths: 1 })).id;
    r.refused = (await h.sent(design.member, paid, { termMonths: 1 })).id;
    await h.decide(r.refused, { decision: 'REJECT', reason: 'Not this quarter' }, design.head.account).expect(200);
    // Sent on as spend: one waits for the approver, one was approved (a commitment was made).
    r.spendWaiting = await h.waitingForApprover(design, paid, { amount: 10_000_000 });
    r.spendApproved = await h.waitingForApprover(design, paid, { amount: 10_000_000 });
    await h.decideSpend(r.spendApproved, { decision: 'APPROVE' }, h.boss.account).expect(200);
    // Internal software through the head, granted to the end: never flagged.
    const internalViaHead = await h.plan('K5');
    r.internalViaHead = (await h.sent(design.member, internalViaHead)).id;
    await h.decide(r.internalViaHead, { decision: 'APPROVE' }, design.head.account).expect(200);
    await grantToTheEnd(r.internalViaHead);
    // The head's own internal request: one step, no need approver, granted by IT1.
    r.headOwn = (await h.sent(design.head, await h.plan('K5'))).id;
    await grantToTheEnd(r.headOwn);
    // A request of another department.
    r.other = (await h.sent(finance.member, paid, { termMonths: 1 })).id;
    // A department with no head: its member's internal request goes one step; a head is named only after.
    const lonely = await h.departmentWithUnit('P-RHN');
    const lonelyMember = await h.staff(lonely, 'RHN-E1');
    r.noHead = (await h.sent(lonelyMember, await h.plan('K5'))).id;
    const lonelyHead = await h.staff(lonely, 'RHN-H1');
    await h.makeHead(lonely, lonelyHead);
    headless = { department: lonely, member: lonelyMember, head: lonelyHead };
  }, 600000);

  afterAll(async () => {
    await h.stop();
  });

  describe('the head of a department (departmentAccessRequestList)', () => {
    it('reads every request of the department, the decided, granted and refused ones included, and none of another', async () => {
      const ids = await idsOf(departmentPath(design), design.head.account);

      expect(ids).toEqual(
        expect.arrayContaining([r.waiting, r.refused, r.spendWaiting, r.spendApproved, r.internalViaHead, r.headOwn]),
      );
      expect(ids).not.toContain(r.other);
      expect(ids).not.toContain(r.noHead);
    });

    it('keeps an approved request in the history of the head after it left the queue (the bug FE reported)', async () => {
      const rows = h.dataOf<HistoryPage>(
        await get(departmentPath(design), design.head.account, { pageSize: 100 }).expect(200),
      ).items;
      const approved = rows.find((row) => row.id === r.spendApproved);
      const granted = rows.find((row) => row.id === r.internalViaHead);

      expect(approved).toMatchObject({ state: 'AWAITING_EXECUTION', awaitingMe: false });
      expect(granted).toMatchObject({ state: 'COMPLETED', awaitingMe: false });
      expect(rows.find((row) => row.id === r.waiting)).toMatchObject({ state: 'PENDING', awaitingMe: true });
      expect(rows.find((row) => row.id === r.headOwn)).toMatchObject({
        routing: { mode: 'ONE_STEP', oneStepReason: 'REQUESTER_IS_HEAD' },
        requester: { employeeId: design.head.employeeId },
        department: { id: design.department.id },
      });
    });

    it('narrows by state, by view and by a person of the department', async () => {
      expect(await idsOf(departmentPath(design), design.head.account, { state: 'COMPLETED' })).toEqual(
        expect.arrayContaining([r.internalViaHead, r.headOwn]),
      );
      expect(await idsOf(departmentPath(design), design.head.account, { view: 'open' })).not.toContain(r.refused);
      const ofMember = await idsOf(departmentPath(design), design.head.account, {
        employeeId: design.member.employeeId,
      });
      expect(ofMember).toContain(r.waiting);
      expect(ofMember).not.toContain(r.headOwn);
    });

    it('reads a request of the department sent before they became its head', async () => {
      expect(await idsOf(departmentPath(headless), headless.head.account)).toEqual([r.noHead]);
    });

    it('turns away the head of another department, 403 OUT_OF_SCOPE, and a department that does not exist, 404', async () => {
      expect(h.codeOf(await get(departmentPath(finance), design.head.account).expect(403))).toBe(
        'ACCESS_REQUEST_HISTORY.OUT_OF_SCOPE',
      );
      expect(
        h.codeOf(
          await get(
            '/api/v1/departments/3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d99/access-requests',
            design.head.account,
          ).expect(404),
        ),
      ).toBe('ACCESS_REQUEST_HISTORY.DEPARTMENT_NOT_FOUND');
    });

    it('turns away an Employee and the Super Admin, 403 AUTHORIZATION.FORBIDDEN', async () => {
      expect(h.codeOf(await get(departmentPath(design), design.member.account).expect(403))).toBe(
        'AUTHORIZATION.FORBIDDEN',
      );
      expect(h.codeOf(await asAdmin(departmentPath(design)).expect(403))).toBe('AUTHORIZATION.FORBIDDEN');
    });
  });

  describe('the roles that oversee the organization (accessRequestList)', () => {
    const PATH = '/api/v1/access-requests';

    it('gives the IT Admin every request sent, of every department, and narrows by department, person and state', async () => {
      const all = await idsOf(PATH, h.it1);
      expect(all).toEqual(expect.arrayContaining(Object.values(r)));

      expect(await idsOf(PATH, h.it1, { departmentId: finance.department.id })).toEqual([r.other]);
      expect(await idsOf(PATH, h.it1, { employeeId: design.member.employeeId })).not.toContain(r.headOwn);
      expect(await idsOf(PATH, h.it1, { state: 'REJECTED' })).toContain(r.refused);
      expect(await idsOf(PATH, h.it1, { flag: 'ONE_STEP' })).toEqual(expect.arrayContaining([r.headOwn, r.noHead]));
      expect(await idsOf(PATH, h.it1, { flag: 'ONE_STEP' })).not.toContain(r.waiting);
    });

    it('gives the spending approver the requests that reached the spend step, decided or not, and nothing before it (SoD-7)', async () => {
      const ids = await idsOf(PATH, h.boss.account);

      expect(ids).toEqual(expect.arrayContaining([r.spendWaiting, r.spendApproved]));
      for (const before of [r.waiting, r.refused, r.internalViaHead, r.headOwn, r.other])
        expect(ids).not.toContain(before);
    });

    it('gives Finance the requests whose spend was approved, and not one still waiting for the approver (SoD-3)', async () => {
      const ids = await idsOf(PATH, h.finance);

      expect(ids).toContain(r.spendApproved);
      for (const other of [r.spendWaiting, r.waiting, r.refused, r.internalViaHead, r.headOwn])
        expect(ids).not.toContain(other);
    });

    it('turns away the Super Admin, a head and an Employee, 403 AUTHORIZATION.FORBIDDEN (SoD-1)', async () => {
      expect(h.codeOf(await asAdmin(PATH).expect(403))).toBe('AUTHORIZATION.FORBIDDEN');
      expect(h.codeOf(await get(PATH, design.head.account).expect(403))).toBe('AUTHORIZATION.FORBIDDEN');
      expect(h.codeOf(await get(PATH, design.member.account).expect(403))).toBe('AUTHORIZATION.FORBIDDEN');
    });

    it('BR-MF1-01g GH-3: says on the row the flag the request was sent with, how many paid applications and why, and null otherwise', async () => {
      await h.ctx.sql.query(
        `UPDATE access_requests SET many_paid_software = true, many_paid_software_count = 12, many_paid_software_reason = $2 WHERE id = $1`,
        [r.other, 'Needs both design suites for the client'],
      );
      const rows = h.dataOf<HistoryPage>(await get(PATH, h.it1, { pageSize: 100 }).expect(200)).items;
      const byId = new Map(rows.map((row) => [row.id, row]));

      expect(byId.get(r.other)?.flags).toEqual({
        manyPaidSoftware: { count: 12, reason: 'Needs both design suites for the client' },
      });
      expect(byId.get(r.waiting)?.flags).toEqual({ manyPaidSoftware: null });
      expect(byId.get(r.other)?.reserveUsed).toBe(false);
    });

    it('answers no figure of money on a row', async () => {
      const page = h.dataOf<HistoryPage>(await get(PATH, h.it1, { pageSize: 100 }).expect(200));

      expect(JSON.stringify(page.items)).not.toMatch(/amount|price|budget|commitment|"check/i);
    });
  });

  describe('the audit report of the Super Admin (accessRequestAuditFlagList)', () => {
    const PATH = '/api/v1/access-request-audit-flags';

    it('lists the free internal requests no head approved, with the IT Admin who granted it and when, and nothing else', async () => {
      const rows = h.dataOf<{ items: FlagRow[] }>(await asAdmin(PATH, { pageSize: 100 }).expect(200)).items;
      const own = rows.find((row) => row.requestId === r.headOwn);
      const noHead = rows.find((row) => row.requestId === r.noHead);

      expect(own).toMatchObject({
        flag: 'NO_NEED_APPROVER',
        routingReason: 'REQUESTER_IS_HEAD',
        requester: { employeeId: design.head.employeeId },
        grant: { itAdmin: { employeeId: h.it1.employeeId }, completedAt: expect.any(String) as string },
      });
      expect(noHead).toMatchObject({ routingReason: 'NO_DEPARTMENT_HEAD', grant: null });
      expect(rows.map((row) => row.requestId)).not.toContain(r.internalViaHead);
      expect(JSON.stringify(rows)).not.toMatch(/amount|price|budget|commitment|evidence/i);
    });

    it('flags exactly the requests whose sending recorded that no head approved the need', async () => {
      const rows = h.dataOf<{ items: FlagRow[] }>(await asAdmin(PATH, { pageSize: 100 }).expect(200)).items;
      const audited = (
        await h.ctx.sql.query<{ resource_id: string }>(
          `SELECT DISTINCT resource_id FROM audit_events WHERE action = 'ACCESS_REQUEST.NO_NEED_APPROVER'`,
        )
      ).rows.map((row) => row.resource_id);

      expect(rows.map((row) => row.requestId).sort()).toEqual([...audited].sort());
    });

    it.each([
      ['the IT Admin', () => h.it1],
      ['the spending approver', () => h.boss.account],
      ['Finance', () => h.finance],
      ['a head', () => design.head.account],
      ['an Employee', () => design.member.account],
    ])('turns away %s, 403 AUTHORIZATION.FORBIDDEN', async (_who, account) => {
      expect(h.codeOf(await get(PATH, account()).expect(403))).toBe('AUTHORIZATION.FORBIDDEN');
    });
  });

  describe('pages', () => {
    it('reads the history of the IT Admin in pages that neither repeat nor skip a request', async () => {
      const all = await idsOf('/api/v1/access-requests', h.it1);
      const paged: string[] = [];
      for (let page = 1; page <= Math.ceil(all.length / 3); page += 1) {
        paged.push(...(await idsOf('/api/v1/access-requests', h.it1, { page, pageSize: 3 })));
      }

      expect(paged).toEqual(all);
    });
  });
});
