import { dayOffset } from '../demo-dates';
import { summarize } from '../demo-step-kit';
import type { DemoRunContext, DemoStep, StepOutcome } from '../demo-run.types';
import type { DemoPersonnelEvent } from '../fixture/demo-fixture.types';

type Result = { status: StepOutcome['status']; label: string };

/** The basis the Super Admin records an event on: a document from outside the application (a decision, an approved application). */
function grounds(ctx: DemoRunContext, code: string) {
  return {
    type: 'HR_DECISION' as const,
    reference: `${ctx.fixture.marker}-QD-${code}`,
    issuer: 'Phòng Nhân sự (nguồn ban hành ngoài hệ thống)',
    issuedOn: dayOffset(ctx.today, -1),
  };
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

async function record(ctx: DemoRunContext, event: DemoPersonnelEvent): Promise<Result> {
  const label = `${event.kind} ${event.employee}`;
  const employeeId = ctx.ids.employees.get(event.employee);
  if (!employeeId) return { status: 'conflict', label: `${label}: chưa có nhân viên` };
  const spec = (() => {
    switch (event.kind) {
      case 'LONG_LEAVE':
        return {
          list: '/long-leaves',
          write: '/long-leaves',
          body: {
            employeeId,
            startedOn: ctx.today,
            approvedReturnOn: dayOffset(ctx.today, event.returnInDays),
            grounds: grounds(ctx, event.employee),
          },
        };
      case 'OFFBOARDING':
        return {
          list: '/offboarding-cases',
          write: '/offboarding-cases',
          body: {
            employeeId,
            lastWorkingDay: ctx.today,
            accessBlockMode: 'BLOCK_NOW',
            grounds: grounds(ctx, event.employee),
            successor: { kind: 'NONE' },
          },
        };
    }
  })();
  if (await exists(ctx, spec.list, employeeId)) return { status: 'present', label };
  if (ctx.mode === 'plan') return { status: 'planned', label };
  await ctx.api.call(ctx.superAdminEmail, 'POST', spec.write, spec.body);

  return { status: 'done', label };
}

/**
 * The events of the people that feed the rules (a long leave, and a departure that blocks access today),
 * recorded by the Super Admin after the baseline: the baseline refuses a person who is no longer working.
 */
async function personnel(ctx: DemoRunContext): Promise<StepOutcome> {
  const results: Result[] = [];
  for (const event of ctx.fixture.personnel) results.push(await record(ctx, event));

  return summarize(results);
}

export const PERSONNEL_STEPS: readonly DemoStep[] = [
  {
    key: 'personnel.events',
    title: 'Nghỉ dài và nghỉ việc chặn ngay (Super Admin, có căn cứ)',
    needs: ['catalog.baseline-close', 'org.accounts'],
    run: personnel,
  },
];
