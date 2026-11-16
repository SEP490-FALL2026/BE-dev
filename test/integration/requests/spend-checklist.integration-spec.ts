import request from 'supertest';
import { bodyOf } from '../../support/api-body';
import { GroupHarness } from '../../support/group-harness';
import type { Unit } from '../../support/spend-harness';

const h = new GroupHarness();
const M = 1_000_000;

/**
 * The checklist of the spend step (`PL-2.3`, `QĐ-111ap`, `QĐ-111aq`, R-6, R-24) over real PostgreSQL: the answers kept with the decision, a No that
 * locks the approval, a request sent back to the queue of its head (and sent on again), a batch that goes back whole with one set of answers kept for
 * each request, a group of people that answers once, and the version of the policy that changed in between.
 */
describe('the checklist of the spend step (integration, real PostgreSQL)', () => {
  let plan: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(10));
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  /** A department with a head and a budget, and the requests of its members waiting for the approver in one batch. */
  const batchOf = async (count: number) => {
    counter += 1;
    const unit: Unit = await h.departmentWithHead(`P-K${counter}`);
    await h.budgetFor(unit, { total: 1000 * M });
    const ids: string[] = [];
    for (let index = 0; index < count; index += 1) ids.push(await h.paidRequest(unit, plan, { amount: 10 * M }));
    const batch = h.dataOf<{ batch: { id: string } }>(await h.sendOn(ids, unit.head.account).expect(201)).batch;

    return { unit, ids, batchId: batch.id };
  };
  const no = () => h.checklists.questionsOf('1.7')[1];
  const checklistsOf = (id: string) =>
    h.ctx.sql
      .query<{ decision: string; has_no: boolean; line_employee_id: string | null; answers: unknown }>(
        `SELECT decision, has_no, line_employee_id, answers FROM decision_checklists WHERE subject_id = $1 AND step_code = '1.7' ORDER BY decided_at`,
        [id],
      )
      .then((result) => result.rows);
  const recordsOf = (id: string) =>
    h.ctx.sql
      .query<{ decision: string; reason: string | null }>(
        `SELECT r.decision, r.reason FROM approval_records r JOIN access_request_steps s ON s.id = r.step_id
          WHERE r.request_id = $1 AND s.kind = 'SPEND_APPROVAL' ORDER BY r.decided_at`,
        [id],
      )
      .then((result) => result.rows);

  describe('one request', () => {
    it('keeps the answers with the approval when every question is Yes', async () => {
      const { ids } = await batchOf(1);

      await h.decideSpend(ids[0], { decision: 'APPROVE' }, h.boss.account).expect(200);

      expect(await h.state(ids[0])).toBe('AWAITING_EXECUTION');
      expect(await checklistsOf(ids[0])).toEqual([expect.objectContaining({ decision: 'APPROVE', has_no: false })]);
    });

    it('locks the approval when an answer is No and decides nothing', async () => {
      const { ids } = await batchOf(1);

      const refused = await h
        .decideSpend(ids[0], { decision: 'APPROVE', checklist: h.checklists.answer('1.7', [no()]) }, h.boss.account)
        .expect(422);

      expect(bodyOf(refused).error.code).toBe('POLICY.CHECKLIST_HAS_NO');
      expect(await h.state(ids[0])).toBe('AWAITING_SPEND_DECISION');
      expect(await checklistsOf(ids[0])).toEqual([]);
      expect(await recordsOf(ids[0])).toEqual([]);
    });

    it('refuses with the reason filled in from the answer No', async () => {
      const { ids } = await batchOf(1);

      await h
        .decideSpend(ids[0], { decision: 'REJECT', checklist: h.checklists.answer('1.7', [no()]) }, h.boss.account)
        .expect(200);

      expect(await h.state(ids[0])).toBe('REJECTED');
      const [record] = await recordsOf(ids[0]);
      expect(record).toMatchObject({ decision: 'REJECTED', reason: expect.stringContaining(no()) as unknown });
    });

    it('sends the request back to the queue of its head, who sends it on again to a new step', async () => {
      const { unit, ids } = await batchOf(1);

      await h
        .decideSpend(ids[0], { decision: 'RETURN', checklist: h.checklists.answer('1.7', [no()]) }, h.boss.account)
        .expect(200);

      expect(await h.state(ids[0])).toBe('AWAITING_SPEND_SUBMISSION');
      const [record] = await recordsOf(ids[0]);
      expect(record).toMatchObject({ decision: 'RETURNED', reason: expect.stringContaining(no()) as unknown });
      expect(await checklistsOf(ids[0])).toEqual([expect.objectContaining({ decision: 'RETURN', has_no: true })]);
      expect(await h.ctx.sql.query('SELECT 1 FROM spend_decisions WHERE request_id = $1', [ids[0]])).toMatchObject({
        rowCount: 0,
      });

      await h.sendOn(ids, unit.head.account).expect(201);
      expect(await h.state(ids[0])).toBe('AWAITING_SPEND_DECISION');
    });

    it('turns away a checklist of a version the policy has left behind', async () => {
      const { ids } = await batchOf(1);
      const shown = h.checklists.yes('1.7');
      const as = { Authorization: `Bearer ${h.admin}` };
      await request(h.server()).put('/api/v1/policies/POL-MF1/draft').set(as).send({}).expect(200);
      await request(h.server())
        .post('/api/v1/policies/POL-MF1/draft/publish')
        .set(as)
        .send({
          changeNote: 'Quyết định số 31',
          applicableRoles: ['SPENDING_APPROVER'],
          requiresReacknowledgement: false,
        })
        .expect(201);

      const refused = await h
        .decideSpend(ids[0], { decision: 'APPROVE', checklist: shown }, h.boss.account)
        .expect(409);

      expect(bodyOf(refused).error.code).toBe('POLICY.VERSION_CHANGED');
      expect(await h.state(ids[0])).toBe('AWAITING_SPEND_DECISION');
      await h.checklists.load(h.ctx.sql, h.seed.organizationId);
    });
  });

  describe('a batch (QĐ-111aq)', () => {
    it('locks the approval of the whole batch when an answer is No, before any request is decided', async () => {
      const { ids, batchId } = await batchOf(3);

      const refused = await h
        .decideBatch(
          batchId,
          { decision: 'APPROVE', requestIds: ids, checklist: h.checklists.answer('1.7', [no()]) },
          h.boss.account,
        )
        .expect(422);

      expect(bodyOf(refused).error.code).toBe('POLICY.CHECKLIST_HAS_NO');
      for (const id of ids) expect(await h.state(id)).toBe('AWAITING_SPEND_DECISION');
    });

    it('sends every request of the batch back with one set of answers kept for each and the reason filled in from the answer No', async () => {
      const { unit, ids, batchId } = await batchOf(3);

      const decided = await h
        .decideBatch(batchId, { decision: 'RETURN', checklist: h.checklists.answer('1.7', [no()]) }, h.boss.account)
        .expect(200);

      const results = h.dataOf<{ results: { requestId: string; outcome: string }[] }>(decided).results;
      expect(results.map((result) => result.outcome)).toEqual(['RETURNED', 'RETURNED', 'RETURNED']);
      const rows = await Promise.all(ids.map((id) => checklistsOf(id)));
      for (const [index, id] of ids.entries()) {
        expect(await h.state(id)).toBe('AWAITING_SPEND_SUBMISSION');
        expect(rows[index]).toEqual([expect.objectContaining({ decision: 'RETURN', has_no: true })]);
        expect(rows[index][0].answers).toEqual(rows[0][0].answers);
        expect((await recordsOf(id))[0].reason).toContain(no());
      }
      // The head drops one and sends the others on in a new batch.
      await h.sendOn(ids.slice(1), unit.head.account).expect(201);
      expect(await h.state(ids[1])).toBe('AWAITING_SPEND_DECISION');
    });

    it('takes no request ids for a return, and needs them for an approval or a refusal', async () => {
      const { ids, batchId } = await batchOf(2);

      const returned = await h
        .decideBatch(batchId, { decision: 'RETURN', requestIds: ids, reason: 'Back' }, h.boss.account)
        .expect(422);
      const approved = await h.decideBatch(batchId, { decision: 'APPROVE' }, h.boss.account).expect(422);

      expect(bodyOf(returned).error.code).toBe('VALIDATION_ERROR');
      expect(bodyOf(approved).error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('a group of people (R-6)', () => {
    const waiting = async () => {
      counter += 1;
      const u = await h.departmentWithHead(`P-G${counter}`);
      await h.budgetFor(u, { total: 100_000 * M });
      await h.budgetFor(u, { total: 100_000 * M, year: h.next });
      const people = await h.colleagues(u, 3);
      const sent = h.dataOf<{ request: { id: string } }>(
        await h.submitGroup(h.groupBody(plan, people), u.head.account).expect(201),
      ).request;
      await h.sendOn([sent.id], u.head.account).expect(201);

      return { u, people, id: sent.id };
    };
    const line = (employeeId: string, decision: string, reason?: string) => ({
      employeeId,
      decision,
      ...(reason ? { reason } : {}),
    });

    it('keeps one set of answers for the group, once for each person, with what was decided of each', async () => {
      const { people, id } = await waiting();
      const [e1, e2, e3] = people;

      await h
        .decideSpendLines(
          id,
          {
            lines: [
              line(e1.employeeId, 'APPROVE'),
              line(e2.employeeId, 'APPROVE'),
              line(e3.employeeId, 'REJECT', 'No'),
            ],
          },
          h.boss.account,
        )
        .expect(200);

      const rows = await checklistsOf(id);
      expect(rows.map((row) => [row.line_employee_id, row.decision]).sort()).toEqual(
        [
          [e1.employeeId, 'APPROVE'],
          [e2.employeeId, 'APPROVE'],
          [e3.employeeId, 'REJECT'],
        ].sort(),
      );
    });

    it('sends the whole group back to the head, with no decision of a person', async () => {
      const { people, id } = await waiting();

      await h
        .decideSpendLines(
          id,
          {
            lines: people.map((person) => line(person.employeeId, 'RETURN')),
            checklist: h.checklists.answer('1.7', [no()]),
          },
          h.boss.account,
        )
        .expect(200);

      expect(await h.state(id)).toBe('AWAITING_SPEND_SUBMISSION');
      expect(await h.lineStates(id)).toEqual(['NEED_CONFIRMED', 'NEED_CONFIRMED', 'NEED_CONFIRMED']);
      expect((await recordsOf(id)).map((record) => record.decision)).toContain('RETURNED');
      expect(await checklistsOf(id)).toHaveLength(3);
    });

    it('locks the approval of everybody when an answer is No', async () => {
      const { people, id } = await waiting();

      const refused = await h
        .decideSpendLines(
          id,
          {
            lines: [line(people[0].employeeId, 'APPROVE'), ...people.slice(1).map((p) => line(p.employeeId, 'REJECT'))],
            checklist: h.checklists.answer('1.7', [no()]),
          },
          h.boss.account,
        )
        .expect(422);

      expect(bodyOf(refused).error.code).toBe('POLICY.CHECKLIST_HAS_NO');
      expect(await h.lineStates(id)).toEqual(['NEED_CONFIRMED', 'NEED_CONFIRMED', 'NEED_CONFIRMED']);
    });
  });
});
