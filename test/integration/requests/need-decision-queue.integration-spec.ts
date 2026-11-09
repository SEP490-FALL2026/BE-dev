import request from 'supertest';
import type { ApiAccount } from '../../support/api-accounts';
import { GroupHarness } from '../../support/group-harness';
import { PgRelay } from '../../support/pg-relay';
import { dataStatements, QueryCounter, tablesOf } from '../../support/query-count';
import type { Unit } from '../../support/spend-harness';

const h = new GroupHarness();
const MOBILE = { 'User-Agent': 'SLM-Mobile/1.0 (iOS 19)', 'X-Client': 'mobile' } as const;

interface QueueItem {
  requestId: string;
  stepId: string;
  stepKind: string;
  deciderRole: string;
  type: string;
  openedAt: string;
  assignedAt: string | null;
  dueOn: string;
  slaWorkingDays: number;
  lineCount: number;
  beneficiary: { employeeId: string } | null;
  requester: { employeeId: string };
  department: { id: string; code: string };
  termMonths: number | null;
  expectedEndDate: string | null;
  pricing: { status: string; amount: { amount: string; currency: string } | null };
  samePersonAsSpend: boolean;
}
interface QueuePage {
  items: QueueItem[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

/**
 * The queue of the need steps a person holds (US-05-04: open the queue, then the request, then the decision), over HTTP on real
 * PostgreSQL: what the head, the spending approver and nobody else reads; what is never in it (a step that waits, a request that was
 * decided, withdrawn or refused, a request of the caller); the order and the pages; and a fixed number of statements however many
 * requests wait. Handover when a role changes is in `need-decision-queue-handover`.
 */
describe('the queue of the need steps of the person who holds them (integration, real PostgreSQL)', () => {
  let relay: PgRelay;
  let counter: QueryCounter;
  let plan: string;
  let internal: string;
  let design: Unit;
  let engineering: Unit;
  let outsider: Unit;
  let number = 0;

  const read = (account: ApiAccount, query: Record<string, string | number> = {}) =>
    request(h.server())
      .get('/api/v1/need-decisions')
      .query(query)
      .set({ ...h.as(account), ...MOBILE });
  const page = async (account: ApiAccount, query: Record<string, string | number> = {}): Promise<QueuePage> =>
    h.dataOf<QueuePage>(await read(account, { pageSize: 100, ...query }).expect(200));
  const queue = async (account: ApiAccount, query: Record<string, string | number> = {}) =>
    (await page(account, query)).items;
  const idsOf = async (account: ApiAccount, query: Record<string, string | number> = {}) =>
    (await queue(account, query)).map((item) => item.requestId);
  const unit = async (): Promise<Unit> => {
    number += 1;

    return h.departmentWithHead(`P-Q${number}`);
  };
  const colleague = async (u: Unit): Promise<ApiAccount> => {
    number += 1;

    return (await h.staff(u.department, `${u.department.code}-X${number}`, 'EMPLOYEE')).account;
  };
  const withdraw = (id: string, account: ApiAccount) =>
    request(h.server()).post(`/api/v1/access-requests/${id}/withdraw`).set(h.as(account)).send({});
  const spendQueue = async (account: ApiAccount) =>
    h.dataOf<{ items: Array<{ requestId: string; stepKind: string; dueOn: string; samePersonAsSpend: boolean }> }>(
      await request(h.server()).get('/api/v1/spend-approvals').query({ pageSize: 100 }).set(h.as(account)).expect(200),
    ).items;

  beforeAll(async () => {
    await h.start({
      appDatabaseUrl: async (directUrl) => {
        const url = new URL(directUrl);
        relay = await PgRelay.start(url.hostname, Number(url.port || 5432));
        url.port = String(relay.port);

        return url.toString();
      },
    });
    counter = QueryCounter.on(relay);
    await h.withApprover();
    plan = await h.planOf(await h.subscription(100));
    internal = await h.plan('K5');
    design = await unit();
    engineering = await unit();
    outsider = await unit();
  }, 300000);

  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });

  describe('what the head reads of the steps given to them', () => {
    it('lists a request of the department with what it is and what the head decides, and no person but the head reads it', async () => {
      const r1 = await h.sent(design.member, plan, { termMonths: 6, businessReason: 'The project needs a wiki' });

      const [item] = (await queue(design.head.account)).filter((row) => row.requestId === r1.id);

      expect(item).toMatchObject({
        requestId: r1.id,
        stepId: r1.needStep.id,
        stepKind: 'NEED',
        deciderRole: 'MANAGER',
        type: 'GRANT',
        lineCount: 1,
        requester: { employeeId: design.member.employeeId },
        beneficiary: { employeeId: design.member.employeeId },
        department: { id: design.department.id, code: design.department.code },
        // The term is the day it ends now, the last day of the sixth month (`QĐ-104a`), not months.
        termMonths: null,
        expectedEndDate: h.endDated({ termMonths: 6 }).expectedEndDate,
        pricing: { status: 'PRICED' },
      });
      // The head confirms the need alone: no line of the plan is asked, and no term needs a confirmation (QĐ-101n, QĐ-98).
      expect(item).not.toHaveProperty('planLineRequired');
      expect(item).not.toHaveProperty('termConfirmationRequired');
      expect(item.pricing.amount?.currency).toMatch(/^[A-Z]{3}$/);
      expect(Number.isNaN(Date.parse(item.openedAt))).toBe(false);
      expect(item.dueOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(item.slaWorkingDays).toBeGreaterThan(0);
      // The queue opens the request on the route that already reads it, and the caller may decide the step there.
      await request(h.server()).get(`/api/v1/access-requests/${r1.id}`).set(h.as(design.head.account)).expect(200);
    });

    it('shows no price for free software, and the longest term a request may ask for', async () => {
      const free = await h.sent(design.member, internal, { termMonths: 12 });

      const item = (await queue(design.head.account)).find((row) => row.requestId === free.id);

      expect(item).toMatchObject({
        expectedEndDate: h.endDated({ termMonths: 12 }).expectedEndDate,
        pricing: { status: 'NOT_APPLICABLE', amount: null },
      });
    });

    it('carries no figure of a budget, no use of the software and no judgement against a standard set', async () => {
      await h.sent(design.member, plan, { termMonths: 1 });

      const response = await read(design.head.account).expect(200);

      const keys = new Set<string>();
      const walk = (value: unknown): void => {
        if (Array.isArray(value)) value.forEach(walk);
        else if (value && typeof value === 'object') {
          for (const [key, inner] of Object.entries(value)) {
            keys.add(key);
            walk(inner);
          }
        }
      };
      walk(h.dataOf(response));
      expect(
        [...keys].filter((key) =>
          /remaining|committed|spent|held|pending|budget|usage|primaryCode|standard|toolset|ghost/i.test(key),
        ),
      ).toEqual([]);
    });
  });

  describe('nobody reads a step that is not theirs', () => {
    it('shows the other head, the member who asked, a colleague, the IT Admin, Finance and the spending approver nothing of it', async () => {
      const r1 = await h.sent(design.member, plan, { termMonths: 1 });
      const colleagueAccount = await colleague(design);

      expect(await idsOf(design.head.account)).toContain(r1.id);
      for (const account of [
        engineering.head.account,
        design.member.account,
        colleagueAccount,
        h.it1,
        h.finance,
        h.boss.account,
        outsider.member.account,
      ]) {
        expect(await idsOf(account)).not.toContain(r1.id);
      }
    });

    it('is the step given to the caller, not the department or the role of the token: a head of another department has their own', async () => {
      const mine = await h.sent(design.member, plan, { termMonths: 1 });
      const theirs = await h.sent(engineering.member, plan, { termMonths: 1 });

      const designIds = await idsOf(design.head.account);
      const engineeringIds = await idsOf(engineering.head.account);

      expect(designIds).toContain(mine.id);
      expect(designIds).not.toContain(theirs.id);
      expect(engineeringIds).toContain(theirs.id);
      expect(engineeringIds).not.toContain(mine.id);
    });

    it('BR-MF1-02 never shows anybody a need step for the request a head sent for themselves: it is one-step and has none', async () => {
      const own = await h.sent(design.head, internal, { termMonths: 1 });

      expect(own.needStep).toMatchObject({ routingRow: 2, state: 'NOT_REQUIRED', assignee: null });
      expect(await idsOf(design.head.account)).not.toContain(own.id);
      expect(await idsOf(h.boss.account)).not.toContain(own.id);
      expect(await idsOf(design.member.account)).not.toContain(own.id);
    });

    it('BR-MF1-02 gives the approver no need step of a head request, paid or not: the spend step is the only one it has', async () => {
      const own = await h.sent(design.head, plan, { termMonths: 1 });

      expect(
        (await queue(h.boss.account)).find((item) => item.requestId === own.id && item.stepKind === 'NEED'),
      ).toBeUndefined();
      const refused = await request(h.server())
        .post(`/api/v1/access-requests/${own.id}/need-decision`)
        .set(h.as(h.boss.account))
        .send({ decision: 'APPROVE' });
      // There is no need step to decide: the route has none for the approver to reach.
      expect([refused.status, h.codeOf(refused)]).toEqual([404, 'ACCESS_REQUEST.NOT_FOUND']);
    });
  });

  describe('what is never in the queue', () => {
    it('drops a request once it is decided, refused or withdrawn, and keeps the others', async () => {
      const u = await unit();
      const approved = await h.sent(u.member, internal, { termMonths: 1 });
      const refused = await h.sent(u.member, internal, { termMonths: 1 });
      const withdrawn = await h.sent(u.member, internal, { termMonths: 1 });
      const kept = await h.sent(u.member, internal, { termMonths: 1 });
      expect(await idsOf(u.head.account)).toEqual([approved.id, refused.id, withdrawn.id, kept.id]);

      await h.decide(approved.id, { decision: 'APPROVE' }, u.head.account).expect(200);
      await h.decide(refused.id, { decision: 'REJECT', reason: 'Notion already does it' }, u.head.account).expect(200);
      await withdraw(withdrawn.id, u.member.account).expect(200);

      expect(await idsOf(u.head.account)).toEqual([kept.id]);
      expect((await page(u.head.account)).pagination.totalItems).toBe(1);
    });
  });

  describe('a request for a group, decided line by line', () => {
    it('shows the head the people of an Employee request as one step, and no one person it is for', async () => {
      const u = await unit();
      const [e1, e2, e3] = await h.colleagues(u, 3);
      const sent = h.dataOf<{ request: { id: string } }>(
        await h.submitGroup(h.groupBody(plan, [e1, e2, e3]), e1.account).expect(201),
      ).request;

      const [item] = (await queue(u.head.account)).filter((row) => row.requestId === sent.id);

      expect(item).toMatchObject({ type: 'GROUP_GRANT', deciderRole: 'MANAGER', beneficiary: null, lineCount: 3 });
      expect(item.requester.employeeId).toBe(e1.employeeId);
      for (const person of [e1, e2, e3]) expect(await idsOf(person.account)).not.toContain(sent.id);
      expect(await idsOf(h.boss.account)).not.toContain(sent.id);

      await h
        .decideLines(
          sent.id,
          {
            lines: [
              { employeeId: e1.employeeId, decision: 'APPROVE' },
              { employeeId: e2.employeeId, decision: 'REJECT', reason: 'Not needed' },
              { employeeId: e3.employeeId, decision: 'APPROVE' },
            ],
          },
          u.head.account,
        )
        .expect(200);
      expect(await idsOf(u.head.account)).not.toContain(sent.id);
    });

    it('BR-MF1-02 refuses a group that names the head (HEAD_IN_GROUP), so there is no line of the head for the approver to decide', async () => {
      const u = await unit();
      const [e1, e2] = await h.colleagues(u, 2);
      const before = await h.requestRows();

      const refused = await h.submitGroup(h.groupBody(plan, [e1, e2, u.head]), u.head.account).expect(422);

      expect(h.codeOf(refused)).toBe('GROUP_REQUEST.LINES_REFUSED');
      expect(h.detailsOf(refused)).toMatchObject({
        lines: [{ employeeId: u.head.employeeId, reason: 'HEAD_IN_GROUP' }],
      });
      expect(await h.requestRows()).toBe(before);
    });

    it('filters by the kind of request, so a phone that does not decide groups can leave them out', async () => {
      const u = await unit();
      const [e1, e2] = await h.colleagues(u, 2);
      const single = await h.sent(u.member, plan, { termMonths: 1 });
      const group = h.dataOf<{ request: { id: string } }>(
        await h.submitGroup(h.groupBody(plan, [e1, e2]), e1.account).expect(201),
      ).request;

      expect(await idsOf(u.head.account, { type: 'GRANT' })).toEqual([single.id]);
      expect(await idsOf(u.head.account, { type: 'GROUP_GRANT' })).toEqual([group.id]);
      expect(await idsOf(u.head.account, { type: 'RENEWAL' })).toEqual([]);
      expect((await page(u.head.account, { type: 'GRANT' })).pagination.totalItems).toBe(1);
      expect(await idsOf(u.head.account)).toEqual([single.id, group.id]);
    });
  });

  describe('the order and the pages', () => {
    it('lists the oldest first with the id breaking a tie, and cuts pages that neither repeat nor skip a request', async () => {
      const u = await unit();
      const sent: string[] = [];
      for (let index = 0; index < 5; index += 1) sent.push((await h.sent(u.member, internal, { termMonths: 1 })).id);
      const all = await queue(u.head.account);
      expect(all.map((item) => item.requestId)).toEqual(sent);
      const keys = all.map((item) => `${item.openedAt} ${item.stepId}`);
      expect(keys).toEqual([...keys].sort());

      const pages = [
        await page(u.head.account, { pageSize: 2, page: 1 }),
        await page(u.head.account, { pageSize: 2, page: 2 }),
        await page(u.head.account, { pageSize: 2, page: 3 }),
        await page(u.head.account, { pageSize: 2, page: 4 }),
      ];

      expect(pages.map((one) => one.items.length)).toEqual([2, 2, 1, 0]);
      expect(pages.map((one) => one.pagination)).toEqual([
        { page: 1, pageSize: 2, totalItems: 5, totalPages: 3 },
        { page: 2, pageSize: 2, totalItems: 5, totalPages: 3 },
        { page: 3, pageSize: 2, totalItems: 5, totalPages: 3 },
        { page: 4, pageSize: 2, totalItems: 5, totalPages: 3 },
      ]);
      expect(pages.flatMap((one) => one.items.map((item) => item.requestId))).toEqual(sent);
    });

    it('orders steps that began at the same instant by their id, the same on every read', async () => {
      const u = await unit();
      const sent: string[] = [];
      for (let index = 0; index < 4; index += 1) sent.push((await h.sent(u.member, internal, { termMonths: 1 })).id);
      await h.ctx.sql.query(
        `UPDATE access_request_steps SET created_at = '2026-01-05T02:00:00Z' WHERE request_id = ANY($1::uuid[]) AND kind = 'NEED'`,
        [sent],
      );

      const first = await queue(u.head.account);
      const second = await queue(u.head.account);
      const byPages = [
        ...(await page(u.head.account, { pageSize: 3, page: 1 })).items,
        ...(await page(u.head.account, { pageSize: 3, page: 2 })).items,
      ];

      const stepIds = first.map((item) => item.stepId);
      expect(stepIds).toEqual([...stepIds].sort());
      expect(second.map((item) => item.stepId)).toEqual(stepIds);
      expect(byPages.map((item) => item.stepId)).toEqual(stepIds);
    });

    it('moves up what was behind a request that was decided, with nothing repeated', async () => {
      const u = await unit();
      const sent: string[] = [];
      for (let index = 0; index < 3; index += 1) sent.push((await h.sent(u.member, internal, { termMonths: 1 })).id);

      await h.decide(sent[0], { decision: 'APPROVE' }, u.head.account).expect(200);

      expect(await idsOf(u.head.account, { pageSize: 2 })).toEqual([sent[1], sent[2]]);
    });
  });

  describe('the cost of a page', () => {
    it('reads a page in a fixed number of statements however many requests wait, and never a budget or a check', async () => {
      const few = await unit();
      const many = await unit();
      await h.sent(few.member, plan, { termMonths: 1 });
      for (let index = 0; index < 6; index += 1) {
        await h.sent(many.member, index % 2 === 0 ? plan : internal, { termMonths: 1 });
      }
      const [e1, e2] = await h.colleagues(many, 2);
      await h.submitGroup(h.groupBody(plan, [e1, e2]), e1.account).expect(201);

      const statements = async (account: ApiAccount) => {
        const run = await counter.run(() => read(account).expect(200));

        return dataStatements(run.statements);
      };
      const small = await statements(few.head.account);
      const large = await statements(many.head.account);

      expect((await page(many.head.account)).pagination.totalItems).toBe(7);
      expect(large.length).toBe(small.length);
      const tables = new Set(large.flatMap(tablesOf));
      for (const table of [
        'budget_commitments',
        'request_budget_checks',
        'budget_versions',
        'budget_version_lines',
        'license_assignments',
      ]) {
        expect(tables.has(table)).toBe(false);
      }
    });
  });

  describe('the request of the approver is where it was on the other list (B-10)', () => {
    it('gives the spend steps the same key and a due day, so the phone can put the two lists in one', async () => {
      const u = await unit();
      await h.budgetFor(u, { total: 100_000_000 });
      const r1 = await h.waitingForApprover(u, plan, { amount: 1_000_000 });

      const item = (await spendQueue(h.boss.account)).find((row) => row.requestId === r1);

      expect(item).toMatchObject({ stepKind: 'SPEND_APPROVAL' });
      expect(item?.dueOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(await idsOf(h.boss.account)).not.toContain(r1);
    });
  });
});
