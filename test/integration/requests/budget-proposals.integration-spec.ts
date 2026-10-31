import { BudgetHarness, Pageable, ProposalWire, VersionLineWire } from '../../support/budget-harness';
import type { Person } from '../../support/request-harness';

const h = new BudgetHarness();

describe('budgets over HTTP: the proposals of the heads (integration, real PostgreSQL)', () => {
  let des: Awaited<ReturnType<typeof h.departmentWithHead>>;
  let eng: Awaited<ReturnType<typeof h.departmentWithHead>>;
  let headless: Person;

  beforeAll(async () => {
    await h.start();
    des = await h.departmentWithHead('P-DES');
    eng = await h.departmentWithHead('P-ENG');
    const hr = await h.departmentWithUnit('P-HR');
    headless = await h.staff(hr, 'HR-E1');
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const propose = (head: Person, costCenterId: string, over: { lines?: object[]; year?: number } = {}) =>
    h.submitProposal(h.proposalBody(costCenterId, over.lines, over.year), head.account);
  const stateOf = async (id: string) =>
    (await h.ctx.sql.query<{ state: string }>(`SELECT state FROM budget_proposals WHERE id = $1`, [id])).rows[0].state;
  /** A fresh Cost Center each time: a proposal waits for Finance until it is withdrawn or reviewed. */
  const fresh = async (code: string) => h.departmentWithHead(code);

  describe('sending a proposal (US-06-10 AC-1, AC-2, AC-3)', () => {
    it('is sent for the Cost Center of the department with its lines and their total, and Finance sees it waiting', async () => {
      const { head, department } = await fresh('P-A1');

      const response = await propose(head, department.unitId).expect(201);

      const proposal = h.dataOf<{ proposal: ProposalWire }>(response).proposal;
      expect(proposal).toMatchObject({
        state: 'SUBMITTED',
        year: h.next,
        total: { amount: '70000000', currency: h.reporting },
        costCenter: { id: department.unitId },
        submittedBy: { employeeId: head.employeeId },
        previousProposalId: null,
      });
      const waiting = h.dataOf<Pageable<ProposalWire>>(
        await h.proposalList(h.finance, { state: 'SUBMITTED' }).expect(200),
      );
      expect(waiting.items.map((item) => item.id)).toContain(proposal.id);
      const lines = h.dataOf<Pageable<{ position: number; description: string }>>(
        await h.proposalLines(proposal.id, h.finance).expect(200),
      );
      expect(lines.items.map((line) => line.description)).toEqual(['Figma Organization 10 seats', 'Miro 5 seats']);
      const events = await h.auditEvents('BUDGET_PROPOSAL', proposal.id);
      expect(events.map((event) => event.action)).toEqual(['BUDGET_PROPOSAL.SUBMITTED']);
    });

    it('names the line and every field it lacks, and writes nothing (AC-2)', async () => {
      const { head, department } = await fresh('P-A2');
      const before = await h.budgetRows('budget_proposals');
      const miro = h.line({
        description: 'Miro',
        windowFrom: undefined,
        windowTo: undefined,
        servicePeriodMonths: undefined,
        repeatCycle: undefined,
      });

      const response = await propose(head, department.unitId, { lines: [h.line(), miro] }).expect(422);

      expect(h.codeOf(response)).toBe('BUDGET.PROPOSAL_INCOMPLETE');
      expect(h.detailsOf(response)).toEqual({
        lines: [{ line: 2, fields: ['windowFrom', 'windowTo', 'servicePeriodMonths', 'repeatCycle'] }],
      });
      expect(await h.budgetRows('budget_proposals')).toBe(before);
    });

    it.each([
      ['no lines', { lines: [] }],
      ['a line with no description', { lines: [h.line({ description: undefined })] }],
      ['a line with no amount', { lines: [h.line({ amount: undefined })] }],
      ['a window that runs backwards', { lines: [h.line({ windowFrom: '2027-05-01', windowTo: '2027-04-01' })] }],
      ['an amount in another currency', { lines: [h.line({ amount: { amount: '5', currency: 'USD' } })] }],
      ['a negative amount', { lines: [h.line({ amount: h.money(-5) })] }],
    ])('refuses %s', async (_name, over) => {
      const { head, department } = await fresh(`P-B${Math.random().toString(36).slice(2, 6)}`);

      const response = await h.submitProposal({ ...h.proposalBody(department.unitId), ...over }, head.account);

      expect(response.status).toBe(422);
    });

    it("is only for the Cost Center of the head's own department, and only by a head (AC-3)", async () => {
      const { head, department } = await fresh('P-A3');
      const before = await h.budgetRows('budget_proposals');

      const other = await propose(head, eng.department.unitId).expect(403);
      const employee = await propose(des.member, des.department.unitId).expect(403);
      const unheaded = await propose(headless, des.department.unitId).expect(403);
      const finance = await h.submitProposal(h.proposalBody(department.unitId), h.finance).expect(403);
      const it = await h.submitProposal(h.proposalBody(department.unitId), h.it1).expect(403);

      expect(h.codeOf(other)).toBe('BUDGET.NOT_YOUR_COST_CENTER');
      for (const refused of [employee, unheaded, finance, it])
        expect(h.codeOf(refused)).toBe('AUTHORIZATION.FORBIDDEN');
      expect(await h.budgetRows('budget_proposals')).toBe(before);
    });

    it('is not for a Cost Center that does not exist, nor for the company', async () => {
      const response = await propose(des.head, '00000000-0000-4000-8000-000000000000').expect(404);

      expect(h.codeOf(response)).toBe('BUDGET.COST_CENTER_NOT_FOUND');
    });

    it('is the only one that waits for a Cost Center and a year', async () => {
      const { head, department } = await fresh('P-A4');
      await propose(head, department.unitId).expect(201);

      const second = await propose(head, department.unitId).expect(409);
      const otherYear = await propose(head, department.unitId, { year: h.next + 1 }).expect(201);

      expect(h.codeOf(second)).toBe('BUDGET.PROPOSAL_ALREADY_OPEN');
      expect(h.dataOf<{ proposal: ProposalWire }>(otherYear).proposal.year).toBe(h.next + 1);
    });
  });

  describe('which years take a proposal (AC-9)', () => {
    it('takes the year that is running and a year to come, and refuses a year that has ended', async () => {
      const { head, department } = await fresh('P-Y1');

      const running = await propose(head, department.unitId, { year: h.year }).expect(201);
      const ended = await propose(head, department.unitId, { year: h.year - 1 }).expect(422);

      expect(h.dataOf<{ proposal: ProposalWire }>(running).proposal.year).toBe(h.year);
      expect(h.codeOf(ended)).toBe('BUDGET.YEAR_ENDED');
      expect(h.detailsOf(ended)).toEqual({ year: h.year - 1 });
    });
  });

  describe('taking a proposal back (AC-4)', () => {
    it('is allowed while Finance has not sent a version made from it, and Finance then has nothing to do', async () => {
      const { head, department } = await fresh('P-W1');
      const proposal = await h.budgetProposed(head, department.unitId);

      const response = await h.withdraw(proposal.id, head.account).expect(200);

      expect(h.dataOf<{ proposal: ProposalWire }>(response).proposal).toMatchObject({ state: 'WITHDRAWN' });
      const waiting = h.dataOf<Pageable<ProposalWire>>(
        await h.proposalList(h.finance, { state: 'SUBMITTED' }).expect(200),
      );
      expect(waiting.items.map((item) => item.id)).not.toContain(proposal.id);
      await h.budgetProposed(head, department.unitId);
    });

    it('is refused once Finance has sent a version made from it', async () => {
      const { head, department } = await fresh('P-W2');
      const proposal = await h.budgetProposed(head, department.unitId);
      const version = await h.built(proposal.id);
      await h.sendVersion(version.id).expect(200);

      const response = await h.withdraw(proposal.id, head.account).expect(409);

      expect(h.codeOf(response)).toBe('BUDGET.PROPOSAL_CANNOT_WITHDRAW');
      expect(await stateOf(proposal.id)).toBe('REVIEWED');
    });

    it('is for the head of that Cost Center only: anybody else finds nothing', async () => {
      const { head, department } = await fresh('P-W3');
      const proposal = await h.budgetProposed(head, department.unitId);

      await h.withdraw(proposal.id, eng.head.account).expect(404);
      await h.withdraw(proposal.id, h.finance).expect(403);
      expect(await stateOf(proposal.id)).toBe('SUBMITTED');
    });
  });

  describe('giving a proposal back and sending it again (AC-5, AC-6; US-06-09 AC-15)', () => {
    it('is given back with a reason, corrected and sent again as a new proposal that keeps the one before', async () => {
      const { head, department } = await fresh('P-R1');
      const first = await h.budgetProposed(head, department.unitId);

      const missing = await h.giveBack(first.id, {}, h.finance).expect(422);
      const blank = await h.giveBack(first.id, { reason: '  ' }, h.finance).expect(422);
      expect(await stateOf(first.id)).toBe('SUBMITTED');
      const given = await h.giveBack(first.id, { reason: 'No ground for the Miro line' }, h.finance).expect(200);
      const corrected = [h.line(), h.line({ description: 'Miro with its quote', amount: h.money(18_000_000) })];
      const again = await h.resubmit(first.id, { lines: corrected }, head.account).expect(201);

      expect(h.codeOf(missing)).toBe('VALIDATION_ERROR');
      expect(h.codeOf(blank)).toBe('VALIDATION_ERROR');
      expect(h.dataOf<{ proposal: ProposalWire }>(given).proposal).toMatchObject({
        state: 'RETURNED',
        returned: { reason: 'No ground for the Miro line' },
      });
      const second = h.dataOf<{ proposal: ProposalWire }>(again).proposal;
      expect(second).toMatchObject({ state: 'SUBMITTED', previousProposalId: first.id, total: { amount: '68000000' } });
      expect(await stateOf(first.id)).toBe('RETURNED');
      const history = h.dataOf<Pageable<ProposalWire>>(
        await h.proposalList(head.account, { year: h.next }).expect(200),
      );
      expect(history.items.map((item) => item.id)).toEqual(expect.arrayContaining([first.id, second.id]));
      const kept = h.dataOf<Pageable<{ amount: { amount: string } }>>(
        await h.proposalLines(first.id, head.account).expect(200),
      );
      expect(kept.items.map((line) => line.amount.amount)).toEqual(['50000000', '20000000']);
    });

    it('is not edited in place: there is no route to change a proposal or a line of it, and it is sent again only after it was given back', async () => {
      const { head, department } = await fresh('P-R2');
      const proposal = await h.budgetProposed(head, department.unitId);

      for (const method of ['put', 'patch'] as const) {
        const target = `/api/v1/budget-proposals/${proposal.id}`;
        const server = h.server();
        await (
          await import('supertest')
        )
          .default(server)
          [method](target)
          .set(h.as(head.account))
          .send({ lines: [h.line()] })
          .expect(404);
        await (
          await import('supertest')
        )
          .default(server)
          [method](`${target}/lines/1`)
          .set(h.as(h.finance))
          .send({ amount: h.money(1) })
          .expect(404);
      }
      const early = await h.resubmit(proposal.id, { lines: [h.line()] }, head.account).expect(409);

      expect(h.codeOf(early)).toBe('BUDGET.PROPOSAL_CANNOT_RESUBMIT');
    });

    it('is given back only while it waits for Finance, and only by Finance', async () => {
      const { head, department } = await fresh('P-R3');
      const proposal = await h.budgetProposed(head, department.unitId);

      await h.giveBack(proposal.id, { reason: 'No' }, head.account).expect(403);
      await h.withdraw(proposal.id, head.account).expect(200);
      const late = await h.giveBack(proposal.id, { reason: 'No' }, h.finance).expect(409);

      expect(h.codeOf(late)).toBe('BUDGET.PROPOSAL_CANNOT_RETURN');
    });

    it('is resubmitted by the head of that Cost Center only, and not into a year that has ended', async () => {
      const { head, department } = await fresh('P-R4');
      const proposal = await h.budgetProposed(head, department.unitId);
      await h.giveBack(proposal.id, { reason: 'Redo' }, h.finance).expect(200);

      await h.resubmit(proposal.id, { lines: [h.line()] }, eng.head.account).expect(404);
      await h.resubmit(proposal.id, { lines: [h.line()] }, des.member.account).expect(403);
      await h.resubmit(proposal.id, { lines: [h.line()] }, head.account).expect(201);
    });
  });

  describe('what a head reads of the budget (AC-7; US-06-09 AC-5)', () => {
    it('is the proposal, the total and the lines of the current version, with no word of what is left', async () => {
      const { head, department } = await fresh('P-V1');
      const proposal = await h.budgetProposed(head, department.unitId);
      const version = await h.current(proposal.id);

      const mine = h.dataOf<{ budget: Record<string, unknown> }>(await h.mine(head.account, h.next).expect(200)).budget;
      const lines = h.dataOf<Pageable<VersionLineWire>>(await h.mineLines(head.account, h.next).expect(200));

      expect(mine).toMatchObject({
        status: 'ACTIVE',
        year: h.next,
        total: { amount: '80000000' },
        version: { id: version.id, number: 1 },
        proposal: { id: proposal.id, total: { amount: '70000000' } },
      });
      expect(Object.keys(mine).sort()).toEqual([
        'costCenter',
        'latestRefusal',
        'proposal',
        'status',
        'total',
        'version',
        'year',
      ]);
      expect(lines.items.map((line) => [line.description, line.amount.amount, line.overdue])).toEqual([
        ['Figma Organization 10 seats', '50000000', false],
        ['Miro 5 seats', '20000000', false],
      ]);
      expect(lines.items.every((line) => line.financeComment === null && line.adjustmentReason === null)).toBe(true);
      expect(JSON.stringify(lines)).not.toMatch(/remaining|left|check/i);
    });

    it('says there is no active budget, and nothing carries over from a year before (US-06-09 AC-16)', async () => {
      const { head, department } = await fresh('P-V2');
      const proposal = await h.budgetProposed(head, department.unitId, undefined, h.year);
      await h.current(proposal.id);

      const next = h.dataOf<{ budget: Record<string, unknown> }>(await h.mine(head.account, h.next).expect(200)).budget;
      const lines = h.dataOf<Pageable<VersionLineWire>>(await h.mineLines(head.account, h.next).expect(200));
      const revision = await h.createRevision({ costCenterId: department.unitId, year: h.next }).expect(409);

      expect(next).toMatchObject({ status: 'NO_ACTIVE_BUDGET', total: null, version: null });
      expect(lines.items).toEqual([]);
      expect(h.codeOf(revision)).toBe('BUDGET.NO_CURRENT_BUDGET');
    });

    it('flags a line whose purchase window has gone by', async () => {
      const { head, department } = await fresh('P-V3');
      const past = h.line({ windowFrom: `${h.year}-01-01`, windowTo: `${h.year}-01-02`, description: 'Already due' });
      const proposal = await h.budgetProposed(head, department.unitId, [past], h.year);
      await h.current(proposal.id);

      const lines = h.dataOf<Pageable<VersionLineWire>>(await h.mineLines(head.account, h.year).expect(200));

      expect(lines.items.map((line) => line.overdue)).toEqual([
        Number(h.today().slice(5, 7)) > 1 || Number(h.today().slice(8)) > 2,
      ]);
    });

    it('is the department of the head only: another head, a member and a person with no department read nothing of it', async () => {
      const { head, department } = await fresh('P-V4');
      const proposal = await h.budgetProposed(head, department.unitId);
      await h.current(proposal.id);

      const own = h.dataOf<{ budget: { costCenter: { id: string } } }>(
        await h.mine(head.account, h.next).expect(200),
      ).budget;
      const other = h.dataOf<{ budget: { costCenter: { id: string }; status: string } }>(
        await h.mine(eng.head.account, h.next).expect(200),
      ).budget;
      const member = await h.mine(des.member.account, h.next).expect(403);
      const proposals = h.dataOf<Pageable<ProposalWire>>(
        await h.proposalList(eng.head.account, { year: h.next }).expect(200),
      );

      expect(own.costCenter.id).toBe(department.unitId);
      expect(other.costCenter.id).toBe(eng.department.unitId);
      expect(other.status).not.toBe('ACTIVE');
      expect(h.codeOf(member)).toBe('AUTHORIZATION.FORBIDDEN');
      expect(proposals.items.every((item) => item.costCenter.id === eng.department.unitId)).toBe(true);
      await h.proposalOf(proposal.id, eng.head.account).expect(404);
    });

    it('does not include the table of the company: it is Finance only', async () => {
      const { head, department } = await fresh('P-V5');
      const proposal = await h.budgetProposed(head, department.unitId);
      const version = await h.current(proposal.id);

      await h.table(head.account).expect(403);
      await h.table(h.it1).expect(403);
      const rows = h.dataOf<Pageable<{ versionId: string; total: { amount: string } }>>(
        await h.table(h.finance, { year: h.next }).expect(200),
      );

      expect(rows.items.find((row) => row.versionId === version.id)?.total.amount).toBe('80000000');
    });
  });

  describe('a line is a plan, not a quota (AC-8)', () => {
    it('does not stop the head confirming the need of one request more than the line has seats', async () => {
      const { head, department, member } = await fresh('P-Q1');
      const proposal = await h.budgetProposed(head, department.unitId, [
        h.line({ description: 'Miro 1 seat', seats: 1, amount: h.money(4_000_000) }),
      ]);
      await h.current(proposal.id);
      const miro = await h.planOf(await h.subscription(10));

      const first = await h.sent(member, miro);
      const second = await h.sent(await h.staff(department, 'P-Q1-E2'), miro);
      await h.decide(first.id, { decision: 'APPROVE' }, head.account).expect(200);
      const decided = await h.decide(second.id, { decision: 'APPROVE' }, head.account).expect(200);

      expect(h.dataOf<{ request: { state: string } }>(decided).request.state).toBe('AWAITING_SPEND_SUBMISSION');
    });
  });
});
