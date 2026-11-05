import { calendarFor } from '../seed-calendar';
import { as, listAll, summarize } from '../demo-step-kit';
import type { DemoRunContext, DemoStep, StepOutcome } from '../demo-run.types';
import type { DemoBudget } from '../fixture/demo-fixture.types';

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
  plan: DemoBudget,
  to: { headEmail: string; costCenterId: string; year: number },
): Promise<unknown> {
  return ctx.api.call(to.headEmail, 'POST', '/budget-proposals', {
    year: to.year,
    lines: plan.lines.map((line) => ({
      description: line.description,
      planId: ctx.ids.plans.get(line.plan),
      seats: line.seats,
      amount: money(line.amount),
    })),
  });
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
    key: 'budget.year',
    title: 'Ngân sách năm của Kỹ thuật, Marketing, Kinh doanh (trưởng phòng → Finance → Người duyệt chi)',
    needs: ['finance.cost-centers', 'catalog.plans', 'org.heads', 'org.approval-roles'],
    run: budgets,
  },
];
