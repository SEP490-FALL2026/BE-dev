import { as, listAll, summarize } from '../demo-step-kit';
import type { DemoRunContext, DemoStep, StepOutcome } from '../demo-run.types';

/** The keys the store of a K4 plan holds: values of the demo, written as the IT Admin would paste them, never shared. */
function keyValues(count: number, subscription: string): string[] {
  return Array.from(
    { length: count },
    (_, index) => `${subscription.toUpperCase().slice(0, 4)}-7Q2K-X9M4-${String(index + 1).padStart(4, '0')}`,
  );
}

/** The key store of each K4 subscription of the fixture: keys imported by the IT Admin in charge, once (a store with keys is the dataset's). */
async function keys(ctx: DemoRunContext): Promise<StepOutcome> {
  const results: { status: StepOutcome['status']; label: string }[] = [];
  for (const spec of ctx.fixture.keys) {
    const subscription = ctx.fixture.subscriptions.find((candidate) => candidate.key === spec.subscription);
    const subscriptionId = ctx.ids.subscriptions.get(spec.subscription);
    if (!subscription || !subscriptionId) {
      results.push({ status: 'conflict', label: `${spec.subscription}: thuê bao chưa có` });
      continue;
    }
    const admin = await as(ctx, subscription.responsible);
    const label = `${spec.subscription}: ${spec.count} khóa`;
    const stored = await listAll<{ id: string }>(ctx, admin, `/license-keys?subscriptionId=${subscriptionId}`);
    if (stored.length > 0) results.push({ status: 'present', label });
    else if (ctx.mode === 'plan') results.push({ status: 'planned', label });
    else {
      await ctx.api.call(admin, 'POST', '/license-keys/imports', {
        subscriptionId,
        keys: keyValues(spec.count, spec.subscription),
      });
      results.push({ status: 'done', label });
    }
  }

  return summarize(results);
}

export const ASSET_STEPS: readonly DemoStep[] = [
  { key: 'assets.keys', title: 'Kho khóa của gói K4 (IT Admin)', needs: ['catalog.subscriptions'], run: keys },
];
