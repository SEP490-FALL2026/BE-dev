import { dayOffset } from '../demo-dates';
import { as, listAll, summarize, tag } from '../demo-step-kit';
import type { DemoRunContext, DemoStep, StepOutcome } from '../demo-run.types';
import type { DemoNotice } from '../fixture/demo-fixture.types';

interface Notice {
  id: string;
  employee: { employeeCode: string };
  kind: string;
  status: string;
}

export function noticeMove(spec: Pick<DemoNotice, 'handling'>, status: string): 'PRESENT' | 'HANDLE' | 'CONFLICT' {
  const target =
    spec.handling === undefined ? 'PENDING_VERIFICATION' : spec.handling === 'REJECT' ? 'REJECTED' : 'RECORDED';
  if (status === target) return 'PRESENT';
  return status === 'PENDING_VERIFICATION' ? 'HANDLE' : 'CONFLICT';
}

export function noticeBody(ctx: DemoRunContext, spec: DemoNotice, employeeId: string) {
  return {
    employeeId,
    kind: spec.kind,
    proposedOn: dayOffset(ctx.today, spec.proposedInDays),
    note: `${tag(ctx, spec.key)} ${spec.note}`,
  };
}

export function linkingBody(ctx: DemoRunContext, spec: DemoNotice, eventId: string) {
  return {
    eventId,
    verification: {
      method: 'DIRECT_CONTACT',
      reference: `${tag(ctx, spec.key)} Đã xác nhận với phòng Nhân sự và trưởng phòng.`,
    },
  };
}

export function rejectionBody(ctx: DemoRunContext, spec: DemoNotice) {
  return { reason: `${tag(ctx, spec.key)} Chưa có căn cứ của phòng Nhân sự; gửi lại khi có quyết định.` };
}

export function recordingBody(ctx: DemoRunContext, spec: DemoNotice) {
  return {
    verification: {
      method: 'ATTACHED_DOCUMENT',
      reference: `${tag(ctx, spec.key)} Quyết định nghỉ dài của phòng Nhân sự.`,
    },
    grounds: {
      type: 'HR_DECISION',
      reference: `${ctx.fixture.marker}-QD-${spec.employee}`,
      issuer: 'Phòng Nhân sự',
      issuedOn: ctx.today,
    },
    event: { startedOn: ctx.today, approvedReturnOn: dayOffset(ctx.today, spec.returnInDays ?? 5) },
  };
}

async function findNotice(ctx: DemoRunContext, spec: DemoNotice): Promise<Notice | undefined> {
  const rows = await listAll<Notice>(ctx, ctx.superAdminEmail, '/personnel-notices');
  for (const row of rows.filter((item) => item.employee.employeeCode === spec.employee && item.kind === spec.kind)) {
    const detail = await ctx.api.call<{ note: string | null }>(
      ctx.superAdminEmail,
      'GET',
      `/personnel-notices/${row.id}`,
    );
    if (detail.note?.startsWith(tag(ctx, spec.key))) return row;
  }
  return undefined;
}

async function handle(ctx: DemoRunContext, spec: DemoNotice, notice: Notice): Promise<void> {
  const path = `/personnel-notices/${notice.id}`;
  if (spec.handling === 'REJECT') {
    await ctx.api.call(ctx.superAdminEmail, 'POST', `${path}/rejection`, rejectionBody(ctx, spec));
  } else if (spec.handling === 'RECORD') {
    await ctx.api.call(ctx.superAdminEmail, 'POST', `${path}/recording`, recordingBody(ctx, spec));
  } else if (spec.handling === 'LINK') {
    const leaves = await listAll<{ id: string; status: string }>(
      ctx,
      ctx.superAdminEmail,
      `/long-leaves?employeeId=${ctx.ids.employees.get(spec.employee)}`,
    );
    const leave = leaves.find((row) => row.status === 'ACTIVE');
    if (!leave) throw new Error(`${spec.key}: no active leave to link`);
    await ctx.api.call(ctx.superAdminEmail, 'POST', `${path}/linking`, linkingBody(ctx, spec, leave.id));
  }
}

async function oneNotice(ctx: DemoRunContext, spec: DemoNotice) {
  let notice = await findNotice(ctx, spec);
  let wrote = false;
  if (!notice) {
    if (ctx.mode === 'plan') return { status: 'planned' as const, label: spec.key };
    const employeeId = ctx.ids.employees.get(spec.employee);
    if (!employeeId) throw new Error(`${spec.key}: missing employee`);
    await ctx.api.call(await as(ctx, spec.sender), 'POST', '/personnel-notices', noticeBody(ctx, spec, employeeId));
    notice = await findNotice(ctx, spec);
    wrote = true;
  }
  if (!notice) throw new Error(`${spec.key}: notice could not be read back`);
  const move = noticeMove(spec, notice.status);
  if (move === 'CONFLICT') return { status: 'conflict' as const, label: `${spec.key}: ${notice.status}` };
  if (move === 'HANDLE') {
    if (ctx.mode === 'plan') return { status: 'planned' as const, label: spec.key };
    await handle(ctx, spec, notice);
    wrote = true;
  }
  return { status: wrote ? ('done' as const) : ('present' as const), label: spec.key };
}

async function notices(ctx: DemoRunContext): Promise<StepOutcome> {
  const results = [];
  for (const spec of ctx.fixture.notices) results.push(await oneNotice(ctx, spec));
  return summarize(results);
}

export const NOTICE_STEPS: readonly DemoStep[] = [
  {
    key: 'personnel.notices',
    title: 'BM-09: chờ xác minh, đã gắn, bị từ chối và đã ghi',
    needs: ['org.heads', 'personnel.events', 'requests.R48', 'requests.R54'],
    run: notices,
  },
];
