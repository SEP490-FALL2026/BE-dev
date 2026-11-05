import request from 'supertest';
import type { ApiAccount } from '../../support/api-accounts';
import { GroupHarness } from '../../support/group-harness';
import type { Person } from '../../support/request-harness';
import type { Unit } from '../../support/spend-harness';

const h = new GroupHarness();
const M = 1_000_000;
const PATH = '/api/v1/me/access-requests';
const ANY_STRING: unknown = expect.any(String);
const ANY_MOMENT: unknown = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/);

interface EmployeeRef {
  employeeId: string;
  employeeCode: string;
  fullName: string;
}
interface RowWire {
  id: string;
  type: string;
  branch: string;
  state: string;
  plan: { planId: string; planName: string; applicationName: string } | null;
  softwareName: string | null;
  beneficiary: EmployeeRef | null;
  lineCount: number;
  termMonths: number;
  submittedAt: string;
  updatedAt: string;
  needStep: { state: string; assignee: EmployeeRef | null; waitingReason: string | null };
  spend: { stage: string } | null;
  outcome: { reason: string | null } | null;
  withdrawal: { withdrawnAt: string | null } | null;
  canWithdraw: boolean;
}
interface PageWire {
  items: RowWire[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

/**
 * "My requests" over real HTTP and PostgreSQL (`US-16-01` AC-2, `US-12-15` AC-2): whose requests are listed (the person who sent
 * them, and nobody else: not a colleague of the department, not the head who holds the step, not the IT Admin, Finance or the spending
 * approver, not the person a head sent it for), what a row says in each state, and that it says what the detail says. Ordering,
 * paging, narrowing and the count of statements are in `my-requests-read.integration-spec.ts`.
 */
describe('my requests: whose they are and what a row says (integration, real PostgreSQL)', () => {
  let paid: string;
  let internal: string;
  let design: Unit;
  let e1: Person;
  let e2: Person;
  let outsider: Person;
  let counter = 0;

  const list = (account: ApiAccount, query: Record<string, string | number> = {}) =>
    request(h.server()).get(PATH).query(query).set(h.as(account));
  const page = async (account: ApiAccount, query: Record<string, string | number> = {}) =>
    h.dataOf<PageWire>(await list(account, { pageSize: 100, ...query }).expect(200));
  const idsOf = async (account: ApiAccount, query: Record<string, string | number> = {}) =>
    (await page(account, query)).items.map((item) => item.id);
  const rowOf = async (account: ApiAccount, id: string) => {
    const row = (await page(account)).items.find((item) => item.id === id);
    if (!row) throw new Error(`The request ${id} is not in the list.`);

    return row;
  };
  const detail = async (id: string, account: ApiAccount) =>
    h.dataOf<{ request: { state: string; spend: { stage: string; refusalReason: string | null } | null } }>(
      await h.fetch(id, account).expect(200),
    ).request;
  const employee = async (roles: string[] = ['EMPLOYEE']) => {
    counter += 1;

    return h.staff(design.department, `MR-X${counter}`, roles[0] ?? 'EMPLOYEE');
  };
  const ref = (person: Person) => ({ employeeId: person.employeeId, employeeCode: ANY_STRING, fullName: ANY_STRING });

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    paid = await h.planOf(await h.subscription(100));
    internal = await h.plan('K5');
    design = await h.departmentWithHead('P-MR1');
    e1 = await h.staff(design.department, 'MR-E1', 'EMPLOYEE');
    e2 = await h.staff(design.department, 'MR-E2', 'EMPLOYEE');
    const other = await h.departmentWithHead('P-MR2');
    outsider = await h.staff(other.department, 'MR-O1', 'EMPLOYEE');
    await h.budgetFor(design, { total: 100 * M, held: 20 * M, spent: 40 * M });
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  describe('the people whose requests are not the caller’s (IDOR)', () => {
    it('lists to each Employee what they sent and to nobody else a line of it, a colleague of the same department included', async () => {
      const r1 = await h.sent(e1, internal);
      const r2 = await h.sent(e1, paid, { termMonths: 1 });
      const r3 = await h.sent(e2, internal);
      const r4 = await h.sent(outsider, internal);

      const first = await page(e1.account);
      const second = await page(e2.account);

      expect(first.items.map((item) => item.id)).toEqual([r2.id, r1.id]);
      expect(second.items.map((item) => item.id)).toEqual([r3.id]);
      expect(await idsOf(outsider.account)).toEqual([r4.id]);
      expect(first.pagination).toEqual({ page: 1, pageSize: 100, totalItems: 2, totalPages: 1 });
      // The colleague's name, id and code appear nowhere in the answer of the other.
      for (const [answer, other] of [
        [first, e2],
        [second, e1],
      ] as const) {
        const text = JSON.stringify(answer);
        expect(text).not.toContain(other.employeeId);
        expect(text).not.toContain(other === e1 ? 'MR-E1' : 'MR-E2');
      }
    });

    it('lists nothing to the head who holds the need step of their people, the IT Admin, Finance and the spending approver', async () => {
      const waiting = await h.sent(e1, paid, { termMonths: 1 });
      expect(waiting.needStep.assignee?.employeeId).toBe(design.head.employeeId);

      for (const account of [design.head.account, h.it1, h.finance, h.boss.account]) {
        const answer = await page(account);

        expect(answer.items).toEqual([]);
        expect(answer.pagination.totalItems).toBe(0);
      }
      // What the head reads of it is its detail, which the list does not replace.
      expect((await detail(waiting.id, design.head.account)).state).toBe('PENDING');
    });

    it('lists to a department head who holds no Employee role only what the head sent for themselves', async () => {
      const unit = await h.departmentWithHead('P-MR-H');
      expect(unit.head.account.employeeId).toBe(unit.head.employeeId);
      const mine = await h.sent(unit.head, internal);
      await h.sent(unit.member, internal);

      const answer = await page(unit.head.account);

      expect(answer.items.map((item) => item.id)).toEqual([mine.id]);
      expect(answer.items[0]).toMatchObject({ beneficiary: ref(unit.head) });
      // A head's own request is never decided by the head: the step is held by somebody else, or waits under control.
      expect(answer.items[0].needStep.assignee?.employeeId).not.toBe(unit.head.employeeId);
    });

    it('answers the Super Admin an empty own page and lists another caller own requests', async () => {
      const refused = await request(h.server())
        .get(PATH)
        .set({ Authorization: `Bearer ${h.admin}` })
        .expect(200);
      const bare = await employee([]);
      const own = await h.sent(bare, internal);

      expect(h.dataOf<{ items: unknown[] }>(refused).items).toEqual([]);
      expect(await idsOf(bare.account)).toEqual([own.id]);
    });

    it('does not take a parameter that names a person: the caller cannot read the list of somebody else by asking', async () => {
      const response = await list(e1.account, { employeeId: e2.employeeId }).expect(422);

      expect(h.codeOf(response)).toBe('VALIDATION_ERROR');
      expect(JSON.stringify(response.body)).not.toContain('MR-E2');
    });
  });

  describe('sent on behalf, for a group, for a service account (creator is not beneficiary)', () => {
    it('lists to the head the requests they sent for a colleague, naming the colleague, and to the colleague none of them', async () => {
      const unit = await h.departmentWithHead('P-MR-D');
      const colleague = await h.colleague(unit);
      const sentFor = h.dataOf<{ batchId: string; requests: Array<{ id: string }> }>(
        await h
          .sendDelegated(
            {
              beneficiaryEmployeeIds: [colleague.employeeId],
              items: [{ planId: internal }],
              businessReason: 'The new designer needs the tool',
              termMonths: 6,
            },
            unit.head.account,
          )
          .expect(201),
      );
      const [made] = sentFor.requests;

      const headList = await page(unit.head.account);
      const colleagueList = await page(colleague.account);

      expect(headList.items.map((item) => item.id)).toEqual([made.id]);
      expect(headList.items[0]).toMatchObject({ type: 'GRANT', lineCount: 1, beneficiary: ref(colleague) });
      // The person it is for does not see it in the list (the owner has not decided otherwise), but reads it by its address.
      expect(colleagueList.items).toEqual([]);
      expect((await detail(made.id, colleague.account)).state).not.toBeUndefined();
    });

    it('lists a request for a group to the head who sent it, as one row with no person, and to the people of it none', async () => {
      const unit = await h.departmentWithHead('P-MR-G');
      await h.roomFor(unit);
      const people = await h.colleagues(unit, 2);
      const id = await h.groupWaiting(unit, paid, people);

      const row = await rowOf(unit.head.account, id);

      expect(row).toMatchObject({
        type: 'GROUP_GRANT',
        beneficiary: null,
        lineCount: 2,
        outcome: null,
        spend: { stage: ANY_STRING },
      });
      for (const person of people) expect(await idsOf(person.account)).toEqual([]);
    });

    it('lists the request for a service account to the one who sent it', async () => {
      const person = await employee();
      // A request for a service account is sent once the seat baseline of the installation is closed.
      await h.closeBaseline().expect(200);
      const response = await request(h.server())
        .post('/api/v1/access-requests/service-accounts')
        .set(h.as(person.account))
        .send({
          planId: internal,
          purpose: 'Build bot of the CI pipeline',
          expectedIdentifier: 'ci-bot-2',
          businessReason: 'Run the builds of the product',
          termMonths: 1,
        })
        .expect(201);
      const sent = h.dataOf<{ request: { id: string } }>(response).request;

      const rows = (await page(person.account)).items;

      expect(rows.map((item) => [item.id, item.type])).toEqual([[sent.id, 'SERVICE_ACCOUNT']]);
      expect(await idsOf(e1.account)).not.toContain(sent.id);
    });

    it('does not list a draft, which is read with the drafts of the caller, and lists the request once it is sent', async () => {
      const person = await employee();
      const draft = h.dataOf<{ draft: { id: string } }>(
        await request(h.server())
          .post('/api/v1/access-requests/drafts')
          .set(h.as(person.account))
          .send({ kind: 'INDIVIDUAL', planId: paid, businessReason: 'Design the new brand', termMonths: 6 })
          .expect(201),
      ).draft;

      const drafts = h.dataOf<{ items: Array<{ id: string }> }>(
        await request(h.server()).get('/api/v1/access-requests/drafts').set(h.as(person.account)).expect(200),
      );
      expect(drafts.items.map((item) => item.id)).toEqual([draft.id]);
      expect(await idsOf(person.account)).toEqual([]);

      await request(h.server())
        .post(`/api/v1/access-requests/drafts/${draft.id}/submission`)
        .set(h.as(person.account))
        .send({})
        .expect(201);

      expect(await idsOf(person.account)).toEqual([draft.id]);
    });
  });

  describe('what a row says in each state, and that it is what the detail says', () => {
    it('says who a request waits for and lets the sender withdraw it, and says who it waits for after the head is changed', async () => {
      const unit = await h.departmentWithHead('P-MR-W');
      const person = await h.staff(unit.department, 'MR-W1', 'EMPLOYEE');
      const sent = await h.sent(person, internal);

      const before = await rowOf(person.account, sent.id);
      expect(before).toMatchObject({
        state: 'PENDING',
        branch: 'INTERNAL_FREE',
        needStep: { state: 'PENDING', assignee: ref(unit.head), waitingReason: null },
        spend: null,
        outcome: null,
        withdrawal: null,
        canWithdraw: true,
        plan: { planId: internal },
        softwareName: null,
        beneficiary: ref(person),
        lineCount: 1,
        termMonths: 6,
      });

      // The head changes hands, and the step follows: the next read names the new head and not the old.
      const successor = await h.staff(unit.department, 'MR-W2');
      await h.vacateHead(unit.department.id).expect(200);
      await h.makeHead(unit.department, successor);
      const after = await rowOf(person.account, sent.id);

      expect(after.needStep.assignee).toMatchObject({ employeeId: successor.employeeId });
      expect(after.needStep.assignee?.employeeId).not.toBe(before.needStep.assignee?.employeeId);
    });

    it('says a request waits under control with nobody to hold it, and the reason', async () => {
      const unit = await h.departmentWithHead('P-MR-V');
      const person = await h.staff(unit.department, 'MR-V1', 'EMPLOYEE');
      const sent = await h.sent(person, internal);
      await h.vacateHead(unit.department.id).expect(200);

      const row = await rowOf(person.account, sent.id);

      expect(row).toMatchObject({
        state: 'WAITING_CONTROLLED',
        needStep: { state: 'WAITING', assignee: null, waitingReason: ANY_STRING },
        canWithdraw: true,
      });
    });

    it('says refused with the reason of the head, completed with nobody to wait for, and withdrawn with the moment', async () => {
      const unit = await h.departmentWithHead('P-MR-S');
      const person = await h.staff(unit.department, 'MR-S1', 'EMPLOYEE');
      const refused = await h.sent(person, paid, { termMonths: 1 });
      await h.decide(refused.id, { decision: 'REJECT', reason: 'The team already has seats' }, unit.head.account);
      const done = await h.sent(person, internal);
      await h.decide(done.id, { decision: 'APPROVE' }, unit.head.account).expect(200);
      const task = h.dataOf<{ task: { id: string } }>(await h.grant({ requestId: done.id }).expect(201)).task;
      await h.claim(task.id).expect(200);
      await h.complete(task.id, { evidence: 'Added to the portal' }).expect(200);
      const withdrawn = await h.sent(person, await h.plan('K5'));
      await h.withdrawRequest(withdrawn.id, { reason: 'No longer needed' }, person.account).expect(200);

      const rows = new Map((await page(person.account)).items.map((item) => [item.id, item]));

      expect(rows.get(refused.id)).toMatchObject({
        state: 'REJECTED',
        outcome: { reason: 'The team already has seats' },
        spend: null,
        canWithdraw: false,
        needStep: { state: 'REJECTED', assignee: null },
      });
      expect(rows.get(done.id)).toMatchObject({
        state: 'COMPLETED',
        outcome: null,
        canWithdraw: false,
        needStep: { state: 'APPROVED', assignee: null },
      });
      expect(rows.get(withdrawn.id)).toMatchObject({
        state: 'WITHDRAWN',
        outcome: null,
        canWithdraw: false,
        withdrawal: { withdrawnAt: ANY_MOMENT },
      });
      // The list and the detail say the same of the state of every one of them.
      for (const id of [refused.id, done.id, withdrawn.id]) {
        expect(rows.get(id)?.state).toBe((await detail(id, person.account)).state);
      }
    });

    it('says the stage on the way to the spending approver as the detail does, and the reason of the approver who refused', async () => {
      const unit = await h.departmentWithHead('P-MR-P');
      await h.budgetFor(unit, { total: 100 * M, held: 20 * M, spent: 40 * M });
      const queued = await h.paidRequest(unit, paid);
      const waiting = await h.waitingForApprover(unit, paid, { amount: 15 * M });
      const refused = await h.waitingForApprover(unit, paid, { amount: 15 * M });
      await h.decideSpend(refused, { decision: 'REJECT', reason: 'Not this quarter' }, h.boss.account).expect(200);

      const rows = new Map((await page(unit.member.account)).items.map((item) => [item.id, item]));

      expect(rows.get(queued)).toMatchObject({ state: 'AWAITING_SPEND_SUBMISSION', spend: { stage: 'NOT_SUBMITTED' } });
      expect(rows.get(waiting)).toMatchObject({
        state: 'AWAITING_SPEND_DECISION',
        spend: { stage: 'WAITING_SPEND_DECISION' },
        needStep: { state: 'APPROVED', assignee: null },
        canWithdraw: true,
      });
      expect(rows.get(refused)).toMatchObject({
        state: 'REJECTED',
        spend: { stage: 'REFUSED' },
        outcome: { reason: 'Not this quarter' },
        canWithdraw: false,
      });
      for (const id of [queued, waiting, refused]) {
        const wire = await detail(id, unit.member.account);
        expect(rows.get(id)?.spend?.stage).toBe(wire.spend?.stage);
      }
      expect((await detail(refused, unit.member.account)).spend?.refusalReason).toBe('Not this quarter');
    });

    it('says what the IT Admin wrote when they refused software that is not in the catalog, and names the software proposed', async () => {
      const unit = await h.departmentWithHead('P-MR-I');
      await h.setItAdminInCharge(unit.department, { employeeId: h.it1.employeeId, account: h.it1 });
      const proposed = await h.proposed(unit.member, { softwareName: 'Miro Boards' });
      await h.decide(proposed.id, { decision: 'APPROVE' }, unit.head.account).expect(200);
      const pending = await h.proposed(unit.member, { softwareName: 'Notion Calendar' });
      await h
        .rejectAssessment(proposed.id, { kind: 'NOT_ELIGIBLE', reason: 'Duplicates a tool we own' }, h.it1)
        .expect(200);

      const rows = new Map((await page(unit.member.account)).items.map((item) => [item.id, item]));

      expect(rows.get(proposed.id)).toMatchObject({
        state: 'IT_REJECTED',
        branch: 'NEW_SOFTWARE',
        plan: null,
        softwareName: 'Miro Boards',
        outcome: { reason: 'Duplicates a tool we own' },
        canWithdraw: false,
      });
      expect(rows.get(pending.id)).toMatchObject({ state: 'PENDING', softwareName: 'Notion Calendar', outcome: null });
    });
  });
});
