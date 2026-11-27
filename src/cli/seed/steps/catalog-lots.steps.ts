import { dayOffset } from '../demo-dates';
import { as, listAll, summarize } from '../demo-step-kit';
import type { DemoRunContext, DemoStep, StepOutcome } from '../demo-run.types';
import type { DemoLot } from '../fixture/demo-fixture.types';

type Result = { status: StepOutcome['status']; label: string };

interface LotRow {
  id: string;
  licenseCount: number;
  unitPrice: { amount: string };
}

/** The body of `POST /license-lots` for a lot of the fixture: bought on a day in the past, at the price of one license in dong. */
export function lotBody(ctx: DemoRunContext, lot: DemoLot, planId: string): Record<string, unknown> {
  return {
    planId,
    purchasedOn: dayOffset(ctx.today, -lot.purchasedDaysAgo),
    licenseCount: lot.licenseCount,
    unitPrice: lot.unitPrice,
    purpose: lot.purpose,
  };
}

/**
 * The lot of the plan that is the one the fixture names: found by the licenses and the price of one (the day of the purchase moves with the day of the seed), so a
 * rerun never makes a second one. The price is read as a number: the API may write `6000000` as `6000000.00`.
 */
function findLot(rows: readonly LotRow[], lot: DemoLot): LotRow | undefined {
  return rows.find(
    (row) => row.licenseCount === lot.licenseCount && Number(row.unitPrice.amount) === Number(lot.unitPrice.amount),
  );
}

async function oneLot(ctx: DemoRunContext, lot: DemoLot): Promise<Result> {
  const label = `lô ${lot.key} (${lot.licenseCount} license)`;
  const planId = ctx.ids.plans.get(lot.plan);
  if (!planId) return { status: 'conflict', label: `${label}: gói ${lot.plan} chưa có` };
  // The IT Admin who makes a lot answers for it: the one the fixture names.
  const admin = await as(ctx, lot.responsible);
  const found = findLot(await listAll<LotRow>(ctx, admin, `/license-lots?planId=${planId}`), lot);
  if (found) {
    ctx.ids.lots.set(lot.key, found.id);

    return { status: 'present', label };
  }
  if (ctx.mode === 'plan') return { status: 'planned', label };
  const created = await ctx.api.call<{ id: string }>(admin, 'POST', '/license-lots', lotBody(ctx, lot, planId));
  ctx.ids.lots.set(lot.key, created.id);

  return { status: 'done', label };
}

async function lots(ctx: DemoRunContext): Promise<StepOutcome> {
  const results: Result[] = [];
  for (const lot of ctx.fixture.lots) results.push(await oneLot(ctx, lot));

  return summarize(results);
}

export const CATALOG_LOT_STEPS: readonly DemoStep[] = [
  {
    key: 'catalog.lots',
    title: 'Lô license của gói K4: mua một lần, một gói có thể có nhiều lô (IT Admin)',
    needs: ['catalog.plans', 'catalog.workspace-profiles'],
    run: lots,
  },
];
