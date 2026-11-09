import { DemoApiError } from '../demo-api-client';
import { dayBeforeNewYear } from '../demo-dates';
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

/** The rate of each foreign currency of the fixture for today, recorded by Finance (a subscription in it is Draft without one). */
async function exchangeRates(ctx: DemoRunContext): Promise<StepOutcome> {
  const finance = await as(ctx, financePerson(ctx));
  const results: Result[] = [];
  for (const spec of ctx.fixture.exchangeRates) {
    const label = `${spec.currency} → ${ctx.fixture.currency}`;
    const known = await listAll<{ id: string }>(
      ctx,
      finance,
      `/exchange-rates?currency=${spec.currency}&from=${ctx.today}&to=${ctx.today}`,
    );
    if (known.length > 0) results.push({ status: 'present', label });
    else if (ctx.mode === 'plan') results.push({ status: 'planned', label });
    else {
      await ctx.api.call(finance, 'POST', '/exchange-rates', {
        currency: spec.currency,
        rateDate: ctx.today,
        rate: spec.rate,
      });
      results.push({ status: 'done', label });
    }
  }

  return summarize(results);
}

async function taxProfile(ctx: DemoRunContext): Promise<StepOutcome> {
  const finance = await as(ctx, financePerson(ctx));
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

interface CycleRow {
  status: 'NOT_PUBLISHED' | 'PUBLISHED' | 'CHANGED_AFTER_PUBLISH';
  firstPublishedAt: string | null;
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

/** The ceiling of every department of the installation that is not stopped: the check before publishing asks for all of them. */
async function ceilingsOf(ctx: DemoRunContext, plan: DemoCycle) {
  const rows = await listAll<{ id: string; code: string; status: string }>(ctx, ctx.superAdminEmail, '/departments');
  const active = rows.filter((row) => row.status === 'ACTIVE');
  const even = evenShareOf(plan.annualCeiling, plan.sharedPoolReserve, active.length);

  return active.map((row) => ({
    departmentId: row.id,
    signedCommitments: money('0'),
    plannedSeats: money('0'),
    priority: money(plan.ceilings ? (plan.ceilings[row.code] ?? '0') : even),
    explanation: 'Trần của phòng trong kỳ ngân sách (dữ liệu demo)',
  }));
}

async function oneCycle(ctx: DemoRunContext, finance: string, year: number, plan: DemoCycle): Promise<Result> {
  const label = `kỳ ngân sách ${year}`;
  const found = await existingCycle(ctx, finance, year);
  // A cycle that was published once is the dataset's: it is left as it is, even when Finance changed it since.
  if (found?.firstPublishedAt) return { status: 'present', label };
  if (ctx.mode === 'plan') return { status: 'planned', label };
  if (!found) {
    await ctx.api.call(finance, 'POST', '/budget-cycles', {
      year,
      submissionDeadline: dayBeforeNewYear(year, plan.submissionDaysBefore),
      decisionDeadline: dayBeforeNewYear(year, plan.decisionDaysBefore),
      annualCeiling: money(plan.annualCeiling),
    });
  }
  await ctx.api.call(finance, 'PUT', `/budget-cycles/${year}/department-ceilings`, {
    sharedPoolReserve: money(plan.sharedPoolReserve),
    departments: await ceilingsOf(ctx, plan),
  });
  await ctx.api.call(finance, 'POST', `/budget-cycles/${year}/publish`);

  return { status: 'done', label };
}

/**
 * Finance opens the budget cycle of the year and of the next one, divides the ceiling among the departments and the reserve, and
 * publishes it: a head proposes only once it is published (`Q-02`).
 */
async function cycles(ctx: DemoRunContext): Promise<StepOutcome> {
  const finance = await as(ctx, financePerson(ctx));
  const year = yearOf(ctx).year;

  return summarize([
    await oneCycle(ctx, finance, year, ctx.fixture.cycle),
    await oneCycle(ctx, finance, year + 1, ctx.fixture.nextCycle),
  ]);
}

export const FINANCE_STEPS: readonly DemoStep[] = [
  { key: 'finance.cost-centers', title: 'Cost Center của phòng (Finance)', needs: ['org.accounts'], run: costCenters },
  {
    key: 'finance.exchange-rates',
    title: 'Tỷ giá ngoại tệ của ngày (Finance)',
    needs: ['org.accounts'],
    run: exchangeRates,
  },
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
];
