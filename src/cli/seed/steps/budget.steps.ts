import { dayOffset } from '../demo-dates';
import { as, listAll, summarize, tag, yearOf } from '../demo-step-kit';
import type { DemoRunContext, DemoStep, StepOutcome } from '../demo-run.types';
import type { DemoBudget, DemoNextYear } from '../fixture/demo-fixture.types';
import { yesChecklist } from './checklist-kit';
import { proposalFile, versionFile } from './budget-files';
import { baseFor, tightBaseFor } from './budget-targets';
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

interface YearPlanEntry {
  department: string;
  amount: string;
  base: string;
  note?: string;
  reason?: string;
  reserve?: { percent: number; reason: string };
  stage: DemoNextYear['stage'];
  doneDetail: string;
  labelSuffix?: string;
}

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

/** Sends one department budget proposal (`BM-10`) after uploading its workbook. */
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

/** Creates proposal and draft version while the cycle is open, stopping as soon as a version (or target proposal) exists. */
async function prepareTurn(ctx: DemoRunContext, finance: string, plan: YearPlanEntry, year: number): Promise<Move> {
  const costCenterId = ctx.ids.costCenters.get(plan.department) ?? '';
  const version = await latestVersion(ctx, finance, costCenterId, year);
  if (version) return { done: true, action: null };
  const { proposal, headEmail } = await proposalOf(ctx, plan.department, costCenterId, year);
  if (!proposal) return act(ctx, 'trưởng phòng gửi BM-10', () => propose(ctx, plan, { headEmail, year }));
  if (plan.stage === 'PROPOSAL_SUBMITTED') return { done: true, action: null };
  if (proposal.state !== 'SUBMITTED') return { done: false, action: null };

  return act(ctx, 'Finance lập phiên bản', () =>
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

/** Advances an entry once phase 1/2 have handled proposal, draft creation, and locked-window version submission. */
async function turn(ctx: DemoRunContext, finance: string, plan: YearPlanEntry, year: number): Promise<Move> {
  const costCenterId = ctx.ids.costCenters.get(plan.department) ?? '';
  const version = await latestVersion(ctx, finance, costCenterId, year);
  const label = `${plan.department}-${year}`;
  if (version) return versionTurn(ctx, { finance, label, reason: plan.reason }, version, plan.stage);

  return prepareTurn(ctx, finance, plan, year);
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

async function collectDrafts(
  ctx: DemoRunContext,
  finance: string,
  entries: readonly YearPlanEntry[],
  year: number,
): Promise<{ entry: YearPlanEntry; versionId: string }[]> {
  const versions = await listAll<Row>(ctx, finance, `/budget-versions?year=${year}`);
  const drafts: { entry: YearPlanEntry; versionId: string }[] = [];
  for (const entry of entries) {
    if (entry.stage === 'PROPOSAL_SUBMITTED') continue;
    const ccId = ctx.ids.costCenters.get(entry.department) ?? '';
    const latest = versions
      .filter((row) => row.costCenter.id === ccId)
      .sort((a, b) => (b.number ?? 0) - (a.number ?? 0))[0];
    if (latest?.state === 'DRAFT') drafts.push({ entry, versionId: latest.id });
  }

  return drafts;
}

/**
 * Sends the drafts of the year to the spending approver, which only a locked cycle takes (`QĐ-111z`). The dataset is made on the day its cycles are open, so the
 * seed moves the submission deadline of the cycle to the day before and leaves it there: the cycle stays locked with the versions it holds, as the day after
 * the deadline would have made it. A cycle already locked is left as it is.
 */
async function submitDraftsInLockedCycle(
  ctx: DemoRunContext,
  finance: string,
  drafts: readonly { entry: YearPlanEntry; versionId: string }[],
  year: number,
): Promise<Set<string>> {
  if (drafts.length === 0 || ctx.mode !== 'apply') return new Set();
  const cycle = await ctx.api.call<{ status?: string } | undefined>(finance, 'GET', `/budget-cycles/${year}`);
  if (cycle?.status !== 'LOCKED') await ctx.accounts.lockBudgetCycle(year, dayOffset(ctx.today, -1));
  for (const draft of drafts) {
    await sendVersion(ctx, finance, draft.versionId, `${draft.entry.department}-${year}`);
  }

  return new Set(drafts.map((draft) => draft.entry.department));
}

async function runYearPlans(ctx: DemoRunContext, year: number, entries: readonly YearPlanEntry[]): Promise<Result[]> {
  const finance = await as(ctx, financePerson(ctx));
  const prepared = new Map<string, { status: StepOutcome['status']; detail: string }>();
  for (const entry of entries) {
    prepared.set(entry.department, await walk(ctx, () => prepareTurn(ctx, finance, entry, year), entry.doneDetail));
  }
  const drafts = await collectDrafts(ctx, finance, entries, year);
  const draftsSent = await submitDraftsInLockedCycle(ctx, finance, drafts, year);
  const results: Result[] = [];
  for (const entry of entries) {
    const first = prepared.get(entry.department)!;
    const outcome =
      first.status === 'planned' || first.status === 'conflict' || entry.stage === 'PROPOSAL_SUBMITTED'
        ? first
        : await walk(ctx, () => turn(ctx, finance, entry, year), entry.doneDetail);
    const movedBefore = first.status === 'done' || draftsSent.has(entry.department);
    const status = outcome.status === 'present' && movedBefore ? 'done' : outcome.status;
    results.push({ status, label: `${entry.department} ${year}: ${outcome.detail}${entry.labelSuffix ?? ''}` });
  }

  return results;
}

/**
 * The base of a department of the year: counted from the day of the seed for the four that carry a light,
 * or the fixture amount for the others.
 */
export function yearPlanOf(ctx: DemoRunContext, plan: DemoBudget): { base: string; label: string } {
  const choice = baseFor(ctx.fixture, plan.department, ctx.today);
  if (!choice) {
    const tight = tightBaseFor(ctx.fixture, plan.department, ctx.today);

    return { base: tight === null ? plan.base : String(tight), label: '' };
  }
  const label = choice.reachable
    ? ` (đèn ${choice.wanted})`
    : ` (đèn ${choice.wanted} chưa đạt được ở ngày này, ra ${choice.light})`;

  return { base: String(choice.base), label };
}

/** The approved budget of the year of every department with a Cost Center and a head, each through its whole chain. */
async function currentYear(ctx: DemoRunContext): Promise<StepOutcome> {
  const year = yearOf(ctx).year;
  const entries: YearPlanEntry[] = ctx.fixture.budgets.map((plan) => {
    const { base, label } = yearPlanOf(ctx, plan);
    const choice = baseFor(ctx.fixture, plan.department, ctx.today);
    return {
      ...plan,
      base,
      amount: base,
      reserve: plan.reserve && choice ? plan.reserve : undefined,
      stage: 'APPROVED',
      doneDetail: 'ngân sách năm hiện hành đã được duyệt',
      labelSuffix: label,
    };
  });

  return summarize(await runYearPlans(ctx, year, entries));
}

/**
 * The budgets of the next year and of the one after, each left where the demo carries on from. The cycle of the next year is locked by the seed once its versions
 * are sent; the one of the year after is open, with the `BM-10` that waits for Finance.
 */
async function nextYear(ctx: DemoRunContext): Promise<StepOutcome> {
  const year = yearOf(ctx).year + 1;
  const entriesOf = (afterNext: boolean): YearPlanEntry[] =>
    ctx.fixture.nextYear
      .filter((plan) => (plan.afterNext === true) === afterNext)
      .map((plan) => ({ ...plan, amount: plan.requestedAmount, doneDetail: plan.stage }));

  return summarize([
    ...(await runYearPlans(ctx, year, entriesOf(false))),
    ...(await runYearPlans(ctx, year + 1, entriesOf(true))),
  ]);
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
        'Ngân sách năm sau (kỳ đã khóa): một phòng đã duyệt, phiên bản chờ Người duyệt chi, phiên bản bị trả về; BM-10 chờ Finance ở kỳ năm sau nữa (đang mở)',
      needs: ['budget.cycles', 'finance.cost-centers', 'catalog.plans', 'org.heads', 'org.approval-roles'],
      run: nextYear,
    },
  ];
}
