import { GroupHarness } from '../../support/group-harness';
import type { Unit } from '../../support/spend-harness';

const h = new GroupHarness();
const M = 1_000_000;

interface RequestMetaRow {
  routing_mode: string;
  one_step_reason: string | null;
  state: string;
}

describe('W1-17 edge cases: (d) blocked re-check, (e) Case B IT assessment, (i) group exit path (integration, real PostgreSQL)', () => {
  let paid: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    paid = await h.planOf(await h.subscription(100));
    await h
      .declareTaxProfile((await h.vendorOf(paid)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const unit = async (budget = 100 * M, reserve = 0): Promise<Unit> => {
    counter += 1;
    const u = await h.departmentWithHead(`P-RE${counter}`);
    await h.budgetFor(u, { total: budget, reserve });

    return u;
  };

  const requestMeta = async (id: string): Promise<RequestMetaRow> =>
    (
      await h.ctx.sql.query<RequestMetaRow>(
        `SELECT routing_mode::text, one_step_reason, state::text FROM access_requests WHERE id = $1`,
        [id],
      )
    ).rows[0];

  describe('(d) re-check after requester becomes head returns BLOCKED -> AWAITING_REQUESTER_REVISION', () => {
    it('(d) returns an AWAITING_SPEND_SUBMISSION request exceeding base + reserve to the requester for revision as ONE_STEP', async () => {
      const u = await unit(50 * M, 10 * M);
      const id = await h.paidRequest(u, paid, { amount: 80 * M });
      expect(await h.state(id)).toBe('AWAITING_SPEND_SUBMISSION');

      await h.makeHead(u.department, u.member);

      expect(await requestMeta(id)).toEqual({
        routing_mode: 'ONE_STEP',
        one_step_reason: 'REQUESTER_IS_HEAD',
        state: 'AWAITING_REQUESTER_REVISION',
      });
      expect(await h.steps(id, 'NEED')).toEqual([expect.objectContaining({ state: 'APPROVED' })]);
      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([]);
    });

    it('(d) converts a PENDING request priced above budget into ONE_STEP AWAITING_REQUESTER_REVISION without opening SPEND_APPROVAL', async () => {
      const subId = await h.subscription(50);
      const expensivePlan = await h.planOf(subId);
      await h
        .declareTaxProfile((await h.vendorOf(expensivePlan)).id, [
          { taxType: 'GTGT', ratePercent: '10', deductible: true },
        ])
        .expect(200);
      await h.ctx.sql.query(`UPDATE subscriptions SET unit_price_minor = 120000000 WHERE id = $1`, [subId]);
      const u = await unit(50 * M, 0);
      const sent = await h.sent(u.member, expensivePlan, { termMonths: 1 });
      const needStep = await h.stepOf(sent.id, 'NEED');

      await h.makeHead(u.department, u.member);

      expect(await requestMeta(sent.id)).toEqual({
        routing_mode: 'ONE_STEP',
        one_step_reason: 'REQUESTER_IS_HEAD',
        state: 'AWAITING_REQUESTER_REVISION',
      });
      expect(await h.stepOf(sent.id, 'NEED')).toMatchObject({ id: needStep.id, state: 'NOT_REQUIRED' });
      expect(await h.steps(sent.id, 'SPEND_APPROVAL')).toEqual([]);
    });
  });

  describe('(e) Case B (NEW_SOFTWARE) in AWAITING_IT_ASSESSMENT', () => {
    it('(e) stays in AWAITING_IT_ASSESSMENT when requester becomes head, then converts to ONE_STEP -> AWAITING_SPEND_DECISION when IT completes assessment', async () => {
      const u = await unit();
      await h.setItAdminInCharge(u.department, { employeeId: h.it1.employeeId, account: h.it1 });
      const proposal = await h.proposed(u.member, { termMonths: 1 });
      await h.decide(proposal.id, { decision: 'APPROVE' }, u.head.account).expect(200);
      expect(await h.state(proposal.id)).toBe('AWAITING_IT_ASSESSMENT');

      await h.makeHead(u.department, u.member);

      expect(await requestMeta(proposal.id)).toEqual({
        routing_mode: 'VIA_HEAD',
        one_step_reason: null,
        state: 'AWAITING_IT_ASSESSMENT',
      });
      expect(await h.steps(proposal.id, 'SPEND_APPROVAL')).toEqual([]);

      await h.saveAssessment(proposal.id, h.assessmentBody(), h.it1).expect(200);
      await h.completeAssessment(proposal.id, h.it1).expect(200);

      expect(await requestMeta(proposal.id)).toEqual({
        routing_mode: 'ONE_STEP',
        one_step_reason: 'REQUESTER_IS_HEAD',
        state: 'AWAITING_SPEND_DECISION',
      });
      expect(await h.steps(proposal.id, 'SPEND_APPROVAL')).toHaveLength(1);
      const audits = await h.audit('ACCESS_REQUEST.STEP_NOT_REQUIRED', proposal.id);
      expect(audits).toHaveLength(1);
      expect(audits[0].after).toMatchObject({
        requestId: proposal.id,
        trigger: 'ASSESSMENT_COMPLETED',
        oneStepReason: 'REQUESTER_IS_HEAD',
        requesterBecameHead: true,
      });
    });
  });

  describe('(i) group request exit path when a member beneficiary becomes head', () => {
    it('(i) blocks self-decision and head withdrawal at NEED, allows sender withdrawal of new head line, head decides remainder, and new head individual request goes ONE_STEP', async () => {
      const u = await unit();
      const [e1, e2, e3] = await h.colleagues(u, 3);
      const created = await h.submitGroup(h.groupBody(paid, [e1, e2, e3], { termMonths: 1 }), e1.account).expect(201);
      const groupId = h.dataOf<{ request: { id: string } }>(created).request.id;

      await h.makeHead(u.department, e2);

      expect(await h.state(groupId)).toBe('PENDING');
      const allApprove = [e1, e2, e3].map((person) => ({ employeeId: person.employeeId, decision: 'APPROVE' }));
      const ownBlocked = await h.decideLines(groupId, { lines: allApprove }, e2.account).expect(403);
      expect(h.codeOf(ownBlocked)).toBe('ACCESS_REQUEST.OWN_REQUEST');

      await h.withdrawLine(groupId, e2.employeeId, { reason: 'Cannot withdraw as head' }, e2.account).expect(403);

      await h.withdrawLine(groupId, e2.employeeId, { reason: 'Became department head' }, e1.account).expect(200);
      await h
        .decideLines(
          groupId,
          {
            lines: [
              { employeeId: e1.employeeId, decision: 'APPROVE' },
              { employeeId: e3.employeeId, decision: 'APPROVE' },
            ],
          },
          e2.account,
        )
        .expect(200);
      expect(await h.state(groupId)).toBe('AWAITING_SPEND_SUBMISSION');

      const individual = await h.sent(e2, paid, { termMonths: 1 });
      expect(await requestMeta(individual.id)).toEqual({
        routing_mode: 'ONE_STEP',
        one_step_reason: 'REQUESTER_IS_HEAD',
        state: 'AWAITING_SPEND_DECISION',
      });
    });
  });
});
