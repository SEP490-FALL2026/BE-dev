import { dayOffset } from '../demo-dates';
import { as, listAll, summarize } from '../demo-step-kit';
import type { DemoRunContext, DemoStep, StepOutcome } from '../demo-run.types';
import type { DemoRenewal, DemoSubscription } from '../fixture/demo-fixture.types';

export interface Adjustment {
  subscriptionId: string;
  renewalOn: string;
  target: number;
  purchasedQuantity: number | null;
  suggestedChoice: 'RENEW' | 'REDUCE' | 'INCREASE' | 'CANCEL' | null;
  seatsNeeded?: { total: number };
}

function adjustmentProblem(adjustment: Adjustment): string | null {
  if (adjustment.target <= 0 || adjustment.suggestedChoice === 'CANCEL')
    return 'Cancellation (target zero) is outside these demo outcomes';
  if (adjustment.suggestedChoice === null) return 'The server has no suggested choice';
  if (adjustment.seatsNeeded && adjustment.target > adjustment.seatsNeeded.total)
    return 'The target exceeds seats needed and requires vendor minimum evidence';
  return null;
}

/** Record exactly what the server counts; a later period preserves the annual price of the original subscription. */
export function renewalBody(adjustment: Adjustment, spec: DemoRenewal & Pick<DemoSubscription, 'unitPrice'>) {
  const problem = adjustmentProblem(adjustment);
  if (problem) throw new Error(problem);
  return {
    subscriptionId: adjustment.subscriptionId,
    choice: adjustment.suggestedChoice,
    proposedQuantity: adjustment.target,
    outcome: spec.outcome,
    outcomeNote: spec.outcomeNote,
    ...(spec.nextPeriod
      ? {
          nextPeriod: {
            purchasedQuantity: adjustment.target,
            unitPrice: spec.unitPrice,
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
  const email = await as(ctx, spec.by);
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
    renewalBody(adjustment, { ...spec, unitPrice: subscription.unitPrice }),
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
