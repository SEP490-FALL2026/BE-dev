import { as, listAll, tag } from '../demo-step-kit';
import type { DemoRunContext, DemoStep, StepOutcome } from '../demo-run.types';
import { termBody } from './request.steps';

async function draft(ctx: DemoRunContext): Promise<StepOutcome> {
  const spec = ctx.fixture.draft;
  const email = await as(ctx, spec.requester);
  const planId = ctx.ids.plans.get(spec.plan);
  const drafts = await listAll<{ planId: string | null; kind: string }>(ctx, email, '/access-requests/drafts');
  if (drafts.some((row) => row.planId === planId && row.kind === 'INDIVIDUAL'))
    return { status: 'present', detail: spec.requester };
  if (ctx.mode === 'plan') return { status: 'planned', detail: `lưu nháp của ${spec.requester}` };
  await ctx.api.call(email, 'POST', '/access-requests/drafts', {
    kind: 'INDIVIDUAL',
    planId,
    businessReason: `${tag(ctx, 'DRAFT')} Bản nháp chưa gửi: phòng chưa có Cost Center nên chưa gửi được.`,
    ...termBody(spec.termMonths),
  });

  return { status: 'done', detail: spec.requester };
}

export function extraSteps(): DemoStep[] {
  return [
    {
      key: 'requests.draft',
      title: 'Bản nháp yêu cầu chưa gửi',
      needs: ['catalog.plans', 'org.accounts', 'finance.cost-centers'],
      run: draft,
    },
  ];
}
