import request from 'supertest';
import { SpendDecisionService } from '../../../src/modules/requests/spend-approval/spend-decision.service';
import { GroupHarness } from '../../support/group-harness';
import type { Unit } from '../../support/spend-harness';

const h = new GroupHarness();
const M = 1_000_000;

interface ResultWire {
  requestId: string;
  outcome: string;
  reason?: string | null;
}

/**
 * The batch the approver decides (`QĐ-111ap`, `QĐ-111aq`) over real PostgreSQL: a batch with a No goes back whole, a request for a group in it too; and a
 * batch is judged once, so a policy published while it is decided does not leave it half decided.
 */
describe('the checklist of a batch decided by the approver (integration, real PostgreSQL)', () => {
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

  const checklistsOf = (id: string, step: string) =>
    h.ctx.sql
      .query<{ decision: string; has_no: boolean; line_employee_id: string | null; policy_version_id: string }>(
        `SELECT decision, has_no, line_employee_id, policy_version_id FROM decision_checklists
          WHERE subject_id = $1 AND step_code = $2 ORDER BY decided_at, line_employee_id`,
        [id, step],
      )
      .then((result) => result.rows);
  const results = (response: { body: unknown }) => h.dataOf<{ results: ResultWire[] }>(response as never).results;

  const no = () => h.checklists.questionsOf('1.7')[1];
  const recordsOf = (id: string) =>
    h.ctx.sql
      .query<{ decision: string; reason: string | null }>(
        `SELECT r.decision, r.reason FROM approval_records r JOIN access_request_steps s ON s.id = r.step_id
            WHERE r.request_id = $1 AND s.kind = 'SPEND_APPROVAL' ORDER BY r.decided_at`,
        [id],
      )
      .then((result) => result.rows);

  /** A department with a head, a budget for this year and the next, and a batch of one request for a person and one for a group of three. */
  const mixed = async () => {
    counter += 1;
    const u = await h.departmentWithHead(`P-BM${counter}`);
    await h.roomFor(u, 100_000 * M);
    const single = await h.paidRequest(u, plan, { amount: 10 * M });
    const people = await h.colleagues(u, 3);
    const group = h.dataOf<{ request: { id: string } }>(
      await h.submitGroup(h.groupBody(plan, people), u.head.account).expect(201),
    ).request.id;
    const sent = h.dataOf<{ batch: { id: string } }>(await h.sendOn([single, group], u.head.account).expect(201));

    return { u, people, single, group, batchId: sent.batch.id };
  };

  it('sends back every request of the batch, a request for a group too, when an answer is No', async () => {
    const { people, single, group, batchId } = await mixed();

    const decided = await h
      .decideBatch(batchId, { decision: 'RETURN', checklist: h.checklists.answer('1.7', [no()]) }, h.boss.account)
      .expect(200);

    expect(
      results(decided)
        .map((item) => [item.requestId, item.outcome])
        .sort(),
    ).toEqual(
      [
        [single, 'RETURNED'],
        [group, 'RETURNED'],
      ].sort(),
    );
    expect([await h.state(single), await h.state(group)]).toEqual([
      'AWAITING_SPEND_SUBMISSION',
      'AWAITING_SPEND_SUBMISSION',
    ]);
    // The people of the group are not decided: they keep their need confirmed, and the group goes back to the head whole.
    expect(await h.lineStates(group)).toEqual(['NEED_CONFIRMED', 'NEED_CONFIRMED', 'NEED_CONFIRMED']);
    expect((await recordsOf(group)).map((record) => record.decision)).toEqual(['RETURNED']);
    expect((await recordsOf(group))[0].reason).toContain(no());
    expect(await checklistsOf(single, '1.7')).toEqual([expect.objectContaining({ decision: 'RETURN', has_no: true })]);
    const rows = await checklistsOf(group, '1.7');
    expect(rows.map((row) => [row.line_employee_id, row.decision]).sort()).toEqual(
      people.map((person) => [person.employeeId, 'RETURN']).sort(),
    );
    expect(await h.ctx.sql.query('SELECT 1 FROM spend_decisions WHERE request_id = $1', [group])).toMatchObject({
      rowCount: 0,
    });
  });

  it('still leaves a request for a group out of an approval of the batch: its people are decided one by one', async () => {
    const { single, group, batchId } = await mixed();

    const decided = await h
      .decideBatch(batchId, { decision: 'APPROVE', requestIds: [single, group] }, h.boss.account)
      .expect(200);

    expect(results(decided)).toEqual([
      expect.objectContaining({ requestId: single, outcome: 'APPROVED' }),
      expect.objectContaining({ requestId: group, outcome: 'SKIPPED', reason: 'GROUP_NEEDS_LINES' }),
    ]);
  });

  it('decides a whole batch on the checklist it was judged by, even when the policy has a new version before the last request is decided', async () => {
    counter += 1;
    const u: Unit = await h.departmentWithHead(`P-BV${counter}`);
    await h.budgetFor(u, { total: 1000 * M });
    const ids = [
      await h.paidRequest(u, plan, { amount: 10 * M }),
      await h.paidRequest(u, plan, { amount: 10 * M }),
      await h.paidRequest(u, plan, { amount: 10 * M }),
    ];
    const batchId = h.dataOf<{ batch: { id: string } }>(await h.sendOn(ids, u.head.account).expect(201)).batch.id;
    const shown = h.checklists.yes('1.7');
    const service = h.ctx.app.get(SpendDecisionService);
    const real = service.decide.bind(service);
    let decided = 0;
    // The Super Admin publishes a new version of the policy of the step once the first request of the batch is decided.
    const spy = jest.spyOn(service, 'decide').mockImplementation(async (...args) => {
      const outcome = await real(...args);
      decided += 1;
      if (decided === 1) {
        const as = { Authorization: `Bearer ${h.admin}` };
        await request(h.server()).put('/api/v1/policies/POL-MF1/draft').set(as).send({}).expect(200);
        await request(h.server())
          .post('/api/v1/policies/POL-MF1/draft/publish')
          .set(as)
          .send({
            changeNote: 'Quyết định số 41',
            applicableRoles: ['SPENDING_APPROVER'],
            requiresReacknowledgement: false,
          })
          .expect(201);
      }

      return outcome;
    });

    try {
      const response = await h
        .decideBatch(batchId, { decision: 'APPROVE', requestIds: ids, checklist: shown }, h.boss.account)
        .expect(200);

      expect(results(response).map((item) => item.outcome)).toEqual(['APPROVED', 'APPROVED', 'APPROVED']);
    } finally {
      spy.mockRestore();
      await h.checklists.load(h.ctx.sql, h.seed.organizationId);
    }
    for (const id of ids) {
      expect(await checklistsOf(id, '1.7')).toEqual([
        expect.objectContaining({ decision: 'APPROVE', policy_version_id: shown.policyVersionId }),
      ]);
    }
  });
});
