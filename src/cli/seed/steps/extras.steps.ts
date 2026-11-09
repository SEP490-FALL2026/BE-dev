import { termEndOf } from '../../../core/term-limit';
import { addDays, as, listAll, tag } from '../demo-step-kit';
import type { DemoRunContext, DemoStep, StepOutcome } from '../demo-run.types';

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
    businessReason: `${tag(ctx, 'DRAFT')} Bản nháp chưa gửi.`,
    expectedEndDate: termEndOf(ctx.today, spec.termMonths),
  });

  return { status: 'done', detail: spec.requester };
}

/** The issue is reported on the seat the scenario request granted, by the person who holds it. */
async function saasIssue(ctx: DemoRunContext): Promise<StepOutcome> {
  const scenario = ctx.fixture.requests.find((candidate) => candidate.key === ctx.fixture.saasIssue.request);
  if (!scenario?.plan) return { status: 'conflict', detail: 'kịch bản cấp quyền của báo lỗi không có trong fixture' };
  const reporter = await as(ctx, scenario.requester);
  const planId = ctx.ids.plans.get(scenario.plan);
  const options = await listAll<{ assignmentId: string; plan: { planId: string } }>(
    ctx,
    reporter,
    '/saas-issues/options',
  );
  const seat = options.find((row) => row.plan.planId === planId);
  if (!seat) return { status: 'conflict', detail: `${scenario.requester} chưa giữ ghế của gói để báo lỗi` };
  const issues = await listAll<{ id: string; assignmentId: string }>(ctx, reporter, '/saas-issues');
  const marker = tag(ctx, 'ISSUE');
  for (const row of issues.filter((issue) => issue.assignmentId === seat.assignmentId)) {
    // Only the issue whose text carries the dataset's tag is the demo one: one the person filed themselves is theirs.
    const detail = await ctx.api.call<{ description: string }>(reporter, 'GET', `/saas-issues/${row.id}`);
    if (detail.description.startsWith(marker)) return { status: 'present', detail: scenario.requester };
  }
  if (ctx.mode === 'plan') return { status: 'planned', detail: `báo lỗi của ${scenario.requester}` };
  await ctx.api.call(reporter, 'POST', '/saas-issues', {
    assignmentId: seat.assignmentId,
    category: 'NO_ACCESS',
    impact: 'PARTIAL',
    description: ctx.fixture.saasIssue.description,
    occurredAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  });

  return { status: 'done', detail: scenario.requester };
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
    proposedOn: addDays(ctx.today, spec.proposedInDays),
    note: spec.note,
  });

  return { status: 'done', detail: spec.employee };
}

export function extraSteps(issueRequestKey: string): DemoStep[] {
  return [
    { key: 'requests.draft', title: 'Bản nháp yêu cầu chưa gửi', needs: ['catalog.plans', 'org.accounts'], run: draft },
    {
      key: 'saas.issue',
      title: 'Báo lỗi SaaS trên ghế đã cấp',
      needs: [`requests.${issueRequestKey}`],
      run: saasIssue,
    },
    { key: 'personnel.notice', title: 'Thông báo biến động BM-09 chờ Super Admin', needs: ['org.heads'], run: notice },
  ];
}
