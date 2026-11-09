import { DemoApiError } from '../demo-api-client';
import { calendarFor } from '../seed-calendar';
import { addDays, as, listAll, summarize, yearOf } from '../demo-step-kit';
import type { DemoRunContext, DemoStep, StepOutcome } from '../demo-run.types';
import type { DemoBudget, DemoFixture, DemoInvoice } from '../fixture/demo-fixture.types';
import { percentOf } from './invoice-amounts';

type Result = { status: StepOutcome['status']; label: string };

function personWith(ctx: DemoRunContext, role: 'FINANCE'): string {
  return ctx.fixture.people.find((person) => person.account === role)?.code ?? '';
}

const money = (amount: string) => ({ amount });

interface CostCenterRow {
  id: string;
  code: string;
  department: { code: string } | null;
}

async function costCenters(ctx: DemoRunContext): Promise<StepOutcome> {
  const finance = await as(ctx, personWith(ctx, 'FINANCE'));
  const existing = await listAll<CostCenterRow>(ctx, finance, '/cost-centers');
  const results: Result[] = [];
  for (const department of ctx.fixture.departments) {
    if (!department.costCenter) continue;
    const label = `${department.costCenter.code} → ${department.code}`;
    const found = existing.find((row) => row.code === department.costCenter?.code);
    if (found) {
      ctx.ids.costCenters.set(department.code, found.id);
      const linked = found.department?.code === department.code;
      results.push(
        linked ? { status: 'present', label } : { status: 'conflict', label: `${label}: mã đã dùng cho phòng khác` },
      );
    } else if (ctx.mode === 'plan') results.push({ status: 'planned', label });
    else {
      const created = await ctx.api.call<{ id: string }>(finance, 'POST', '/cost-centers', {
        code: department.costCenter.code,
        name: department.costCenter.name,
        kind: 'UNIT',
        departmentId: ctx.ids.departments.get(department.code),
      });
      ctx.ids.costCenters.set(department.code, created.id);
      results.push({ status: 'done', label });
    }
  }

  return summarize(results);
}

async function taxProfile(ctx: DemoRunContext): Promise<StepOutcome> {
  const finance = await as(ctx, personWith(ctx, 'FINANCE'));
  const vendorId = ctx.ids.vendors.get(ctx.fixture.taxProfile.application);
  if (!vendorId) return { status: 'conflict', detail: 'ứng dụng không có nhà cung cấp' };
  const profile = await ctx.api.call<{ status: string; profile: { group: string } | null }>(
    finance,
    'GET',
    `/vendors/${vendorId}/tax-profile`,
  );
  // A profile Finance already declared stays as it is, whoever declared it: the dataset's only with the fixture's group.
  if (profile.status === 'DECLARED') {
    return profile.profile?.group === ctx.fixture.taxProfile.group
      ? { status: 'present', detail: 'nhà cung cấp đã có hồ sơ thuế' }
      : { status: 'conflict', detail: `hồ sơ thuế đã khai với nhóm ${profile.profile?.group ?? '?'}, khác fixture` };
  }
  if (ctx.mode === 'plan') return { status: 'planned', detail: 'khai hồ sơ thuế' };
  await ctx.api.call(finance, 'PUT', `/vendors/${vendorId}/tax-profile`, {
    group: ctx.fixture.taxProfile.group,
    lines: ctx.fixture.taxProfile.lines,
  });

  return { status: 'done', detail: 'đã khai hồ sơ thuế' };
}

interface Row {
  id: string;
  costCenter: { id: string };
  state: string;
  number?: number;
}

type BudgetMove = { done: boolean; action: string | null };

/** The budget of the year of every department of the fixture that has one, each through its whole chain. */
async function budgets(ctx: DemoRunContext): Promise<StepOutcome> {
  const results: Result[] = [];
  for (const year of calendarFor(ctx).years) {
    for (const plan of ctx.fixture.budgets) {
      const outcome = await budget(ctx, plan, year);
      results.push({ status: outcome.status, label: `${plan.department} ${year}: ${outcome.detail}` });
    }
  }

  return summarize(results);
}

/**
 * The budget of the year for one department, through its whole chain: the head proposes, Finance builds the version from
 * the proposal and sends it, the spending approver approves it. Each turn reads where the chain stands and takes the one
 * next action, so a run stopped half-way goes on from there.
 */
