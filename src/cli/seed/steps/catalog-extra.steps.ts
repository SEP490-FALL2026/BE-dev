import { dayOffset } from '../demo-dates';
import { as, summarize } from '../demo-step-kit';
import type { DemoRunContext, DemoStep, StepOutcome } from '../demo-run.types';
import type { DemoPlanTerms } from '../fixture/demo-fixture.types';
import { catalogAdmin } from './catalog.steps';

type Result = { status: StepOutcome['status']; label: string };

/** The body of `PUT /plans/{id}/terms` for the terms the fixture records: each point as the free text IT read, the review dated from today. */
export function planTermsBody(ctx: DemoRunContext, terms: DemoPlanTerms): Record<string, unknown> {
  return {
    ...(terms.termsUrl === undefined ? {} : { termsUrl: terms.termsUrl }),
    ...(terms.lastReviewedDaysAgo === undefined
      ? {}
      : { lastReviewedOn: dayOffset(ctx.today, -terms.lastReviewedDaysAgo) }),
    ...(terms.aiTraining === undefined ? {} : { aiTraining: terms.aiTraining }),
    ...(terms.dataLocation === undefined ? {} : { dataLocation: terms.dataLocation }),
    ...(terms.installLimit === undefined ? {} : { installLimit: terms.installLimit }),
    ...(terms.commercialUse === undefined ? {} : { commercialUse: terms.commercialUse }),
    ...(terms.cancellationRefund === undefined ? {} : { cancellationRefund: terms.cancellationRefund }),
  };
}

/**
 * One plan's terms: a plan that has any is left as it is (never compared field by field: the day of the review is counted from today, so a
 * later run would overwrite what IT changed), one that has none gets the fixture's.
 */
async function oneTerms(ctx: DemoRunContext, admin: string, terms: DemoPlanTerms): Promise<Result> {
  const label = `điều khoản ${terms.plan}`;
  const planId = ctx.ids.plans.get(terms.plan);
  if (!planId) return { status: 'planned', label };
  const current = await ctx.api.call<{ terms: unknown }>(admin, 'GET', `/plans/${planId}/terms`);
  if (current.terms !== null) return { status: 'present', label };
  if (ctx.mode === 'plan') return { status: 'planned', label };
  await ctx.api.call(admin, 'PUT', `/plans/${planId}/terms`, planTermsBody(ctx, terms));

  return { status: 'done', label };
}

async function planTerms(ctx: DemoRunContext): Promise<StepOutcome> {
  const admin = await as(ctx, catalogAdmin(ctx));
  const results: Result[] = [];
  for (const terms of ctx.fixture.planTerms) results.push(await oneTerms(ctx, admin, terms));

  return summarize(results);
}

export const CATALOG_EXTRA_STEPS: readonly DemoStep[] = [
  {
    key: 'catalog.plan-terms',
    title: 'Điều khoản của bốn gói, hai gói để chờ rà soát (IT Admin)',
    needs: ['catalog.subscriptions'],
    run: planTerms,
  },
];
