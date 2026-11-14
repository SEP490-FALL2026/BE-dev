import { addWorkingDays } from '../../../core/working-days';
import { dayOffset } from '../demo-dates';
import { summarize } from '../demo-step-kit';
import type { DemoRunContext, DemoStep, StepOutcome } from '../demo-run.types';
import type { DemoPersonnelEvent } from '../fixture/demo-fixture.types';

type Result = { status: StepOutcome['status']; label: string };

/** The basis the Super Admin records an event on, in one box (`QĐ-110a`): a document from outside the application. */
function groundsNote(ctx: DemoRunContext, code: string): string {
  return `${ctx.fixture.marker}-QD-${code}: quyết định của phòng Nhân sự (nguồn ban hành ngoài hệ thống)`;
}

/** The event of the person in any state counts as the dataset's: a run never records a second one. */
async function exists(ctx: DemoRunContext, path: string, employeeId: string): Promise<boolean> {
  const rows = await ctx.api.call<{ items: unknown[] }>(
    ctx.superAdminEmail,
    'GET',
    `${path}?employeeId=${employeeId}&pageSize=1`,
  );

  return rows.items.length > 0;
}

/** What the Super Admin writes for an event: the list a rerun reads to find it, the route, the body. */
function eventSpec(
  ctx: DemoRunContext,
  event: DemoPersonnelEvent,
  employeeId: string,
): { list: string; write: string; body: Record<string, unknown> } {
  const grounds = groundsNote(ctx, event.employee);
  switch (event.kind) {
    case 'LONG_LEAVE':
      return {
        list: '/long-leaves',
        write: '/long-leaves',
        body: {
          employeeId,
          startedOn: ctx.today,
          approvedReturnOn: dayOffset(ctx.today, event.returnInDays),
          groundsNote: grounds,
        },
      };
    case 'OFFBOARDING': {
      // The weekends only: the dataset declares no holiday. None of the people who leave heads a department, so no successor is named.
      const days = event.lastDayInWorkingDays;
      return {
        list: '/offboarding-cases',
        write: '/offboarding-cases',
        body: {
          employeeId,
          lastWorkingDay: days === undefined ? ctx.today : addWorkingDays(ctx.today, days, new Set()),
          accessBlockMode: days === undefined ? 'BLOCK_NOW' : 'WITH_LAST_DAY',
          groundsNote: grounds,
          successor: { kind: 'NONE' },
        },
      };
    }
    case 'TRANSFER':
      return {
        list: '/department-transfers',
        write: '/department-transfers',
        body: {
          employeeId,
          toDepartmentId: ctx.ids.departments.get(event.toDepartment),
          effectiveOn: dayOffset(ctx.today, event.effectiveInDays),
          groundsNote: grounds,
        },
      };
  }
}

async function record(ctx: DemoRunContext, event: DemoPersonnelEvent): Promise<Result> {
  const label =
    event.kind === 'TRANSFER'
      ? `TRANSFER ${event.employee} → ${event.toDepartment}`
      : `${event.kind} ${event.employee}`;
  const employeeId = ctx.ids.employees.get(event.employee);
  if (!employeeId) return { status: 'conflict', label: `${label}: chưa có nhân viên` };
  const spec = eventSpec(ctx, event, employeeId);
  if (await exists(ctx, spec.list, employeeId)) return { status: 'present', label };
  if (ctx.mode === 'plan') return { status: 'planned', label };
  await ctx.api.call(ctx.superAdminEmail, 'POST', spec.write, spec.body);

  return { status: 'done', label };
}

/**
 * The events of the people, recorded by the Super Admin after the baseline and the requests (the baseline refuses a person who is no longer
 * working, and a request is sent by a person who still works): a long leave, a departure that blocks access today, the departure of an IT
 * Admin with a last working day ahead, and a transfer that takes effect tomorrow.
 */
async function personnel(ctx: DemoRunContext): Promise<StepOutcome> {
  const results: Result[] = [];
  for (const event of ctx.fixture.personnel) results.push(await record(ctx, event));

  return summarize(results);
}

export const PERSONNEL_STEPS: readonly DemoStep[] = [
  {
    key: 'personnel.events',
    title: 'Nghỉ dài, nghỉ việc (chặn ngay; IT Admin có ngày cuối) và điều chuyển (Super Admin, có căn cứ)',
    needs: ['catalog.baseline-close', 'org.accounts', 'org.it-admins'],
    run: personnel,
  },
];
