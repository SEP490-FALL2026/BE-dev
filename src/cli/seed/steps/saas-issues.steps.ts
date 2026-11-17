import { as, listAll, person, summarize, tag } from '../demo-step-kit';
import type { DemoRunContext, DemoStep, StepOutcome } from '../demo-run.types';
import type { DemoSaasIssue } from '../fixture/demo-fixture.types';
import { departmentOf } from './request-actions';

type Command = { kind: 'TRANSITION'; to: string } | { kind: 'REOPEN' | 'REPLY' | 'DUPLICATE' };
interface Issue {
  id: string;
  state: string;
  reopenCount: number;
  description: string;
}
interface IssueNow {
  state: string;
  reopenCount: number;
  replied: boolean;
}
const progress: Command = { kind: 'TRANSITION', to: 'IN_PROGRESS' };
const resolve: Command = { kind: 'TRANSITION', to: 'RESOLVED' };

function reopeningCommands(now: IssueNow): Command[] | null {
  if (now.reopenCount === 1 && now.state === 'IN_PROGRESS') return [];
  if (now.reopenCount !== 0 || !['NEW', 'IN_PROGRESS', 'RESOLVED'].includes(now.state)) return null;
  return [
    ...(now.state === 'NEW' ? [progress] : []),
    ...(now.state === 'RESOLVED' ? [] : [resolve]),
    { kind: 'REOPEN' },
  ];
}

function handlingCommands(now: IssueNow, spec: Pick<DemoSaasIssue, 'end' | 'reporterReply'>): Command[] | null {
  const start = now.state === 'NEW' ? [progress] : [];
  if (spec.end === 'IN_PROGRESS') {
    if (!['NEW', 'IN_PROGRESS'].includes(now.state)) return null;
    return [...start, ...(spec.reporterReply && !now.replied ? [{ kind: 'REPLY' } as const] : [])];
  }
  if (now.state === 'WAITING_PROVIDER') return [];
  return ['NEW', 'IN_PROGRESS'].includes(now.state) ? [...start, { kind: 'TRANSITION', to: 'WAITING_PROVIDER' }] : null;
}

/** Resume only a path the fixture owns; a different final state is a conflict. */
export function issueCommands(now: IssueNow, spec: Pick<DemoSaasIssue, 'end' | 'reporterReply'>): Command[] | null {
  const { state } = now;
  const start = state === 'NEW' ? [progress] : [];
  switch (spec.end) {
    case 'NEW':
      return state === 'NEW' ? [] : null;
    case 'DUPLICATE':
      return duplicateCommands(state);
    case 'IN_PROGRESS':
    case 'WAITING_PROVIDER':
      return handlingCommands(now, spec);
    case 'RESOLVED':
      if (['RESOLVED', 'CLOSED'].includes(state)) return [];
      return ['NEW', 'IN_PROGRESS', 'WAITING_PROVIDER', 'WAITING_REPORTER'].includes(state)
        ? [...start, resolve]
        : null;
    case 'REOPENED':
      return reopeningCommands(now);
  }
}

function duplicateCommands(state: string): Command[] | null {
  if (state === 'DUPLICATE') return [];
  return state === 'NEW' ? [{ kind: 'DUPLICATE' }] : null;
}

async function administrator(ctx: DemoRunContext, spec: DemoSaasIssue): Promise<string> {
  const code = departmentOf(ctx, person(ctx, spec.reporter).department ?? '').itAdmin;
  if (!code) throw new Error(`${spec.key}: no department IT Admin`);
  return as(ctx, code);
}

async function findIssue(ctx: DemoRunContext, email: string, spec: DemoSaasIssue): Promise<Issue | undefined> {
  const rows = await listAll<{ id: string }>(ctx, email, '/saas-issues?scope=all');
  for (const row of rows) {
    const detail = await ctx.api.call<Issue>(email, 'GET', `/saas-issues/${row.id}`);
    if (detail.description.startsWith(tag(ctx, spec.key))) return detail;
  }
  return undefined;
}

async function report(ctx: DemoRunContext, email: string, spec: DemoSaasIssue): Promise<void> {
  const options = await listAll<{ assignmentId: string; plan: { planId: string } }>(ctx, email, '/saas-issues/options');
  const seat = options.find((row) => row.plan.planId === ctx.ids.plans.get(spec.plan));
  if (!seat) throw new Error(`${spec.key}: ${spec.reporter} has no reportable seat of ${spec.plan}`);
  await ctx.api.call(email, 'POST', '/saas-issues', {
    assignmentId: seat.assignmentId,
    category: 'NO_ACCESS',
    impact: 'PARTIAL',
    description: `${tag(ctx, spec.key)} ${spec.description}`,
    occurredAt: new Date(Date.now() - 3600000).toISOString(),
  });
}

