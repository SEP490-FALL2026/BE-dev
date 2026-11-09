import { as, listAll, summarize, yearOf } from '../demo-step-kit';
import type { DemoRunContext, DemoStep, StepOutcome } from '../demo-run.types';
import type { DemoBudget, DemoNextYear } from '../fixture/demo-fixture.types';
import { financePerson, money, proposalLines } from './finance-kit';

type Result = { status: StepOutcome['status']; label: string };

interface Row {
  id: string;
  costCenter: { id: string };
  state: string;
  number?: number;
}

type Move = { done: boolean; action: string | null };

const headOf = (ctx: DemoRunContext, department: string): string =>
  ctx.fixture.departments.find((candidate) => candidate.code === department)?.head ?? '';

/** The latest version of a Cost Center in a year (the list runs by number within a Cost Center), or none. */
async function latestVersion(ctx: DemoRunContext, finance: string, costCenterId: string, year: number) {
  const versions = (await listAll<Row>(ctx, finance, `/budget-versions?year=${year}`)).filter(
    (row) => row.costCenter.id === costCenterId,
  );

  return [...versions].sort((a, b) => (b.number ?? 0) - (a.number ?? 0))[0];
}

async function act(ctx: DemoRunContext, action: string, write: () => Promise<unknown>): Promise<Move> {
  if (ctx.mode === 'apply') await write();

  return { done: false, action };
}

/** The proposal the head of a department sent for the year, if any. */
async function proposalOf(ctx: DemoRunContext, department: string, costCenterId: string, year: number) {
  const headEmail = await as(ctx, headOf(ctx, department));
  const proposals = (await listAll<Row>(ctx, headEmail, `/budget-proposals?year=${year}`)).filter(
    (row) => row.costCenter.id === costCenterId,
  );

  return { proposal: proposals[0], headEmail };
}

function propose(ctx: DemoRunContext, plan: Pick<DemoBudget, 'lines'>, to: { headEmail: string; year: number }) {
  return ctx.api.call(to.headEmail, 'POST', '/budget-proposals', {
    year: to.year,
    lines: proposalLines(ctx, plan.lines),
  });
}

/** One turn of the chain of the budget of the year of a department: the one next action, read from where the chain stands. */
async function currentYearTurn(ctx: DemoRunContext, plan: DemoBudget, year: number): Promise<Move> {
  const costCenterId = ctx.ids.costCenters.get(plan.department) ?? '';
  const finance = await as(ctx, financePerson(ctx));
  const version = await latestVersion(ctx, finance, costCenterId, year);
  if (version) {
    if (version.state === 'APPROVED') return { done: true, action: null };
    if (version.state === 'DRAFT') {
      return act(ctx, 'Finance gửi phiên bản', () =>
        ctx.api.call(finance, 'POST', `/budget-versions/${version.id}/submission`),
      );
    }
    if (version.state !== 'SENT') return { done: false, action: null };
    const approver = await as(ctx, ctx.fixture.approvalRoles.SPENDING_APPROVER);

    return act(ctx, 'Người duyệt chi duyệt phiên bản', () =>
      ctx.api.call(approver, 'POST', `/budget-versions/${version.id}/decision`, { decision: 'APPROVE' }),
    );
  }
  if (plan.origin === 'BASELINE') {
    // A department with no head cannot propose: Finance builds the version from the baseline of its seats (`QĐ-103`).
    return act(ctx, 'Finance lập phiên bản số liệu nền', () =>
      ctx.api.call(finance, 'POST', '/budget-versions', { source: 'BASELINE', costCenterId, year }),
    );
  }
  const { proposal, headEmail } = await proposalOf(ctx, plan.department, costCenterId, year);
  if (!proposal) return act(ctx, 'trưởng phòng gửi đề xuất', () => propose(ctx, plan, { headEmail, year }));
  if (proposal.state !== 'SUBMITTED') return { done: false, action: null };

  return act(ctx, 'Finance lập phiên bản', () =>
    // The server sets the reserve to the default 10 % of the base; a different share would carry `reserveReason`.
    ctx.api.call(finance, 'POST', '/budget-versions', { proposalId: proposal.id, base: money(plan.base) }),
  );
}

