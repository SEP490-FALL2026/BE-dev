import { dayOffset } from '../demo-dates';
import { as, listAll, summarize } from '../demo-step-kit';
import type { DemoRunContext, DemoStep, StepOutcome } from '../demo-run.types';
import type { DemoRenewal, DemoSubscription } from '../fixture/demo-fixture.types';
import { subscriptionMonthlyPriceOf } from './catalog.steps';

export interface AdjustmentLine {
  subscriptionLineId: string;
  plan: { id: string; name: string };
  seatsToday: number;
  need: number;
  target: number;
}

export interface Adjustment {
  subscriptionId: string;
  renewalOn: string;
  target: number;
  purchasedQuantity: number | null;
  suggestedChoice: 'RENEW' | 'REDUCE' | 'INCREASE' | 'CANCEL' | null;
  seatsNeeded?: { total: number };
  lines: AdjustmentLine[];
}

function adjustmentProblem(adjustment: Adjustment): string | null {
  if (adjustment.target <= 0 || adjustment.suggestedChoice === 'CANCEL')
    return 'Cancellation (target zero) is outside these demo outcomes';
  if (adjustment.suggestedChoice === null) return 'The server has no suggested choice';
  if (adjustment.lines.length === 0) return 'The adjustment returned no subscription lines';
  if (adjustment.lines.some((line) => line.target <= 0)) return 'A line target of zero is outside these demo outcomes';
  if (adjustment.seatsNeeded && adjustment.target > adjustment.seatsNeeded.total)
    return 'The target exceeds seats needed and requires vendor minimum evidence';
  return null;
}

function lineMonthlyPrice(
  line: AdjustmentLine,
  subscription: Pick<DemoSubscription, 'billingCycle' | 'unitPrice' | 'lines'>,
  planIds?: ReadonlyMap<string, string>,
): { amount: string; currency: 'VND' } {
  const matchedPlan = planIds ? [...planIds.entries()].find(([, id]) => id === line.plan.id)?.[0] : undefined;

  return { amount: String(subscriptionMonthlyPriceOf(subscription as DemoSubscription, matchedPlan)), currency: 'VND' };
}

/** Record per-line adjustment targets (`W3-21`); a next period preserves each line's monthly unit price. */
export function renewalBody(
  adjustment: Adjustment,
  spec: DemoRenewal & Pick<DemoSubscription, 'billingCycle' | 'unitPrice' | 'lines'>,
  planIds?: ReadonlyMap<string, string>,
) {
  const problem = adjustmentProblem(adjustment);
  if (problem) throw new Error(problem);
  return {
    subscriptionId: adjustment.subscriptionId,
    choice: adjustment.suggestedChoice,
    lines: adjustment.lines.map((line) => ({
      subscriptionLineId: line.subscriptionLineId,
      quantity: line.target,
    })),
    outcome: spec.outcome,
    outcomeNote: spec.outcomeNote,
    ...(spec.nextPeriod
      ? {
          nextPeriod: {
            lines: adjustment.lines.map((line) => ({
              subscriptionLineId: line.subscriptionLineId,
              quantity: line.target,
              monthlyUnitPrice: lineMonthlyPrice(line, spec, planIds),
            })),
            billingCycle: 'ANNUAL',
            startDate: adjustment.renewalOn,
            endDate: dayOffset(adjustment.renewalOn, 364),
            renewalDate: dayOffset(adjustment.renewalOn, 365),
            autoRenew: true,
            allowsMidTermReduction: false,
          },
        }
      : {}),
  };
}

async function oneRenewal(ctx: DemoRunContext, spec: DemoRenewal) {
  const subscription = ctx.fixture.subscriptions.find((row) => row.key === spec.subscription);
  const subscriptionId = ctx.ids.subscriptions.get(spec.subscription);
  if (!subscription || !subscriptionId)
    return { status: 'conflict' as const, label: `${spec.subscription}: no original subscription` };
  const email = await as(ctx, subscription.responsible ?? spec.by);
  const existing = await listAll<{ id: string }>(ctx, email, `/subscription-renewals?subscriptionId=${subscriptionId}`);
  if (existing.length) return { status: 'present' as const, label: spec.subscription };
  const { adjustment } = await ctx.api.call<{ adjustment: Adjustment }>(
    email,
    'GET',
    `/subscription-renewals/adjustment?subscriptionId=${subscriptionId}`,
  );
  const problem = adjustmentProblem(adjustment);
  if (problem) return { status: 'conflict' as const, label: `${spec.subscription}: ${problem}` };
  if (ctx.mode === 'plan') return { status: 'planned' as const, label: spec.subscription };
  await ctx.api.call(
    email,
    'POST',
    '/subscription-renewals',
    renewalBody(
      adjustment,
      {
        ...spec,
        billingCycle: subscription.billingCycle,
        unitPrice: subscription.unitPrice,
        lines: subscription.lines,
      },
      ctx.ids.plans,
    ),
  );
  return { status: 'done' as const, label: spec.subscription };
}

async function renewals(ctx: DemoRunContext): Promise<StepOutcome> {
  const results = [];
  for (const spec of ctx.fixture.renewals) results.push(await oneRenewal(ctx, spec));
  return summarize(results);
}

export const RENEWAL_STEPS: readonly DemoStep[] = [
  {
    key: 'renewals.adjustments',
    title: 'SBF-20: kết quả điều chỉnh Adobe và Zoom đã ghi',
    needs: ['catalog.baseline-close', 'ghost.decisions'],
    run: renewals,
  },
];
