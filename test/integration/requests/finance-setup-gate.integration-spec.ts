import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { ApiAccount } from '../../support/api-accounts';
import { GroupHarness } from '../../support/group-harness';
import type { Person } from '../../support/request-harness';
import type { Unit } from '../../support/spend-harness';

/**
 * `g0-g6-final-business-baseline-remediation`, Task 4.1 (F27, spec L.1): a department that has no Cost Center in use cannot send a paid
 * request, and the person who cannot send one keeps a draft. Every operation that charges a cost to the department answers 409
 * `FINANCE.SETUP_INCOMPLETE` with nothing written; a draft is saved with no gate, is the sender's alone, is never a request until it is
 * sent (then the same row becomes the request and every gate of the operation that sends that kind of request runs), and goes with the
 * person who leaves.
 */
const h = new GroupHarness();

interface DraftWire {
  id: string;
  kind: string;
  departmentId: string;
  planId: string;
  beneficiaryCount: number;
  createdAt: string;
}
interface SentWire {
  id: string;
  state: string;
  type: string;
  costCenter: { id: string } | null;
  submittedAt: string;
}

describe('a department with no Cost Center, and the drafts of what it cannot send (integration, real PostgreSQL)', () => {
  let plan: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(100));
    await h
      .declareTaxProfile((await h.vendorOf(plan)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const unit = async (): Promise<Unit> => {
    counter += 1;

    return h.departmentWithHead(`P-GT${counter}`);
  };
  /** A department whose Cost Center is retired: none is in use (here by SQL, as a state that can exist). */
  const bare = async (): Promise<Unit> => {
    const u = await unit();
    await h.ctx.sql.query(
      `UPDATE cost_centers SET status = 'INACTIVE', deactivated_at = now() WHERE department_id = $1`,
      [u.department.id],
    );

    return u;
  };
  /** Finance creates the Cost Center of the department, as it does when it sets the department up. */
  const costCenterFor = async (u: Unit): Promise<void> => {
    counter += 1;
    await request(h.server())
      .post('/api/v1/cost-centers')
      .set(h.as(h.finance))
      .send({ code: `CC-GT-${counter}`, name: 'Created for the gate', kind: 'UNIT', departmentId: u.department.id })
      .expect(201);
  };

  const sentRows = async (): Promise<number> =>
    Number(
      (await h.ctx.sql.query<{ n: string }>(`SELECT count(*) AS n FROM access_requests WHERE state <> 'DRAFT'`)).rows[0]
        .n,
    );
  const table = async (name: string): Promise<number> =>
    Number((await h.ctx.sql.query<{ n: string }>(`SELECT count(*) AS n FROM ${name}`)).rows[0].n);
  /** What a refused call must leave as it found it: the requests that were sent, the audit events, the drafts, the batches. */
  const footprint = async () => [
    await sentRows(),
    await table('audit_events'),
    await table('access_request_steps'),
    await table('spend_batches'),
  ];
  const draftRow = async (id: string) =>
    (
      await h.ctx.sql.query<{ state: string; type: string; cost_center_id: string | null; submitted_at: Date | null }>(
        `SELECT state::text, type::text, cost_center_id, submitted_at FROM access_requests WHERE id = $1`,
        [id],
      )
    ).rows[0];
  const workOf = async (id: string) => [
    await h.ctx.sql.query(`SELECT 1 FROM access_request_steps WHERE request_id = $1`, [id]).then((r) => r.rowCount),
    await h.ctx.sql.query(`SELECT 1 FROM request_budget_checks WHERE request_id = $1`, [id]).then((r) => r.rowCount),
    await h.ctx.sql.query(`SELECT 1 FROM budget_commitments WHERE request_id = $1`, [id]).then((r) => r.rowCount),
  ];

  const save = (body: object, account: ApiAccount) =>
    request(h.server()).post('/api/v1/access-requests/drafts').set(h.as(account)).send(body);
  const listDrafts = (account: ApiAccount, query: Record<string, string | number> = {}) =>
    request(h.server()).get('/api/v1/access-requests/drafts').query(query).set(h.as(account));
  const sendDraft = (id: string, account: ApiAccount) =>
    request(h.server()).post(`/api/v1/access-requests/drafts/${id}/submission`).set(h.as(account)).send({});
  const deleteDraft = (id: string, account: ApiAccount) =>
    request(h.server()).delete(`/api/v1/access-requests/drafts/${id}`).set(h.as(account));
  const saved = async (body: object, account: ApiAccount) =>
    h.dataOf<{ draft: DraftWire }>(await save(body, account).expect(201)).draft;

  describe('every operation that charges a cost to the department (F27)', () => {
    it('refuses a request, a proposal and a request for a group with 409 FINANCE.SETUP_INCOMPLETE, and writes nothing', async () => {
      const u = await bare();
      const [e1, e2] = await h.colleagues(u, 2);
      const before = await footprint();

      const individual = await h.submit(h.form(plan), u.member.account);
      const proposal = await h.propose(h.proposeBody(), u.member.account);
      const group = await h.submitGroup(h.groupBody(plan, [e1, e2]), u.head.account);

      expect([individual, proposal, group].map((response) => response.status)).toEqual([409, 409, 409]);
      expect([individual, proposal, group].map((response) => h.codeOf(response))).toEqual(
        Array(3).fill('FINANCE.SETUP_INCOMPLETE'),
      );
      expect(await footprint()).toEqual(before);
    });

    it('does not stop a free internal request: it is sent, read, decided and charged to no Cost Center (F91, QĐ-87g(2))', async () => {
      const internalPlan = await h.plan('K5');
      const u = await bare();
      const before = await sentRows();
      const [checks, commitments] = [await table('request_budget_checks'), await table('budget_commitments')];

      const response = await h.submit(h.form(internalPlan), u.member.account).expect(201);

      const sentRequest = h.dataOf<{ request: SentWire }>(response).request;
      expect(sentRequest).toMatchObject({ state: 'PENDING', type: 'GRANT', costCenter: null });
      expect(await draftRow(sentRequest.id)).toMatchObject({ state: 'PENDING', cost_center_id: null });
      expect(await sentRows()).toBe(before + 1);
      // The sender and the head read it, and the head decides it as any other request of internal software.
      const read = await h.fetch(sentRequest.id, u.member.account).expect(200);
      expect(h.dataOf<{ request: SentWire }>(read).request.costCenter).toBeNull();
      await h.decide(sentRequest.id, { decision: 'APPROVE' }, u.head.account).expect(200);
      expect(await h.state(sentRequest.id)).toBe('AWAITING_EXECUTION');
      // Nothing is charged: no budget check and no commitment, and no Cost Center is made up for it.
      expect(await table('request_budget_checks')).toBe(checks);
      expect(await table('budget_commitments')).toBe(commitments);
    });

    it('does not let the gate answer for a group of internal software: the group refuses that plan with its own answer', async () => {
      const internalPlan = await h.plan('K5');
      const u = await bare();
      const [e1, e2] = await h.colleagues(u, 2);

      const group = await h.submitGroup(h.groupBody(internalPlan, [e1, e2]), u.head.account);

      // The plan is free, so the gate does not stop it: the group refuses it as it refuses any plan a group may not take.
      expect(group.status).toBe(422);
      expect(h.codeOf(group)).toBe('GROUP_REQUEST.PLAN_NOT_ELIGIBLE');
    });

    it('stops the head who sends a request on to the approver, before anything is checked against a budget, and the request stays in the queue', async () => {
      const u = await unit();
      const id = await h.paidRequest(u, plan, { amount: 5_000_000 });
      await h.ctx.sql.query(
        `UPDATE cost_centers SET status = 'INACTIVE', deactivated_at = now() WHERE department_id = $1`,
        [u.department.id],
      );
      const before = await footprint();
      const checks = await table('request_budget_checks');

      const refused = await h.sendOn([id], u.head.account).expect(409);

      expect(h.codeOf(refused)).toBe('FINANCE.SETUP_INCOMPLETE');
      expect(await footprint()).toEqual(before);
      expect(await table('request_budget_checks')).toBe(checks);
      expect(await h.state(id)).toBe('AWAITING_SPEND_SUBMISSION');
    });
  });

  describe('saving what cannot be sent (spec L.1)', () => {
    it('keeps a draft of each kind (an individual and a group) with no gate: no Cost Center, no moment it was sent, no step, no check, no commitment, and says so in the Audit Trail', async () => {
      const u = await bare();
      const [e1, e2] = await h.colleagues(u, 2);

      const individual = await saved({ kind: 'INDIVIDUAL', ...h.form(plan) }, u.member.account);
      const group = await saved({ kind: 'GROUP', ...h.groupBody(plan, [e1, e2]) }, u.head.account);

      expect(individual).toMatchObject({
        kind: 'INDIVIDUAL',
        departmentId: u.department.id,
        planId: plan,
        beneficiaryCount: 1,
      });
      expect(group).toMatchObject({ kind: 'GROUP', departmentId: u.department.id, planId: plan, beneficiaryCount: 2 });
      for (const [draft, type] of [
        [individual, 'GRANT'],
        [group, 'GROUP_GRANT'],
      ] as const) {
        expect(await draftRow(draft.id)).toEqual({ state: 'DRAFT', type, cost_center_id: null, submitted_at: null });
        expect(await workOf(draft.id)).toEqual([0, 0, 0]);
        const [event] = await h.audit('ACCESS_REQUEST.DRAFT_SAVED', draft.id);
        expect(event).toMatchObject({
          actor_kind: 'USER',
          after: { requestId: draft.id, kind: draft.kind, planId: plan, departmentId: u.department.id },
        });
        // What the Audit Trail keeps is ids, the kind and the count: never the reason, the purpose or the people named.
        expect(JSON.stringify(event.after)).not.toMatch(/Design the new brand|CI pipeline|brand needs/);
      }
    });

    it('keeps a draft of the sender only: listed, sent and deleted by them, and another person meets a request that does not exist', async () => {
      const u = await bare();
      const stranger = await h.staff(u.department, `GT-S${(counter += 1)}`);
      const mine = await saved({ kind: 'INDIVIDUAL', ...h.form(plan) }, u.member.account);

      const theirs = h.dataOf<{ items: DraftWire[] }>(await listDrafts(stranger.account).expect(200)).items;
      const read = await listDrafts(u.member.account).expect(200);
      const sent = await sendDraft(mine.id, stranger.account).expect(404);
      const deleted = await deleteDraft(mine.id, stranger.account).expect(404);
      const head = await deleteDraft(mine.id, u.head.account).expect(404);

      expect(theirs).toEqual([]);
      expect(h.dataOf<{ items: DraftWire[] }>(read).items.map((draft) => draft.id)).toEqual([mine.id]);
      expect([sent, deleted, head].map((response) => h.codeOf(response))).toEqual(
        Array(3).fill('ACCESS_REQUEST.NOT_FOUND'),
      );
      expect((await draftRow(mine.id)).state).toBe('DRAFT');
    });

    it('lists a page of them, with the total, and refuses a page size over 100', async () => {
      const u = await bare();
      const made = [];
      for (let index = 0; index < 3; index += 1)
        made.push(await saved({ kind: 'INDIVIDUAL', ...h.form(plan) }, u.member.account));

      const first = h.dataOf<{
        items: DraftWire[];
        pagination: { totalItems: number; totalPages: number; page: number };
      }>(await listDrafts(u.member.account, { pageSize: 2 }).expect(200));
      const second = h.dataOf<{ items: DraftWire[] }>(
        await listDrafts(u.member.account, { pageSize: 2, page: 2 }).expect(200),
      );
      const refused = await listDrafts(u.member.account, { pageSize: 101 }).expect(422);

      expect(first.items).toHaveLength(2);
      expect(first.pagination).toMatchObject({ page: 1, totalItems: 3, totalPages: 2 });
      expect([...first.items, ...second.items].map((draft) => draft.id).sort()).toEqual(
        made.map((draft) => draft.id).sort(),
      );
      expect(h.codeOf(refused)).toBe('VALIDATION_ERROR');
    });

    it('is never a request: read only by its creator and as a draft, not timed, not told of, and not counted among the requests that were sent', async () => {
      const u = await bare();
      const before = await sentRows();

      const draft = await saved({ kind: 'INDIVIDUAL', ...h.form(plan) }, u.member.account);
      await h.project();

      // The creator reads it through the operation that reads a request (spec L.1, F92): as a draft, with no price, step or Cost Center.
      const own = await h.fetch(draft.id, u.member.account).expect(200);
      expect(h.dataOf<Record<string, unknown>>(own)).toEqual({ draft });
      expect((own.body as { message: string }).message).toBe('ACCESS_REQUEST.FETCHED');
      // Nobody else meets it, not even the head of the department or Finance: the answer of an id that is not there.
      for (const account of [u.head.account, h.finance]) {
        const other = await h.fetch(draft.id, account).expect(404);
        expect(h.codeOf(other)).toBe('ACCESS_REQUEST.NOT_FOUND');
      }
      await h.timings(draft.id, u.member.account).expect(404);
      expect(await h.noticesAbout(draft.id)).toEqual([]);
      expect(await sentRows()).toBe(before);
    });

    it('reads a request that was sent as it always was, and a draft that was sent no longer as a draft (F92)', async () => {
      const u = await bare();
      const draft = await saved({ kind: 'INDIVIDUAL', ...h.form(plan) }, u.member.account);
      await costCenterFor(u);
      await sendDraft(draft.id, u.member.account).expect(201);

      const read = await h.fetch(draft.id, u.member.account).expect(200);

      const data = h.dataOf<{ request?: SentWire; draft?: unknown }>(read);
      expect(data.draft).toBeUndefined();
      expect(data.request).toMatchObject({ id: draft.id, state: 'PENDING', type: 'GRANT' });
    });

    it('rejects what the operation that sends that kind of request would reject, and a kind that is none of the three', async () => {
      const u = await bare();

      const noReason = await save({ kind: 'INDIVIDUAL', planId: plan }, u.member.account).expect(422);
      const unknown = await save({ kind: 'RENEWAL', ...h.form(plan) }, u.member.account).expect(422);
      const noLines = await save({ kind: 'GROUP', ...h.groupBody(plan, []) }, u.head.account).expect(422);
      const noPlan = await save({ kind: 'INDIVIDUAL', ...h.form(randomUUID()) }, u.member.account).expect(404);

      expect([noReason, unknown, noLines].map((response) => h.codeOf(response))).toEqual(
        Array(3).fill('VALIDATION_ERROR'),
      );
      expect(h.codeOf(noPlan)).toBe('ACCESS_REQUEST.PLAN_NOT_FOUND');
    });
  });

  describe('sending a draft', () => {
    it('answers what the operation that sends it answers while there is no Cost Center, and leaves the draft as it was', async () => {
      const u = await bare();
      const draft = await saved({ kind: 'INDIVIDUAL', ...h.form(plan) }, u.member.account);
      const before = await footprint();

      const refused = await sendDraft(draft.id, u.member.account).expect(409);

      expect(h.codeOf(refused)).toBe('FINANCE.SETUP_INCOMPLETE');
      expect(await draftRow(draft.id)).toEqual({
        state: 'DRAFT',
        type: 'GRANT',
        cost_center_id: null,
        submitted_at: null,
      });
      expect(await footprint()).toEqual(before);
      expect(h.dataOf<{ items: DraftWire[] }>(await listDrafts(u.member.account).expect(200)).items).toHaveLength(1);
    });

    it('makes the same row the request once Finance has created the Cost Center: sent now, charged to it, with its step, and the draft is gone from the list', async () => {
      const u = await bare();
      const draft = await saved({ kind: 'INDIVIDUAL', ...h.form(plan) }, u.member.account);
      await costCenterFor(u);

      const response = await sendDraft(draft.id, u.member.account).expect(201);

      const sentRequest = h.dataOf<{ request: SentWire }>(response).request;
      const center = (
        await h.ctx.sql.query<{ id: string }>(
          `SELECT id FROM cost_centers WHERE department_id = $1 AND status = 'ACTIVE'`,
          [u.department.id],
        )
      ).rows[0];
      expect((response.body as { message: string }).message).toBe('ACCESS_REQUEST.SUBMITTED');
      expect(sentRequest).toMatchObject({ id: draft.id, type: 'GRANT', costCenter: { id: center.id } });
      expect(await draftRow(draft.id)).toMatchObject({ state: 'PENDING', cost_center_id: center.id });
      expect((await draftRow(draft.id)).submitted_at).not.toBeNull();
      expect((await workOf(draft.id))[0]).toBe(1);
      expect(h.dataOf<{ items: DraftWire[] }>(await listDrafts(u.member.account).expect(200)).items).toEqual([]);
    });

    it('sends a draft of a group as the operation that sends a group does, with its message', async () => {
      const u = await bare();
      const [e1, e2] = await h.colleagues(u, 2);
      const group = await saved({ kind: 'GROUP', ...h.groupBody(plan, [e1, e2]) }, u.head.account);
      await costCenterFor(u);

      const groupSent = await sendDraft(group.id, u.head.account).expect(201);

      expect((groupSent.body as { message: string }).message).toBe('GROUP_REQUEST.SUBMITTED');
      expect(await draftRow(group.id)).toMatchObject({ type: 'GROUP_GRANT' });
      expect((await draftRow(group.id)).state).not.toBe('DRAFT');
      expect(await h.lineStates(group.id)).toHaveLength(2);
    });

    it('is sent once: the second call finds a request that is not a draft, and writes nothing', async () => {
      const u = await unit();
      const draft = await saved({ kind: 'INDIVIDUAL', ...h.form(plan) }, u.member.account);
      await sendDraft(draft.id, u.member.account).expect(201);
      const before = await footprint();

      const again = await sendDraft(draft.id, u.member.account).expect(409);
      const deleted = await deleteDraft(draft.id, u.member.account).expect(409);

      expect([again, deleted].map((response) => h.codeOf(response))).toEqual([
        'ACCESS_REQUEST.NOT_DRAFT',
        'ACCESS_REQUEST.NOT_DRAFT',
      ]);
      expect(await footprint()).toEqual(before);
    });

    it('is judged on the department of the day it is sent, not the day it was saved', async () => {
      const u = await unit();
      const elsewhere = await unit();
      const draft = await saved({ kind: 'INDIVIDUAL', ...h.form(plan) }, u.member.account);
      expect(draft.departmentId).toBe(u.department.id);

      await h.moveTo(u.member.employeeId, elsewhere.department.id);
      const response = await sendDraft(draft.id, u.member.account).expect(201);

      expect(h.dataOf<{ request: { department: { id: string } } }>(response).request.department.id).toBe(
        elsewhere.department.id,
      );
    });
  });

  describe('deleting a draft, and a person who leaves', () => {
    it('deletes it with what hangs from it, and keeps in the Audit Trail what it was', async () => {
      const u = await bare();
      const draft = await saved({ kind: 'INDIVIDUAL', ...h.form(plan) }, u.member.account);

      await deleteDraft(draft.id, u.member.account).expect(200);

      expect(await draftRow(draft.id)).toBeUndefined();
      const [event] = await h.audit('ACCESS_REQUEST.DRAFT_DELETED', draft.id);
      expect(event).toMatchObject({
        actor_kind: 'USER',
        before: { requestId: draft.id, kind: 'INDIVIDUAL', planId: plan },
        after: null,
      });
      expect((await deleteDraft(draft.id, u.member.account).expect(404)).body).toMatchObject({
        error: { code: 'ACCESS_REQUEST.NOT_FOUND' },
      });
    });

    it('goes with the person who leaves, by the system, and leaves the drafts of everybody else', async () => {
      const u = await bare();
      const leaver: Person = await h.staff(u.department, `GT-L${(counter += 1)}`);
      const mine = await saved({ kind: 'INDIVIDUAL', ...h.form(plan) }, leaver.account);
      const second = await saved({ kind: 'INDIVIDUAL', ...h.form(plan) }, leaver.account);
      const stays = await saved({ kind: 'INDIVIDUAL', ...h.form(plan) }, u.member.account);

      await h.leave(leaver.employeeId);

      expect(await draftRow(mine.id)).toBeUndefined();
      expect(await draftRow(second.id)).toBeUndefined();
      expect((await draftRow(stays.id)).state).toBe('DRAFT');
      for (const draft of [mine, second]) {
        const [event] = await h.audit('ACCESS_REQUEST.DRAFT_DELETED', draft.id);
        expect(event).toMatchObject({
          actor_kind: 'SYSTEM',
          before: { requestId: draft.id, requesterEmployeeId: leaver.employeeId },
          after: { reason: 'REQUESTER_LEFT' },
        });
      }
    });
  });
});
