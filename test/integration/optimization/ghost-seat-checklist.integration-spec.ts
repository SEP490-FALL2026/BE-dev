import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { addDays } from '../../../src/core/business-date';
import { EscalationRepo } from '../../../src/modules/optimization/escalation/escalation.repo';
import { EscalationService } from '../../../src/modules/optimization/escalation/escalation.service';
import type { ApiAccount } from '../../support/api-accounts';
import { GhostSeatWorld } from '../../support/ghost-seat-world';

const w = new GhostSeatWorld();

const decide = (account: ApiAccount, payload: object) =>
  request(w.server()).post('/api/v1/ghost-seat-decisions').set(w.as(account)).send(payload);
const escalate = (payload: object, idempotencyKey: string) =>
  request(w.server())
    .post('/api/v1/ghost-seat-recommendations/escalations')
    .set(w.as(w.it1))
    .set('Idempotency-Key', idempotencyKey)
    .send(payload);
const checklistsOf = async (subjectId: string, step: string) =>
  (
    await w.ctx.sql.query<{ decision: string; has_no: boolean; policy_version_id: string }>(
      `SELECT decision, has_no, policy_version_id FROM decision_checklists
        WHERE subject_id = $1 AND step_code = $2 AND subject_kind = 'GHOST_SEAT_RECOMMENDATION' ORDER BY decided_at`,
      [subjectId, step],
    )
  ).rows;
const decisionsOf = async (recommendationId: string) =>
  (
    await w.ctx.sql.query<{ choice: string }>(`SELECT choice FROM ghost_seat_decisions WHERE recommendation_id = $1`, [
      recommendationId,
    ])
  ).rows;

/**
 * The checklist of the decision of the head on a wasted seat (step `5.4`) and of the early push of a watch (step `5.3`) over real PostgreSQL
 * (`PL-2.6`, `QĐ-111ap`): a No leaves the head only the reclaim and locks the push of the IT Admin for the whole batch, before the key of the
 * batch is taken, and the answers are kept for each recommendation decided.
 */
