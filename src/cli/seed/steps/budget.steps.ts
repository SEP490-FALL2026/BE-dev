import { as, listAll, summarize, tag, yearOf } from '../demo-step-kit';
import type { DemoRunContext, DemoStep, StepOutcome } from '../demo-run.types';
import type { DemoBudget, DemoNextYear } from '../fixture/demo-fixture.types';
import { yesChecklist } from './checklist-kit';
import { proposalFile, versionFile } from './budget-files';
import { baseFor } from './budget-targets';
import { uploadBudgetFile } from './file-kit';
import { financePerson, money } from './finance-kit';

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

/** `BM-10` (`QĐ-111ab`): the head uploads the filled-in form first, then sends one amount for the year with it. */
async function propose(
  ctx: DemoRunContext,
  plan: { department: string; amount: string; note?: string },
  to: { headEmail: string; year: number },
) {
  const file = await uploadBudgetFile(
    ctx,
    to.headEmail,
    '/budget-proposals/attachments',
    await proposalFile(ctx, to.headEmail, plan, to.year),
  );

  return ctx.api.call(to.headEmail, 'POST', '/budget-proposals', {
    year: to.year,
    requestedAmount: money(plan.amount),
    ...(plan.note ? { note: plan.note } : {}),
    attachmentIds: [file],
  });
}

/** Finance sends a draft version to the spending approver; a version is sent with at least one file of its own. */
async function sendVersion(ctx: DemoRunContext, finance: string, versionId: string, label: string): Promise<unknown> {
  const files = await listAll<{ id: string }>(ctx, finance, `/budget-versions/${versionId}/attachments`);
  if (files.length === 0) {
    const file = await versionFile(ctx, finance, versionId, `phien-ban-${label}.xlsx`);
    await uploadBudgetFile(ctx, finance, `/budget-versions/${versionId}/attachments`, file);
  }

  return ctx.api.call(finance, 'POST', `/budget-versions/${versionId}/submission`);
}

/** The spending approver decides a sent version with the checklist of step 4.7 all Yes. */
async function decide(ctx: DemoRunContext, versionId: string, decision: 'APPROVE' | 'RETURN', reason?: string) {
  const approver = await as(ctx, ctx.fixture.approvalRoles.SPENDING_APPROVER);

  return ctx.api.call(approver, 'POST', `/budget-versions/${versionId}/decision`, {
    decision,
    ...(reason ? { reason } : {}),
    checklist: await yesChecklist(ctx, approver, '4.7'),
  });
}

/**
 * One turn of the chain of the budget of a department and year towards `stage`: the one next action, read from where the chain stands.
 * A version in a state past the stage is the dataset's (the demo may have moved it on) and is left as it is.
 */
async function turn(
  ctx: DemoRunContext,
  plan: {
    department: string;
    amount: string;
    base: string;
    note?: string;
    reason?: string;
    reserve?: { percent: number; reason: string };
  },
  stage: DemoNextYear['stage'],
  year: number,
): Promise<Move> {
  const costCenterId = ctx.ids.costCenters.get(plan.department) ?? '';
  const finance = await as(ctx, financePerson(ctx));
  const version = await latestVersion(ctx, finance, costCenterId, year);
  const label = `${plan.department}-${year}`;
  if (version) return versionTurn(ctx, { finance, label, reason: plan.reason }, version, stage);
  const { proposal, headEmail } = await proposalOf(ctx, plan.department, costCenterId, year);
  if (!proposal) return act(ctx, 'trưởng phòng gửi BM-10', () => propose(ctx, plan, { headEmail, year }));
  if (stage === 'PROPOSAL_SUBMITTED') return { done: true, action: null };
  if (proposal.state !== 'SUBMITTED') return { done: false, action: null };

  return act(ctx, 'Finance lập phiên bản', () =>
    // The server sets the reserve to the default 10 % of the base; a different share carries its `reserveReason` (the tag of the dataset first).
    ctx.api.call(finance, 'POST', '/budget-versions', {
      proposalId: proposal.id,
      base: money(plan.base),
      ...(plan.reserve
        ? { reservePercent: plan.reserve.percent, reserveReason: `${tag(ctx, 'RESERVE')} ${plan.reserve.reason}` }
        : {}),
    }),
  );
}