async function execute(
  ctx: DemoRunContext,
  spec: DemoSaasIssue,
  issue: Issue,
  command: Command,
  reporter: string,
  admin: string,
) {
  const path = `/saas-issues/${issue.id}`;
  const marker = tag(ctx, spec.key);
  switch (command.kind) {
    case 'TRANSITION':
      await ctx.api.call(admin, 'POST', `${path}/transitions`, {
        to: command.to,
        ...(command.to === 'IN_PROGRESS' ? { message: `${marker} IT đã nhận và đang kiểm tra.` } : {}),
        ...(command.to === 'RESOLVED' ? { resolution: `${marker} Đã cấp lại lời mời và kiểm tra truy cập.` } : {}),
        ...(command.to === 'WAITING_PROVIDER' ? { vendorTicketRef: `${marker} VND-005` } : {}),
      });
      break;
    case 'REPLY':
      await ctx.api.call(reporter, 'POST', `${path}/messages`, { body: `${marker} ${spec.reporterReply}` });
      break;
    case 'REOPEN':
      await ctx.api.call(reporter, 'POST', `${path}/reopening`, { reason: `${marker} Vẫn chưa truy cập được.` });
      break;
    case 'DUPLICATE': {
      const originalSpec = ctx.fixture.saasIssues.find((candidate) => candidate.key === spec.duplicateOf);
      const original = originalSpec ? await findIssue(ctx, admin, originalSpec) : undefined;
      if (!original) throw new Error(`${spec.key}: original issue is missing`);
      await ctx.api.call(admin, 'POST', `${path}/duplicate`, {
        ofIssueId: original.id,
        reason: `${marker} Cùng sự cố đã báo trước đó.`,
      });
      break;
    }
  }
}

async function oneIssue(ctx: DemoRunContext, spec: DemoSaasIssue) {
  const admin = await administrator(ctx, spec);
  let issue = await findIssue(ctx, admin, spec);
  let wrote = false;
  if (!issue) {
    if (ctx.mode === 'plan') return { status: 'planned' as const, label: spec.key };
    await report(ctx, await as(ctx, spec.reporter), spec);
    issue = await findIssue(ctx, admin, spec);
    wrote = true;
  }
  if (!issue) throw new Error(`${spec.key}: report could not be read back`);
  const replied = await alreadyReplied(ctx, admin, issue.id, spec);
  const commands = issueCommands({ ...issue, replied }, spec);
  if (commands === null) return { status: 'conflict' as const, label: `${spec.key}: ${issue.state}` };
  if (commands.length && ctx.mode === 'plan') return { status: 'planned' as const, label: spec.key };
  if (commands.length) {
    const reporter = await as(ctx, spec.reporter);
    for (const command of commands) await execute(ctx, spec, issue, command, reporter, admin);
  }
  return { status: wrote || commands.length ? ('done' as const) : ('present' as const), label: spec.key };
}

async function alreadyReplied(ctx: DemoRunContext, admin: string, id: string, spec: DemoSaasIssue): Promise<boolean> {
  if (!spec.reporterReply) return false;
  const entries = await listAll<{ authorRole: string; kind: string; body: string | null }>(
    ctx,
    admin,
    `/saas-issues/${id}/entries`,
  );
  return entries.some(
    (entry) =>
      entry.authorRole === 'REPORTER' && entry.kind === 'MESSAGE' && entry.body?.startsWith(tag(ctx, spec.key)),
  );
}

async function issues(ctx: DemoRunContext): Promise<StepOutcome> {
  const results = [];
  for (const spec of ctx.fixture.saasIssues) results.push(await oneIssue(ctx, spec));
  return summarize(results);
}

export const SAAS_ISSUE_STEPS: readonly DemoStep[] = [
  {
    key: 'saas.issues',
    title: 'Báo lỗi SaaS: xử lý, mở lại, chờ nhà cung cấp và bản trùng',
    needs: ['requests.R01', 'catalog.baseline-close', 'org.it-admins'],
    run: issues,
  },
];
