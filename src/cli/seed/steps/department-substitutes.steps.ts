import { summarize } from '../demo-step-kit';
import type { DemoRunContext, DemoStep, StepOutcome } from '../demo-run.types';
import type { DemoDepartmentSubstitute } from '../fixture/demo-fixture.types';

type Result = { status: StepOutcome['status']; label: string };

interface SubstituteWire {
  substitute: { id: string };
}

/** One appointment in force a department: the one the fixture names is left as it is, another is a difference the run reports, never replaces. */
async function appoint(ctx: DemoRunContext, spec: DemoDepartmentSubstitute): Promise<Result> {
  const label = `${spec.department} ← ${spec.substitute}`;
  const departmentId = ctx.ids.departments.get(spec.department);
  const substituteEmployeeId = ctx.ids.employees.get(spec.substitute);
  if (!departmentId || !substituteEmployeeId)
    return { status: 'conflict', label: `${label}: phòng hoặc người chưa có` };
  const active = await ctx.api.call<{ items: SubstituteWire[] }>(
    ctx.superAdminEmail,
    'GET',
    `/department-it-substitutes?departmentId=${departmentId}&state=ACTIVE&pageSize=1`,
  );
  const [current] = active.items;
  if (current) {
    return current.substitute.id === substituteEmployeeId
      ? { status: 'present', label }
      : { status: 'conflict', label: `${label}: phòng đã có người làm thay khác` };
  }
  if (ctx.mode === 'plan') return { status: 'planned', label };
  await ctx.api.call(ctx.superAdminEmail, 'POST', `/departments/${departmentId}/it-substitutes`, {
    substituteEmployeeId,
    reason: spec.reason,
  });

  return { status: 'done', label };
}

async function departmentSubstitutes(ctx: DemoRunContext): Promise<StepOutcome> {
  const results: Result[] = [];
  for (const spec of ctx.fixture.departmentSubstitutes) results.push(await appoint(ctx, spec));

  return summarize(results);
}

/** The Super Admin names an IT Admin to stand in for the department of the IT Admin who leaves (QĐ-118, W2-27), once the people have moved. */
export const DEPARTMENT_SUBSTITUTE_STEPS: readonly DemoStep[] = [
  {
    key: 'personnel.department-substitutes',
    title: 'Super Admin chỉ định một IT Admin làm thay phòng của người sắp nghỉ (QĐ-118)',
    needs: ['personnel.events', 'org.it-admins'],
    run: departmentSubstitutes,
  },
];
