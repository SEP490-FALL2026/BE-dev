import { dayOffset } from '../demo-dates';
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

/**
 * The notice the head sent about the person with the dataset's tag, whatever happened to it since, is the demo one: a
 * second is never sent. Another pending notice of the same kind makes the API refuse the demo one (a conflict).
 */
async function notice(ctx: DemoRunContext): Promise<StepOutcome> {
  const spec = ctx.fixture.notice;
  const sender = await as(ctx, spec.sender);
  const notices = await listAll<{ id: string; employee: { employeeCode: string }; kind: string; status: string }>(
    ctx,
    sender,
    '/personnel-notices',
  );
  const marker = tag(ctx, 'NOTICE');
  for (const row of notices.filter((n) => n.employee.employeeCode === spec.employee && n.kind === spec.kind)) {
    const detail = await ctx.api.call<{ note: string | null }>(sender, 'GET', `/personnel-notices/${row.id}`);
    if (detail.note?.startsWith(marker)) return { status: 'present', detail: `${spec.employee}: ${row.status}` };
  }
  if (ctx.mode === 'plan') return { status: 'planned', detail: `${spec.sender} gửi BM-09 về ${spec.employee}` };
  await ctx.api.call(sender, 'POST', '/personnel-notices', {
    employeeId: ctx.ids.employees.get(spec.employee),
    kind: spec.kind,
    proposedOn: dayOffset(ctx.today, spec.proposedInDays),
    note: spec.note,
  });

  return { status: 'done', detail: spec.employee };
}

export function extraSteps(): DemoStep[] {
  return [
    {
      key: 'requests.draft',
      title: 'Bản nháp yêu cầu chưa gửi',
      needs: ['catalog.plans', 'org.accounts', 'finance.cost-centers'],
      run: draft,
    },
    { key: 'personnel.notice', title: 'Thông báo biến động BM-09 chờ Super Admin', needs: ['org.heads'], run: notice },
  ];
}