async function budget(ctx: DemoRunContext, plan: DemoBudget, year: number): Promise<StepOutcome> {
  let moved = false;
  for (let turn = 0; turn < 6; turn++) {
    const move = await budgetTurn(ctx, plan, year);
    if (move.done) return { status: moved ? 'done' : 'present', detail: 'ngân sách năm hiện hành đã được duyệt' };
    if (move.action === null)
      return { status: 'conflict', detail: 'chuỗi ngân sách đã đi hướng khác (bị từ chối hoặc trả về)' };
    if (ctx.mode === 'plan') return { status: 'planned', detail: `bước kế tiếp: ${move.action}` };
    moved = true;
  }

  return { status: 'conflict', detail: 'chuỗi ngân sách không tới được trạng thái hiện hành' };
}

async function budgetTurn(ctx: DemoRunContext, plan: DemoBudget, year: number): Promise<BudgetMove> {
  const head = ctx.fixture.departments.find((department) => department.code === plan.department)?.head ?? '';
  const headEmail = await as(ctx, head);
  const mine = await ctx.api.call<{ budget: { status: string } }>(headEmail, 'GET', `/budgets/mine?year=${year}`);
  if (mine.budget.status === 'ACTIVE') return { done: true, action: null };
  const costCenterId = ctx.ids.costCenters.get(plan.department) ?? '';
  const finance = await as(ctx, personWith(ctx, 'FINANCE'));
  const versions = (await listAll<Row>(ctx, finance, `/budget-versions?year=${year}`)).filter(
    (row) => row.costCenter.id === costCenterId,
  );
  // The list runs by number within a Cost Center: the latest version is the one with the highest number.
  const version = [...versions].sort((a, b) => (b.number ?? 0) - (a.number ?? 0))[0];
  if (version) return versionTurn(ctx, finance, version);
  const proposals = (await listAll<Row>(ctx, headEmail, `/budget-proposals?year=${year}`)).filter(
    (row) => row.costCenter.id === costCenterId,
  );
  const proposal = proposals[0];
  if (!proposal)
    return act(ctx, 'trưởng phòng gửi đề xuất', () => propose(ctx, plan, { headEmail, costCenterId, year }));
  if (proposal.state !== 'SUBMITTED') return { done: false, action: null };

  return act(ctx, 'Finance lập phiên bản', () =>
    ctx.api.call(finance, 'POST', '/budget-versions', {
      proposalId: proposal.id,
      // The server sets the reserve to the default 10 % of the base; a different share would carry `reserveReason`.
      base: money(plan.base),
    }),
  );
}

async function versionTurn(ctx: DemoRunContext, finance: string, version: Row): Promise<BudgetMove> {
  if (version.state === 'DRAFT') {
    return act(ctx, 'Finance gửi phiên bản', () =>
      ctx.api.call(finance, 'POST', `/budget-versions/${version.id}/submission`),
    );
  }
  if (version.state !== 'SENT') return { done: version.state === 'APPROVED', action: null };
  const approver = await as(ctx, ctx.fixture.approvalRoles.SPENDING_APPROVER);

  return act(ctx, 'Người duyệt chi duyệt phiên bản', () =>
    ctx.api.call(approver, 'POST', `/budget-versions/${version.id}/decision`, { decision: 'APPROVE' }),
  );
}

async function act(ctx: DemoRunContext, action: string, write: () => Promise<unknown>): Promise<BudgetMove> {
  if (ctx.mode === 'apply') await write();

  return { done: false, action };
}

function propose(
  ctx: DemoRunContext,
  plan: Pick<DemoBudget, 'lines'>,
  to: { headEmail: string; costCenterId: string; year: number },
): Promise<unknown> {
  return ctx.api.call(to.headEmail, 'POST', '/budget-proposals', {
    year: to.year,
    // The order of the lines is their priority rank; a new purchase carries its explanation (QĐ-94l).
    lines: plan.lines.map((line, index) => ({
      description: line.description,
      planId: ctx.ids.plans.get(line.plan),
      seats: line.seats,
      amount: money(line.amount),
      lineType: line.lineType,
      priorityRank: index + 1,
      ...(line.zbb ? { zbb: line.zbb } : {}),
    })),
  });
}

/**
 * The proposal of a department for a later year, sent by its head and left for Finance to answer. A proposal of that year in any
 * state is the dataset's: the step never sends a second one, and never takes the answer out of Finance's hands.
 */
