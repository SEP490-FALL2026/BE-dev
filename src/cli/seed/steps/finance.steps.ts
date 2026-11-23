import { DemoApiError } from '../demo-api-client';
import { dayOffset } from '../demo-dates';
import { as, listAll, summarize, yearOf } from '../demo-step-kit';
import type { DemoRunContext, DemoStep, StepOutcome } from '../demo-run.types';
import type { DemoCycle } from '../fixture/demo-fixture.types';
import { financePerson, money } from './finance-kit';

type Result = { status: StepOutcome['status']; label: string };

interface CostCenterRow {
  id: string;
  code: string;
  department: { code: string } | null;
}

async function costCenters(ctx: DemoRunContext): Promise<StepOutcome> {
  const finance = await as(ctx, financePerson(ctx));
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

type TaxProfileSpec = DemoRunContext['fixture']['taxProfiles'][number];

/** One vendor's profile: one Finance already declared stays as it is, whoever declared it: the dataset's only with the fixture's group. */
async function oneTaxProfile(ctx: DemoRunContext, finance: string, spec: TaxProfileSpec): Promise<Result> {
  const label = `hồ sơ thuế ${spec.application}`;
  const vendorId = ctx.ids.vendors.get(spec.application);
  if (!vendorId) return { status: 'conflict', label: `${label}: ứng dụng không có nhà cung cấp` };
  const profile = await ctx.api.call<{ status: string; profile: { group: string } | null }>(
    finance,
    'GET',
    `/vendors/${vendorId}/tax-profile`,
  );
  if (profile.status === 'DECLARED') {
    return profile.profile?.group === spec.group
      ? { status: 'present', label }
      : { status: 'conflict', label: `${label}: đã khai nhóm ${profile.profile?.group ?? '?'}, khác fixture` };
  }
  if (ctx.mode === 'plan') return { status: 'planned', label };
  await ctx.api.call(finance, 'PUT', `/vendors/${vendorId}/tax-profile`, { group: spec.group, lines: spec.lines });

  return { status: 'done', label };
}

async function taxProfile(ctx: DemoRunContext): Promise<StepOutcome> {
  const finance = await as(ctx, financePerson(ctx));
  const results: Result[] = [];
  for (const spec of ctx.fixture.taxProfiles) results.push(await oneTaxProfile(ctx, finance, spec));

  return summarize(results);
}

interface CycleRow {
  status: 'DRAFT' | 'OPEN' | 'LOCKED';
  openedAt: string | null;
}

/** The cycle of the year, or null when Finance has not made it. */
async function existingCycle(ctx: DemoRunContext, finance: string, year: number): Promise<CycleRow | null> {
  try {
    return await ctx.api.call<CycleRow>(finance, 'GET', `/budget-cycles/${year}`);
  } catch (error) {
    if (error instanceof DemoApiError && error.status === 404) return null;
    throw error;
  }
}

async function oneCycle(ctx: DemoRunContext, finance: string, year: number, plan: DemoCycle): Promise<Result> {
  const label = `kỳ ngân sách ${year}${plan.open ? '' : ' (nháp)'}`;
  const found = await existingCycle(ctx, finance, year);
  // A cycle that was opened once is the dataset's: it is left as it is, even when Finance changed it since; a draft stays a draft.
  if (found && (found.openedAt !== null || !plan.open)) return { status: 'present', label };
  if (ctx.mode === 'plan') return { status: 'planned', label };
  if (!found) {
    await ctx.api.call(finance, 'POST', '/budget-cycles', {
      year,
      submissionDeadline: dayOffset(ctx.today, plan.submissionOffsetDays),
      decisionDeadline: dayOffset(ctx.today, plan.decisionOffsetDays),
      annualCeiling: money(plan.annualCeiling),
      sharedPoolReserve: money(plan.sharedPoolReserve),
    });
  }
  if (plan.open) await ctx.api.call(finance, 'POST', `/budget-cycles/${year}/opening`);

  return { status: 'done', label };
}

/**
 * Finance makes the budget cycle of the year, of the next one and of the year after, and opens each (`QĐ-111z`): a head sends `BM-10` only to an
 * open cycle.
 */
async function cycles(ctx: DemoRunContext): Promise<StepOutcome> {
  const finance = await as(ctx, financePerson(ctx));
  const year = yearOf(ctx).year;

  return summarize([
    await oneCycle(ctx, finance, year, ctx.fixture.cycle),
    await oneCycle(ctx, finance, year + 1, ctx.fixture.nextCycle),
    await oneCycle(ctx, finance, year + 2, ctx.fixture.afterNextCycle),
  ]);
}

export const FINANCE_STEPS: readonly DemoStep[] = [
  { key: 'finance.cost-centers', title: 'Cost Center của phòng (Finance)', needs: ['org.accounts'], run: costCenters },
  {
    key: 'finance.tax-profile',
    title: 'Hồ sơ thuế của sáu nhà cung cấp (Finance)',
    needs: ['catalog.applications'],
    run: taxProfile,
  },
  {
    key: 'budget.cycles',
    title: 'Kỳ ngân sách năm hiện hành, năm sau và năm sau nữa (mở) (Finance)',
    needs: ['finance.cost-centers', 'org.heads'],
    run: cycles,
  },
];
