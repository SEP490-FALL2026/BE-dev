import type { DemoRunContext } from '../demo-run.types';
import { person } from '../demo-step-kit';
import { type BudgetLine, type BuiltFile, bm10Workbook, versionWorkbook } from './file-builders';

const RESERVE_KEY = 'BUDGET_RESERVE_DEFAULT_PERCENT';
const reserveOfRun = new WeakMap<DemoRunContext, number>();

/**
 * The default share of reserve the proposal of a head states (`BUDGET_RESERVE_DEFAULT_PERCENT`): read once a run from the operating parameters
 * (Super Admin), never guessed (SPEC S23 section 2, Q-E).
 */
export async function reservePercentOf(ctx: DemoRunContext): Promise<number> {
  const known = reserveOfRun.get(ctx);
  if (known !== undefined) return known;
  const { items } = await ctx.api.call<{ items: { key: string; value: unknown }[] }>(
    ctx.superAdminEmail,
    'GET',
    '/operating-parameters',
  );
  const raw = items.find((item) => item.key === RESERVE_KEY)?.value;
  const percent = typeof raw === 'number' || typeof raw === 'string' ? Number(raw) : Number.NaN;
  if (!Number.isFinite(percent) || raw === '')
    throw new Error(`The operating parameter ${RESERVE_KEY} has no numeric value`);
  reserveOfRun.set(ctx, percent);

  return percent;
}

const departmentOf = (ctx: DemoRunContext, code: string) =>
  ctx.fixture.departments.find((candidate) => candidate.code === code);

/**
 * The lines a head can list within the amount asked: the amount is counted from the day of the seed, so it may be smaller than the lines of the
 * fixture add up to. A line that would go over is cut to the months that fit, one that fits no month is left out; the rest is one balancing line.
 */
export function fitLines(lines: readonly BudgetLine[], amount: number): BudgetLine[] {
  const fitted: BudgetLine[] = [];
  let left = amount;
  for (const line of lines) {
    const month = line.seats * line.monthlyPrice;
    const months = Math.min(line.months, month > 0 ? Math.floor(left / month) : 0);
    if (months < 1) continue;
    fitted.push(months === line.months ? line : { ...line, months });
    left -= month * months;
  }

  return fitted;
}

/** `BM-10` of a department as its head fills it in: the template the head downloads, filled with the lines of the fixture. */
export async function proposalFile(
  ctx: DemoRunContext,
  headEmail: string,
  plan: { department: string; amount: string },
  year: number,
): Promise<BuiltFile> {
  const template = await ctx.api.download(headEmail, '/import-templates/budget-proposal?format=xlsx');
  const head = departmentOf(ctx, plan.department)?.head ?? '';

  return bm10Workbook(
    template,
    fitLines(ctx.fixture.budgetLines[plan.department] ?? [], Number(plan.amount)),
    {
      costCenterCode: departmentOf(ctx, plan.department)?.costCenter?.code ?? plan.department,
      year,
      preparedBy: person(ctx, head).fullName,
      preparedOn: ctx.today,
      requestedAmount: Number(plan.amount),
      reservePercent: await reservePercentOf(ctx),
    },
    `BM-10-${plan.department}-${year}.xlsx`,
  );
}

interface Money {
  amount: string;
}

interface VersionView {
  costCenter: { code: string };
  year: number;
  number: number;
  proposalId: string | null;
  base: Money;
  reserve: Money;
  reservePercent: number;
  reserveReason: string | null;
  baseReason: string | null;
}

/**
 * The file Finance attaches to a draft version: the figures are the ones the system holds right now (`GET /budget-versions/{id}`, and the
 * proposal it came from), so every number in the file is a number of the system (SPEC S23 section 3, Q-E).
 */
export async function versionFile(
  ctx: DemoRunContext,
  finance: string,
  versionId: string,
  fileName: string,
): Promise<BuiltFile> {
  const { version } = await ctx.api.call<{ version: VersionView }>(finance, 'GET', `/budget-versions/${versionId}`);
  const agreedBase = Number(version.base.amount);
  const requested = version.proposalId
    ? Number(
        (
          await ctx.api.call<{ proposal: { requestedAmount: Money } }>(
            finance,
            'GET',
            `/budget-proposals/${version.proposalId}`,
          )
        ).proposal.requestedAmount.amount,
      )
    : agreedBase;

  return versionWorkbook(
    {
      costCenterCode: version.costCenter.code,
      year: version.year,
      versionNumber: version.number,
      proposedBase: requested,
      proposedPercent: await reservePercentOf(ctx),
      agreedBase,
      agreedReserve: Number(version.reserve.amount),
      agreedPercent: version.reservePercent,
      reason: version.reserveReason ?? version.baseReason ?? 'Số đã chốt đi theo đề xuất của trưởng phòng.',
    },
    fileName,
  );
}
