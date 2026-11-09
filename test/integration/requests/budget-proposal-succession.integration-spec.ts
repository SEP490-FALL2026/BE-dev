import type request from 'supertest';
import { BudgetHarness, type ProposalWire, type VersionWire } from '../../support/budget-harness';
import { waitForLockWaiters } from '../../support/lock-wait';
import type { Person } from '../../support/request-harness';

const h = new BudgetHarness();

/**
 * `g0-g6-final-business-baseline-remediation`, Tasks 4.7 (F63, F64): a refusal leaves the proposal reviewed; Finance makes the next
 * version from the same proposal, which points at the refused one; the head sends a new proposal that follows it when the need changed
 * (spec J.1); and a revision is not begun for a department nobody heads (`QĐ-92d(1)`).
 */
describe('the version after a refusal and the successor of a proposal (integration, real PostgreSQL)', () => {
  let boss: Person;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    const executive = await h.departmentWithUnit('P-EXE');
    boss = await h.staff(executive, 'EXE-C1');
    await h.makeHead(executive, await h.staff(executive, 'EXE-H1')); // the Spending Approver does not head a department (QĐ-93b)
    await h.setRole('SPENDING_APPROVER', boss);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const refuse = (id: string) =>
    h.decideVersion(id, { decision: 'REJECT', reason: 'The reserve is too high' }, boss.account);
  /** A department with a proposal and the first version made from it, sent and refused. */
  const refused = async () => {
    counter += 1;
    const u = await h.departmentWithHead(`P-SU${counter}`);
    const proposal = await h.budgetProposed(u.head, u.department.unitId);
    const version = await h.built(proposal.id);
    await h.sendVersion(version.id).expect(200);
    await refuse(version.id).expect(200);

    return { ...u, proposal, version };
  };
  const body = (proposalId: string) => ({
    proposalId,
    base: h.money(60_000_000),
    reserve: h.money(20_000_000),
    reserveReason: 'Test reserve',
  });
  const proposalRow = async (id: string) =>
    (
      await h.ctx.sql.query<{ state: string; succeeded_at: Date | null; successor_of_proposal_id: string | null }>(
        `SELECT state::text, succeeded_at, successor_of_proposal_id FROM budget_proposals WHERE id = $1`,
        [id],
      )
    ).rows[0];
  const proposalOf = async (id: string) =>
    h.dataOf<{ proposal: ProposalWire }>(await h.proposalOf(id, h.finance).expect(200)).proposal;

  describe('the next version, made from the same proposal (US-06-09 AC-22, US-06-11 AC-3)', () => {
    it('is a new draft that points at the refused version, while the proposal stays reviewed and cannot be given back', async () => {
      const r = await refused();

      const next = h.dataOf<{ version: VersionWire }>(await h.createVersion(body(r.proposal.id)).expect(201)).version;
      const giveBack = await h.giveBack(r.proposal.id, { reason: 'Add the quotes' }, h.finance).expect(409);

      expect(next).toMatchObject({ number: 2, kind: 'INITIAL', state: 'DRAFT', rejectedPredecessorId: r.version.id });
      expect(h.codeOf(giveBack)).toBe('BUDGET.PROPOSAL_CANNOT_RETURN');
      expect((await proposalOf(r.proposal.id)).state).toBe('REVIEWED');
    });

    it('leaves the refused version as it was, and refuses a second one while the next is in progress', async () => {
      const r = await refused();
      await h.createVersion(body(r.proposal.id)).expect(201);

      const again = await h.createVersion(body(r.proposal.id)).expect(409);
      const edit = await h.updateVersion(r.version.id, { base: h.money(1) }).expect(409);

      // Spec J.1: a reviewed proposal takes a new version only while its latest one is refused, so the second is `PROPOSAL_NOT_SUBMITTED`.
      expect(h.codeOf(again)).toBe('BUDGET.PROPOSAL_NOT_SUBMITTED');
      expect(h.codeOf(edit)).toBe('BUDGET.VERSION_NOT_EDITABLE');
      const kept = h.dataOf<{ version: VersionWire }>(await h.versionOf(r.version.id).expect(200)).version;
      expect(kept).toMatchObject({ state: 'REJECTED', decision: { decision: 'REJECTED' } });
    });

    it('is made again after the second one is refused too, each pointing at the one before', async () => {
      const r = await refused();
      const v2 = h.dataOf<{ version: VersionWire }>(await h.createVersion(body(r.proposal.id)).expect(201)).version;
      await h.sendVersion(v2.id).expect(200);
      await refuse(v2.id).expect(200);

      const third = h.dataOf<{ version: VersionWire }>(await h.createVersion(body(r.proposal.id)).expect(201)).version;

      expect(third).toMatchObject({ number: 3, rejectedPredecessorId: v2.id });
      expect(v2.rejectedPredecessorId).toBe(r.version.id);
    });

    it('is made for a proposal of a department nobody heads: it was already sent (US-06-09 AC-23)', async () => {
      const r = await refused();
      await h.withoutHead(r.department);

      const next = await h.createVersion(body(r.proposal.id)).expect(201);

      expect(h.dataOf<{ version: VersionWire }>(next).version.rejectedPredecessorId).toBe(r.version.id);
    });
  });

  describe('a new proposal that follows the reviewed one (US-06-10 AC-13)', () => {
    it('is sent by the head when the latest version was refused: the system links it, and the first proposal stays reviewed', async () => {
      const r = await refused();

      const successor = h.dataOf<{ proposal: ProposalWire }>(
        await h.submitProposal(h.proposalBody(r.department.unitId), r.head.account).expect(201),
      ).proposal;

      expect(successor).toMatchObject({
        state: 'SUBMITTED',
        successorOfProposalId: r.proposal.id,
        previousProposalId: null,
      });
      const first = await proposalOf(r.proposal.id);
      expect(first).toMatchObject({ state: 'REVIEWED', successorProposalId: successor.id });
      expect(first.succeededAt).not.toBeNull();
      expect(await proposalRow(successor.id)).toMatchObject({
        state: 'SUBMITTED',
        successor_of_proposal_id: r.proposal.id,
      });
      const sent = (await h.auditEvents('BUDGET_PROPOSAL', successor.id)).find(
        (e) => e.action === 'BUDGET_PROPOSAL.SUBMITTED',
      );
      expect(sent?.after).toMatchObject({ successorOfProposalId: r.proposal.id });
    });

    it('is not sent a second time, and a client cannot name the proposal to follow', async () => {
      const r = await refused();
      await h.submitProposal(h.proposalBody(r.department.unitId), r.head.account).expect(201);

      const second = await h.submitProposal(h.proposalBody(r.department.unitId), r.head.account).expect(409);
      const named = await h
        .submitProposal(
          { ...h.proposalBody(r.department.unitId), successorOfProposalId: r.proposal.id },
          r.head.account,
        )
        .expect(422);

      expect(h.codeOf(second)).toBe('BUDGET.PROPOSAL_ALREADY_OPEN');
      expect(h.codeOf(named)).toBe('VALIDATION_ERROR');
    });

    it('is not sent while the latest version made from the proposal is in progress or waits for the approver', async () => {
      const r = await refused();
      const next = await h.built(r.proposal.id);

      const inProgress = await h.submitProposal(h.proposalBody(r.department.unitId), r.head.account).expect(409);
      await h.sendVersion(next.id).expect(200);
      const waiting = await h.submitProposal(h.proposalBody(r.department.unitId), r.head.account).expect(409);

      expect(h.codeOf(inProgress)).toBe('BUDGET.PROPOSAL_ALREADY_OPEN');
      expect(h.codeOf(waiting)).toBe('BUDGET.PROPOSAL_ALREADY_OPEN');
    });

    it('takes the next version from the successor, and no longer from the proposal it follows', async () => {
      const r = await refused();
      const successor = h.dataOf<{ proposal: ProposalWire }>(
        await h.submitProposal(h.proposalBody(r.department.unitId), r.head.account).expect(201),
      ).proposal;

      const fromFirst = await h.createVersion(body(r.proposal.id)).expect(409);
      const fromSuccessor = h.dataOf<{ version: VersionWire }>(
        await h.createVersion(body(successor.id)).expect(201),
      ).version;

      expect(h.codeOf(fromFirst)).toBe('BUDGET.PROPOSAL_NOT_SUBMITTED');
      // The version made from a successor follows the proposal, not a refused version.
      expect(fromSuccessor).toMatchObject({ proposalId: successor.id, rejectedPredecessorId: null });
    });
  });

  describe('the head and Finance meet at the reviewed proposal (barrier on its row)', () => {
    it('Finance makes the version first: the head finds a proposal that is still open', async () => {
      const r = await refused();
      const holder = await h.holdRow('budget_proposals', r.proposal.id);
      const queued: Array<Promise<request.Response>> = [];
      try {
        queued.push(h.createVersion(body(r.proposal.id)).then((response) => response));
        await waitForLockWaiters(h.ctx.sql, 1);
        queued.push(h.submitProposal(h.proposalBody(r.department.unitId), r.head.account).then((response) => response));
        await waitForLockWaiters(h.ctx.sql, 2);
      } finally {
        await holder.release();
      }
      const [finance, head] = await Promise.all(queued);

      expect([finance.status, head.status]).toEqual([201, 409]);
      expect(h.codeOf(head)).toBe('BUDGET.PROPOSAL_ALREADY_OPEN');
      expect((await proposalRow(r.proposal.id)).succeeded_at).toBeNull();
    });

    it('the head sends the successor first: Finance finds a proposal that no longer waits', async () => {
      const r = await refused();
      const holder = await h.holdRow('budget_proposals', r.proposal.id);
      const queued: Array<Promise<request.Response>> = [];
      try {
        queued.push(h.submitProposal(h.proposalBody(r.department.unitId), r.head.account).then((response) => response));
        await waitForLockWaiters(h.ctx.sql, 1);
        queued.push(h.createVersion(body(r.proposal.id)).then((response) => response));
        await waitForLockWaiters(h.ctx.sql, 2);
      } finally {
        await holder.release();
      }
      const [head, finance] = await Promise.all(queued);

      expect([head.status, finance.status]).toEqual([201, 409]);
      expect(h.codeOf(finance)).toBe('BUDGET.PROPOSAL_NOT_SUBMITTED');
      expect((await proposalRow(r.proposal.id)).succeeded_at).not.toBeNull();
    });

    it('two successors at once: one is sent and the other finds the proposal already followed', async () => {
      const r = await refused();
      const holder = await h.holdRow('budget_proposals', r.proposal.id);
      const queued: Array<Promise<request.Response>> = [];
      try {
        for (const waiters of [1, 2]) {
          queued.push(
            h.submitProposal(h.proposalBody(r.department.unitId), r.head.account).then((response) => response),
          );
          await waitForLockWaiters(h.ctx.sql, waiters);
        }
      } finally {
        await holder.release();
      }
      const answers = await Promise.all(queued);

      expect(answers.map((answer) => answer.status)).toEqual([201, 409]);
      expect(h.codeOf(answers[1])).toBe('BUDGET.PROPOSAL_ALREADY_OPEN');
      expect(await h.budgetRows(`budget_proposals WHERE successor_of_proposal_id = '${r.proposal.id}'`)).toBe(1);
    });
  });
  describe('a version for a department nobody heads (F64, QĐ-92d(1), US-06-09 AC-23)', () => {
    it('lets a version that was begun before the head left be sent and decided', async () => {
      counter += 1;
      const u = await h.departmentWithHead(`P-SH${counter}`);
      const proposal = await h.budgetProposed(u.head, u.department.unitId);
      const draft = await h.built(proposal.id);
      await h.withoutHead(u.department);

      await h.sendVersion(draft.id).expect(200);
      await h.decideVersion(draft.id, { decision: 'APPROVE' }, boss.account).expect(200);

      expect(await h.budgetRows(`budget_versions WHERE id = '${draft.id}' AND state = 'APPROVED'`)).toBe(1);
    });
  });
});