async function walk(
  ctx: DemoRunContext,
  turn: () => Promise<Move>,
  done: string,
): Promise<{ status: StepOutcome['status']; detail: string }> {
  let moved = false;
  for (let turns = 0; turns < 6; turns++) {
    const move = await turn();
    if (move.done) return { status: moved ? 'done' : 'present', detail: done };
    if (move.action === null) return { status: 'conflict', detail: 'chuỗi ngân sách đã đi hướng khác' };
    if (ctx.mode === 'plan') return { status: 'planned', detail: `bước kế tiếp: ${move.action}` };
    moved = true;
  }

  return { status: 'conflict', detail: 'chuỗi ngân sách không tới được trạng thái cần' };
}

/** The approved budget of the year of every department that has a Cost Center, each through its whole chain. */
async function currentYear(ctx: DemoRunContext): Promise<StepOutcome> {
  const year = yearOf(ctx).year;
  const results: Result[] = [];
  for (const plan of ctx.fixture.budgets) {
    const outcome = await walk(ctx, () => currentYearTurn(ctx, plan, year), 'ngân sách năm hiện hành đã được duyệt');
    results.push({ status: outcome.status, label: `${plan.department} ${year}: ${outcome.detail}` });
  }

  return summarize(results);
}

/** One turn towards the stage the next-year budget of a department is left at. */
async function nextYearTurn(ctx: DemoRunContext, plan: DemoNextYear, year: number): Promise<Move> {
  const costCenterId = ctx.ids.costCenters.get(plan.department) ?? '';
  const finance = await as(ctx, financePerson(ctx));
  const version = await latestVersion(ctx, finance, costCenterId, year);
  const approver = ctx.fixture.approvalRoles.SPENDING_APPROVER;
  if (version) {
    // A version that exists in any state is the dataset's: the demo may have moved it on, and the seed never undoes that.
    if (plan.stage !== 'CHANGES_REQUESTED') return { done: true, action: null };
    if (version.state === 'DRAFT') {
      return act(ctx, 'Finance gửi phiên bản', () =>
        ctx.api.call(finance, 'POST', `/budget-versions/${version.id}/submission`),
      );
    }
    if (version.state !== 'SENT') return { done: true, action: null };

    return act(ctx, 'Người duyệt chi yêu cầu sửa', async () =>
      ctx.api.call(await as(ctx, approver), 'POST', `/budget-versions/${version.id}/decision`, {
        decision: 'REQUEST_CHANGES',
        reason: plan.reason,
      }),
    );
  }
  const { proposal, headEmail } = await proposalOf(ctx, plan.department, costCenterId, year);
  if (!proposal) return act(ctx, 'trưởng phòng gửi đề xuất', () => propose(ctx, plan, { headEmail, year }));
  if (plan.stage === 'PROPOSAL_SUBMITTED') return { done: true, action: null };
  if (proposal.state !== 'SUBMITTED') return { done: false, action: null };

  return act(ctx, 'Finance lập phiên bản', () =>
    ctx.api.call(finance, 'POST', '/budget-versions', { proposalId: proposal.id, base: money(plan.base) }),
  ).then(async (move) => {
    if (ctx.mode !== 'apply' || plan.stage !== 'VERSION_SENT') return move;
    const created = await latestVersion(ctx, finance, costCenterId, year);
    if (created?.state === 'DRAFT') await ctx.api.call(finance, 'POST', `/budget-versions/${created.id}/submission`);

    return { done: false, action: 'Finance gửi phiên bản' };
  });
}

/** The budgets of the next year, each left where the demo carries on from (a proposal, a sent version, a version sent back). */
async function nextYear(ctx: DemoRunContext): Promise<StepOutcome> {
  const year = yearOf(ctx).year + 1;
  const results: Result[] = [];
  for (const plan of ctx.fixture.nextYear) {
    const outcome = await walk(ctx, () => nextYearTurn(ctx, plan, year), plan.stage);
    results.push({ status: outcome.status, label: `${plan.department} ${year}: ${outcome.detail}` });
  }

  return summarize(results);
}

export function budgetSteps(): DemoStep[] {
  return [
    {
      key: 'budget.year',
      title: 'Ngân sách năm hiện hành của mọi phòng có Cost Center (trưởng phòng → Finance → Người duyệt chi)',
      needs: [
        'budget.cycles',
        'finance.cost-centers',
        'catalog.plans',
        'catalog.baseline-close',
        'org.heads',
        'org.approval-roles',
      ],
      run: currentYear,
    },
    {
      key: 'budget.next-year',
      title: 'Ngân sách năm sau: đề xuất chờ Finance, phiên bản chờ Người duyệt chi, phiên bản bị yêu cầu sửa',
      needs: ['budget.cycles', 'finance.cost-centers', 'catalog.plans', 'org.heads', 'org.approval-roles'],
      run: nextYear,
    },
  ];
}