async function nextYearProposals(ctx: DemoRunContext): Promise<StepOutcome> {
  const results: Result[] = [];
  for (const proposal of ctx.fixture.proposals) {
    const year = yearOf(ctx).year + proposal.yearOffset;
    const label = `${proposal.department} ${year}`;
    const head = ctx.fixture.departments.find((department) => department.code === proposal.department)?.head ?? '';
    const headEmail = await as(ctx, head);
    const costCenterId = ctx.ids.costCenters.get(proposal.department) ?? '';
    const sent = (await listAll<Row>(ctx, headEmail, `/budget-proposals?year=${year}`)).filter(
      (row) => row.costCenter.id === costCenterId,
    );
    if (sent.length > 0) {
      results.push({ status: 'present', label: `${label}: đề xuất đã gửi (${sent[0].state})` });
    } else if (ctx.mode === 'plan') {
      results.push({ status: 'planned', label: `${label}: gửi đề xuất` });
    } else {
      await propose(ctx, proposal, { headEmail, costCenterId, year });
      results.push({ status: 'done', label: `${label}: đề xuất chờ Finance` });
    }
  }

  return summarize(results);
}

interface CommitmentRow {
  id: string;
  amount: { amount: string };
  state: string;
}

interface InvoiceRow {
  number: string;
}

/** The refusals of recording an invoice that mean the dataset's invoice is already there or cannot be put there. */
const INVOICE_DUPLICATE = 'INVOICE.DUPLICATE';

/**
 * The invoices of the fixture, each recorded by Finance against the commitment of its request. An invoice is found by its number
 * (the tag of the dataset and the key), so a rerun records none twice; the same number from the vendor refused by the API counts as
 * present too. A request with no commitment, or one the API refuses, is a conflict and nothing is forced.
 */
async function invoices(ctx: DemoRunContext): Promise<StepOutcome> {
  const finance = await as(ctx, personWith(ctx, 'FINANCE'));
  const results: Result[] = [];
  for (const spec of ctx.fixture.invoices) {
    results.push(await invoiceOf(ctx, finance, spec));
  }

  return summarize(results);
}

async function invoiceOf(ctx: DemoRunContext, finance: string, spec: DemoInvoice): Promise<Result> {
  const label = `${spec.key} → ${spec.request}`;
  const requestId = ctx.ids.requests.get(spec.request);
  const commitment = requestId
    ? (await listAll<CommitmentRow>(ctx, finance, `/budget-commitments?requestId=${requestId}`))[0]
    : undefined;
  if (!commitment) {
    return ctx.mode === 'plan'
      ? { status: 'planned', label }
      : { status: 'conflict', label: `${label}: Request chưa có cam kết` };
  }
  const number = `${ctx.fixture.marker}-${spec.key}`;
  const recorded = await listAll<InvoiceRow>(ctx, finance, `/budget-commitments/${commitment.id}/invoices`);
  if (recorded.some((row) => row.number === number)) return { status: 'present', label };
  if (ctx.mode === 'plan') return { status: 'planned', label };
  try {
    await ctx.api.call(
      finance,
      'POST',
      `/budget-commitments/${commitment.id}/invoices`,
      invoiceBody(ctx, spec, commitment, number),
    );
  } catch (error) {
    if (error instanceof DemoApiError && error.status === 409) {
      return error.code === INVOICE_DUPLICATE
        ? { status: 'present', label }
        : { status: 'conflict', label: `${label}: ${error.code}` };
    }
    throw error;
  }

  return { status: 'done', label };
}

function invoiceBody(ctx: DemoRunContext, spec: DemoInvoice, commitment: CommitmentRow, number: string) {
  const net = percentOf(commitment.amount.amount, spec.netPercent);

  return {
    number,
    issuedOn: addDays(ctx.today, -spec.issuedDaysAgo),
    netAmount: money(net),
    ...(spec.deductibleTaxPercent > 0 ? { deductibleTax: money(percentOf(net, spec.deductibleTaxPercent)) } : {}),
    ...(spec.nonDeductibleTaxPercent > 0
      ? { nonDeductibleTax: money(percentOf(net, spec.nonDeductibleTaxPercent)) }
      : {}),
    note: spec.note,
  };
}

/** The step that records the invoices, after every request whose commitment it records them against. */
export function invoiceSteps(fixture: DemoFixture): DemoStep[] {
  const requests = [...new Set(fixture.invoices.map((spec) => `requests.${spec.request}`))];

  return [
    {
      key: 'finance.invoices',
      title: 'Hóa đơn của các cam kết đã duyệt chi (Finance ghi)',
      needs: ['finance.tax-profile', ...requests],
      run: invoices,
    },
  ];
}

interface CycleRow {
  status: 'NOT_PUBLISHED' | 'PUBLISHED' | 'CHANGED_AFTER_PUBLISH';
  firstPublishedAt: string | null;
}

/** The day `days` before the first of January of `year`, as YYYY-MM-DD. */
function dayBeforeNewYear(year: number, days: number): string {
  return new Date(Date.UTC(year, 0, 1 - days)).toISOString().slice(0, 10);
}