describe('the checklist of the wasted seats (integration, real PostgreSQL)', () => {
  beforeAll(async () => {
    await w.startWorld();
  }, 240000);

  afterAll(async () => {
    await w.stop();
  });

  /** A department with a head and a recommendation of a holder of it waiting for the head. */
  async function waiting(tag: string, dept?: Awaited<ReturnType<typeof w.headedDepartment>>) {
    const department = dept ?? (await w.headedDepartment(`P-${tag}`));
    const seat = await w.seatIn(`E-${tag}`, department.departmentId);
    const rec = await w.seedRecommendation({
      group: 'G4',
      state: 'AWAITING_DECISION',
      tier: 'REVIEW',
      assignmentId: seat.assignmentId,
      deciderDepartmentId: department.departmentId,
      decisionDueOn: addDays(w.today(), 5),
    });

    return { dept: department, rec };
  }
  const stateOf = async (id: string) => (await w.ghostRows('id = $1', [id]))[0].state;
  const noQuestion = (step: '5.3' | '5.4') => w.checklists.questionsOf(step)[0];

  describe('the decision of the head (5.4)', () => {
    it('keeps the answers of the head with the version of the policy for each recommendation decided', async () => {
      const { dept, rec } = await waiting('CK1');

      await decide(dept.head, {
        items: [{ recommendationId: rec }],
        choice: 'KEEP',
        reason: 'The seat is still needed',
        checklist: w.checklists.yes('5.4'),
      }).expect(201);

      expect(await checklistsOf(rec, '5.4')).toEqual([
        { decision: 'KEEP', has_no: false, policy_version_id: w.checklists.yes('5.4').policyVersionId },
      ]);
      expect((await w.ghostRows('id = $1', [rec]))[0]).toMatchObject({ state: 'CLOSED', close_reason: 'KEPT' });
    });

    it('locks keeping and exempting when an answer is No, and writes nothing', async () => {
      const { dept, rec } = await waiting('CK2');
      const no = noQuestion('5.4');
      const checklist = w.checklists.answer('5.4', [no]);

      for (const extra of [{ choice: 'KEEP' }, { choice: 'EXEMPT', exemptUntil: addDays(w.today(), 30) }]) {
        const response = await decide(dept.head, {
          items: [{ recommendationId: rec }],
          reason: 'Still needed',
          checklist,
          ...extra,
        }).expect(422);
        expect(w.codeOf(response)).toBe('POLICY.CHECKLIST_HAS_NO');
        expect((w.detailsOf(response).items as { code: string }[]).map((item) => item.code)).toEqual([no]);
      }

      expect(await stateOf(rec)).toBe('AWAITING_DECISION');
      expect(await decisionsOf(rec)).toEqual([]);
      expect(await checklistsOf(rec, '5.4')).toEqual([]);
    });

    it('leaves the reclaim, and keeps the answers with the No', async () => {
      const { dept, rec } = await waiting('CK3');

      await decide(dept.head, {
        items: [{ recommendationId: rec }],
        choice: 'RECLAIM',
        reason: 'Not used',
        checklist: w.checklists.answer('5.4', [noQuestion('5.4')]),
      }).expect(201);

      expect(await stateOf(rec)).toBe('RECLAIM_DECIDED');
      expect(await checklistsOf(rec, '5.4')).toEqual([expect.objectContaining({ decision: 'RECLAIM', has_no: true })]);
    });

    it('judges a batch once: a No locks keeping for all of it, and a reclaim of it keeps one row for each', async () => {
      const first = await waiting('CK4');
      const second = await waiting('CK4B', first.dept);
      const items = [{ recommendationId: first.rec }, { recommendationId: second.rec }];
      const checklist = w.checklists.answer('5.4', [noQuestion('5.4')]);

      await decide(first.dept.head, { items, choice: 'KEEP', reason: 'Needed', checklist }).expect(422);
      expect([await stateOf(first.rec), await stateOf(second.rec)]).toEqual(['AWAITING_DECISION', 'AWAITING_DECISION']);
      await decide(first.dept.head, { items, choice: 'RECLAIM', reason: 'Not used', checklist }).expect(201);

      expect(await checklistsOf(first.rec, '5.4')).toHaveLength(1);
      expect(await checklistsOf(second.rec, '5.4')).toHaveLength(1);
    });

    it('asks for the checklist and for an answer to every question, and gives no way to send it back', async () => {
      const { dept, rec } = await waiting('CK5');
      const base = { items: [{ recommendationId: rec }], choice: 'KEEP', reason: 'Still needed' };
      const yes = w.checklists.yes('5.4');

      const none = await decide(dept.head, base).expect(422);
      const missing = await decide(dept.head, { ...base, checklist: { ...yes, answers: [] } }).expect(422);
      const back = await decide(dept.head, { ...base, choice: 'RETURN', checklist: yes }).expect(422);

      expect(w.codeOf(none)).toBe('VALIDATION_ERROR');
      expect(w.codeOf(missing)).toBe('POLICY.CHECKLIST_INCOMPLETE');
      expect(w.codeOf(back)).toBe('VALIDATION_ERROR');
      expect(await stateOf(rec)).toBe('AWAITING_DECISION');
    });

    it('tells who may not decide before it asks about the answers', async () => {
      const { rec } = await waiting('CK6');
      const other = await w.headedDepartment('P-CK6-OTHER');

      const response = await decide(other.head, {
        items: [{ recommendationId: rec }],
        choice: 'KEEP',
        reason: 'Not mine',
        checklist: w.checklists.answer('5.4', [noQuestion('5.4')]),
      }).expect(403);

      expect(w.codeOf(response)).toBe('GHOST_SEAT.NOT_DECIDER');
    });
  });

  describe('the early push of the IT Admin (5.3)', () => {
    /** A watch of a holder of a department with a head. */
    async function watch(tag: string) {
      const dept = await w.headedDepartment(`P-${tag}`);
      const holder = await w.seatIn(`E-${tag}`, dept.departmentId);
      const id = await w.seedRecommendation({
        group: 'G4',
        state: 'OPEN',
        tier: 'MONITOR',
        assignmentId: holder.assignmentId,
      });

      return id;
    }
    const tierOf = async (id: string) => (await w.ghostRows('id = $1', [id]))[0].tier;

    it('keeps the answers for each recommendation pushed, and none for one left as it was', async () => {
      const pushed = await watch('CE1');
      const unknown = randomUUID();

      const response = await escalate(
        { recommendationIds: [pushed, unknown], checklist: w.checklists.yes('5.3') },
        `escalation-${randomUUID()}`,
      ).expect(201);

      expect(w.dataOf<{ escalated: number; skipped: number }>(response)).toMatchObject({ escalated: 1, skipped: 1 });
      expect(await checklistsOf(pushed, '5.3')).toEqual([
        { decision: 'ESCALATE', has_no: false, policy_version_id: w.checklists.yes('5.3').policyVersionId },
      ]);
      expect(await checklistsOf(unknown, '5.3')).toEqual([]);
    });

    it('refuses the whole batch when an answer is No, leaves the watch as it was, and takes no key: the same key serves the batch pushed after', async () => {
      const first = await watch('CE2');
      const second = await watch('CE2B');
      const key = `escalation-${randomUUID()}`;
      const body = { recommendationIds: [first, second] };

      const refused = await escalate(
        { ...body, checklist: w.checklists.answer('5.3', [noQuestion('5.3')]) },
        key,
      ).expect(422);

      expect(w.codeOf(refused)).toBe('POLICY.CHECKLIST_HAS_NO');
      expect([await tierOf(first), await tierOf(second)]).toEqual(['MONITOR', 'MONITOR']);
      expect(await checklistsOf(first, '5.3')).toEqual([]);
      const pushed = await escalate({ ...body, checklist: w.checklists.yes('5.3') }, key).expect(201);
      expect(w.dataOf<{ replayed: boolean; escalated: number }>(pushed)).toMatchObject({
        replayed: false,
        escalated: 2,
      });
      expect(await tierOf(first)).toBe('REVIEW');
    });

    it('keeps the answers at the hour of the push it was given', async () => {
      const id = await watch('CE5');
      const at = new Date('2026-03-10T08:15:00.000Z');
      const actor = w.actorOf(w.it1);

      await w.ctx.app
        .get(EscalationService)
        .escalate(
          actor,
          { recommendationIds: [id], checklist: w.checklists.yes('5.3'), idempotencyKey: `escalation-${randomUUID()}` },
          at,
        );

      const kept = await w.ctx.sql.query<{ decided_at: Date }>(
        `SELECT decided_at FROM decision_checklists WHERE subject_id = $1 AND step_code = '5.3'`,
        [id],
      );
      expect(kept.rows.map((row) => row.decided_at.toISOString())).toEqual([at.toISOString()]);
    });

    it('judges the checklist before it takes the key, so a refused batch never reaches the key', async () => {
      const id = await watch('CE6');
      const claim = jest.spyOn(w.ctx.app.get(EscalationRepo), 'claim');

      try {
        await escalate(
          { recommendationIds: [id], checklist: w.checklists.answer('5.3', [noQuestion('5.3')]) },
          `escalation-${randomUUID()}`,
        ).expect(422);
        expect(claim).not.toHaveBeenCalled();
        await escalate(
          { recommendationIds: [id], checklist: w.checklists.yes('5.3') },
          `escalation-${randomUUID()}`,
        ).expect(201);
        expect(claim).toHaveBeenCalledTimes(1);
      } finally {
        claim.mockRestore();
      }
    });

    it('asks for the checklist and for an answer to every question', async () => {
      const id = await watch('CE3');
      const yes = w.checklists.yes('5.3');

      const none = await escalate({ recommendationIds: [id] }, `escalation-${randomUUID()}`).expect(422);
      const missing = await escalate(
        { recommendationIds: [id], checklist: { ...yes, answers: [] } },
        `escalation-${randomUUID()}`,
      ).expect(422);

      expect(w.codeOf(none)).toBe('VALIDATION_ERROR');
      expect(w.codeOf(missing)).toBe('POLICY.CHECKLIST_INCOMPLETE');
      expect(await tierOf(id)).toBe('MONITOR');
    });

    it('answers the batch it already pushed when the same key comes again after the policy has a new version, without judging the old checklist again', async () => {
      const id = await watch('CE4');
      const key = `escalation-${randomUUID()}`;
      const body = { recommendationIds: [id], checklist: w.checklists.yes('5.3') };
      const first = await escalate(body, key).expect(201);
      const as = { Authorization: `Bearer ${w.admin}` };
      await request(w.server()).put('/api/v1/policies/POL-USAGE/draft').set(as).send({}).expect(200);
      await request(w.server())
        .post('/api/v1/policies/POL-USAGE/draft/publish')
        .set(as)
        .send({ changeNote: 'Quyết định số 12', applicableRoles: ['IT_ADMIN'], requiresReacknowledgement: false })
        .expect(201);

      const again = await escalate(body, key).expect(201);
      const other = await escalate({ ...body, recommendationIds: [randomUUID()] }, key).expect(409);

      expect(w.dataOf<{ id: string }>(again).id).toBe(w.dataOf<{ id: string }>(first).id);
      expect(w.dataOf<{ replayed: boolean }>(again).replayed).toBe(true);
      expect(w.codeOf(other)).toBe('GHOST_SEAT.ESCALATION_KEY_REUSED');
      // A new batch is judged against the new version: the checklist of the old one is turned away.
      const fresh = await escalate({ ...body, recommendationIds: [id] }, `escalation-${randomUUID()}`).expect(409);
      expect(w.codeOf(fresh)).toBe('POLICY.VERSION_CHANGED');
      await w.checklists.load(w.ctx.sql, w.seed.organizationId);
    });
  });
});