/** The next move of a version that exists, towards `stage`. */
async function versionTurn(
  ctx: DemoRunContext,
  by: { finance: string; label: string; reason?: string },
  version: Row,
  stage: DemoNextYear['stage'],
): Promise<Move> {
  if (version.state === 'DRAFT') {
    return act(ctx, 'Finance gửi phiên bản', () => sendVersion(ctx, by.finance, version.id, by.label));
  }
  if (version.state === 'SENT' && stage === 'APPROVED') {
    return act(ctx, 'Người duyệt chi duyệt phiên bản', () => decide(ctx, version.id, 'APPROVE'));
  }
  if (version.state === 'SENT' && stage === 'VERSION_RETURNED') {
    return act(ctx, 'Người duyệt chi trả phiên bản về Finance', () => decide(ctx, version.id, 'RETURN', by.reason));
  }
  const reached: Record<DemoNextYear['stage'], boolean> = {
    APPROVED: version.state === 'APPROVED',
    VERSION_SENT: version.state === 'SENT',
    VERSION_RETURNED: version.state === 'CHANGES_REQUESTED',
    PROPOSAL_SUBMITTED: true,
  };

  return reached[stage] ? { done: true, action: null } : { done: false, action: null };
}

async function walk(
  ctx: DemoRunContext,
  next: () => Promise<Move>,
  done: string,
): Promise<{ status: StepOutcome['status']; detail: string }> {
  let moved = false;
  for (let turns = 0; turns < 8; turns++) {
    const move = await next();
    if (move.done) return { status: moved ? 'done' : 'present', detail: done };
    if (move.action === null) return { status: 'conflict', detail: 'chuỗi ngân sách đã đi hướng khác' };
    if (ctx.mode === 'plan') return { status: 'planned', detail: `bước kế tiếp: ${move.action}` };
    moved = true;
  }

  return { status: 'conflict', detail: 'chuỗi ngân sách không tới được trạng thái cần' };
}

/**
 * The base of a department of the year: counted from the day of the seed for the four that carry a light (SPEC S24), the fixture's amount for the
 * others. A light a day cannot give (before June there is no `UNDER`) is named in the label and never a conflict.
 */
export function yearPlanOf(ctx: DemoRunContext, plan: DemoBudget): { base: string; label: string } {
  const choice = baseFor(ctx.fixture, plan.department, ctx.today);
  if (!choice) return { base: plan.base, label: '' };
  const label = choice.reachable
    ? ` (đèn ${choice.wanted})`
    : ` (đèn ${choice.wanted} chưa đạt được ở ngày này, ra ${choice.light})`;

  return { base: String(choice.base), label };
}

/** The approved budget of the year of every department with a Cost Center and a head, each through its whole chain. */
async function currentYear(ctx: DemoRunContext): Promise<StepOutcome> {
  const year = yearOf(ctx).year;
  const results: Result[] = [];
  for (const plan of ctx.fixture.budgets) {
    const { base, label } = yearPlanOf(ctx, plan);
    const choice = baseFor(ctx.fixture, plan.department, ctx.today);
    const outcome = await walk(
      ctx,
      () =>
        turn(
          ctx,
          { ...plan, base, amount: base, reserve: plan.reserve && choice ? plan.reserve : undefined },
          'APPROVED',
          year,
        ),
      'ngân sách năm hiện hành đã được duyệt',
    );
    results.push({ status: outcome.status, label: `${plan.department} ${year}: ${outcome.detail}${label}` });
  }

  return summarize(results);
}

/** The budgets of the next year, each left where the demo carries on from (DEMO-15). */
async function nextYear(ctx: DemoRunContext): Promise<StepOutcome> {
  const year = yearOf(ctx).year + 1;
  const results: Result[] = [];
  for (const plan of ctx.fixture.nextYear) {
    const outcome = await walk(
      ctx,
      () => turn(ctx, { ...plan, amount: plan.requestedAmount }, plan.stage, year),
      plan.stage,
    );
    results.push({ status: outcome.status, label: `${plan.department} ${year}: ${outcome.detail}` });
  }

  return summarize(results);
}

export function budgetSteps(): DemoStep[] {
  return [
    {
      key: 'budget.year',
      title: 'Ngân sách năm hiện hành của mọi phòng có Cost Center và trưởng phòng (BM-10 → Finance → Người duyệt chi)',
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
      title:
        'Ngân sách năm sau: một phòng đã duyệt, BM-10 chờ Finance, phiên bản chờ Người duyệt chi, phiên bản bị trả về',
      needs: ['budget.cycles', 'finance.cost-centers', 'catalog.plans', 'org.heads', 'org.approval-roles'],
      run: nextYear,
    },
  ];
}
