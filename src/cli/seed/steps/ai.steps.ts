import { as, listAll, summarize } from '../demo-step-kit';
import type { DemoRunContext, DemoStep, StepOutcome } from '../demo-run.types';
import type { DemoFixture } from '../fixture/demo-fixture.types';

const SWITCHES = ['AI_ENABLED', 'AI_ACCESS_REQUEST_SUMMARY_ENABLED'] as const;

async function switches(ctx: DemoRunContext): Promise<StepOutcome> {
  const { items } = await ctx.api.call<{ items: { key: string; value: unknown }[] }>(
    ctx.superAdminEmail,
    'GET',
    '/operating-parameters',
  );
  if (items.find(({ key }) => key === 'AI_PROVIDER_MODE')?.value !== 'SIMULATED')
    return { status: 'conflict', detail: 'S19 requires SIMULATED; the provider mode is left to the operator' };
  const missing = SWITCHES.filter((key) => items.find((row) => row.key === key)?.value !== 'ON');
  if (!missing.length) return { status: 'present' };
  if (ctx.mode === 'plan') return { status: 'planned' };
  for (const key of missing)
    await ctx.api.call(ctx.superAdminEmail, 'PUT', `/operating-parameters/${key}`, { value: 'ON' });
  return { status: 'done', detail: missing.join(', ') };
}

/** Optional observation only: an accepted invocation stays done even while its worker is pending or the read fails. */
async function observedStatus(ctx: DemoRunContext, email: string, id: string): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      ctx.api
        .call<{ status: string }>(email, 'GET', `/ai/access-request-summaries/${id}`)
        .then(({ status }) => status)
        .catch(() => 'detail unavailable'),
      new Promise<string>((resolve) => {
        timer = setTimeout(() => resolve('detail pending'), 30_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function oneSummary(ctx: DemoRunContext, code: string) {
  const actorId = ctx.ids.appUsers.get(code);
  if (!actorId) return { status: 'conflict' as const, label: `${code}: no account id` };
  const events = await listAll<{ id: string }>(
    ctx,
    ctx.superAdminEmail,
    `/audit-events?actorAppUserId=${actorId}&action=AI_INVOCATION.REQUESTED`,
  );
  if (events.length) return { status: 'present' as const, label: code };
  if (ctx.mode === 'plan') return { status: 'planned' as const, label: code };
  const email = await as(ctx, code);
  const { queueRevision } = await ctx.api.call<{ queueRevision: string }>(
    email,
    'GET',
    '/ai/access-request-summaries/source',
  );
  const accepted = await ctx.api.call<{ invocationId: string; status: string }>(
    email,
    'POST',
    '/ai/access-request-summaries',
    { queueRevision },
  );
  const status = await observedStatus(ctx, email, accepted.invocationId);
  return { status: 'done' as const, label: `${code}: accepted ${accepted.status}, ${status}` };
}

async function summaries(ctx: DemoRunContext): Promise<StepOutcome> {
  const results = [];
  for (const code of ctx.fixture.aiSummaries) results.push(await oneSummary(ctx, code));
  return summarize(results);
}

export const AI_STEPS: readonly DemoStep[] = [
  {
    key: 'ai.switches',
    title: 'Bật AI và tóm tắt hàng chờ trong chế độ giả lập',
    needs: ['org.accounts'],
    run: switches,
  },
  {
    key: 'ai.summaries',
    title: 'Ba người duyệt gọi tóm tắt hàng chờ bằng AI giả lập',
    needs: ['ai.switches', 'org.approval-roles'],
    run: summaries,
  },
];

/** Every request must finish first, including requests added by a later fixture version. */
export function aiSteps(fixture: DemoFixture): DemoStep[] {
  return AI_STEPS.map((step) =>
    step.key === 'ai.summaries'
      ? { ...step, needs: [...step.needs, ...fixture.requests.map(({ key }) => `requests.${key}`)] }
      : step,
  );
}