/**
 * Finance opens the budget cycle of the year and of the next one, divides the annual ceiling among the departments and the reserve,
 * and publishes it: a head proposes only once it is published (`Q-02`). A cycle already published is left; one that exists but was
 * not published goes on from its division.
 */
async function cycles(ctx: DemoRunContext): Promise<StepOutcome> {
  const finance = await as(ctx, personWith(ctx, 'FINANCE'));
  const results: Result[] = [];
  for (const year of [yearOf(ctx).year, yearOf(ctx).year + 1]) {
    results.push(await oneCycle(ctx, finance, year));
  }

  return summarize(results);
}

/** What each of `count` departments gets of the annual ceiling less the reserve, in whole major units, rounded down. */
export function evenShareOf(annualCeiling: string, reserve: string, count: number): string {
  return (count === 0 ? 0n : (BigInt(annualCeiling) - BigInt(reserve)) / BigInt(count)).toString();
}

/** The cycle of the year, or null when Finance has not opened it. */
async function existingCycle(ctx: DemoRunContext, finance: string, year: number): Promise<CycleRow | null> {
  try {
    return await ctx.api.call<CycleRow>(finance, 'GET', `/budget-cycles/${year}`);
  } catch (error) {
    if (error instanceof DemoApiError && error.status === 404) return null;
    throw error;
  }
}

async function oneCycle(ctx: DemoRunContext, finance: string, year: number): Promise<Result> {
  const label = `kỳ ngân sách ${year}`;
  const found = await existingCycle(ctx, finance, year);
  // A cycle that was published once is the dataset's: it is left as it is, even when Finance changed it since.
  if (found?.firstPublishedAt) return { status: 'present', label };
  if (ctx.mode === 'plan') return { status: 'planned', label };
  const plan = ctx.fixture.cycle;
  if (!found) {
    await ctx.api.call(finance, 'POST', '/budget-cycles', {
      year,
      submissionDeadline: dayBeforeNewYear(year, plan.submissionDaysBefore),
      decisionDeadline: dayBeforeNewYear(year, plan.decisionDaysBefore),
      annualCeiling: money(plan.annualCeiling),
    });
  }
  // Every department of the installation that is not stopped gets a ceiling: the check before publishing asks for all of them.
  const rows = await listAll<{ id: string; status: string }>(ctx, ctx.superAdminEmail, '/departments');
  const departmentIds = rows.filter((row) => row.status === 'ACTIVE').map((row) => row.id);
  const evenShare = evenShareOf(plan.annualCeiling, plan.sharedPoolReserve, departmentIds.length);
  await ctx.api.call(finance, 'PUT', `/budget-cycles/${year}/department-ceilings`, {
    sharedPoolReserve: money(plan.sharedPoolReserve),
    departments: departmentIds.map((departmentId) => ({
      departmentId,
      signedCommitments: money('0'),
      plannedSeats: money('0'),
      priority: money(evenShare),
      explanation: 'Chia đều phần còn lại của Trần năm cho các phòng (dữ liệu demo)',
    })),
  });
  await ctx.api.call(finance, 'POST', `/budget-cycles/${year}/publish`);

  return { status: 'done', label };
}

export const FINANCE_STEPS: readonly DemoStep[] = [
  { key: 'finance.cost-centers', title: 'Cost Center của phòng (Finance)', needs: ['org.accounts'], run: costCenters },
  {
    key: 'finance.tax-profile',
    title: 'Hồ sơ thuế nhà cung cấp (Finance)',
    needs: ['catalog.applications'],
    run: taxProfile,
  },
  {
    key: 'budget.cycles',
    title: 'Kỳ lập ngân sách năm hiện hành và năm sau: mở, chia Trần, phát hành (Finance)',
    needs: ['finance.cost-centers', 'org.heads'],
    run: cycles,
  },
  {
    key: 'budget.year',
    title: 'Ngân sách năm của Kỹ thuật, Marketing, Kinh doanh (trưởng phòng → Finance → Người duyệt chi)',
    needs: ['budget.cycles', 'finance.cost-centers', 'catalog.plans', 'org.heads', 'org.approval-roles'],
    run: budgets,
  },
  {
    key: 'budget.next-year',
    title: 'Đề xuất ngân sách năm sau của Công nghệ thông tin chờ Finance (trưởng phòng gửi)',
    needs: ['budget.cycles', 'finance.cost-centers', 'catalog.plans', 'org.heads'],
    run: nextYearProposals,
  },
];
