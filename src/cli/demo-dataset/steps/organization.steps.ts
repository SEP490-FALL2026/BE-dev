import type { DemoAccountSpec } from '../../../modules/installation/public/demo-accounts.types';
import { basis, emailOf, listAll, summarize } from '../demo-step-kit';
import type { DemoRunContext, DemoStep, StepOutcome } from '../demo-run.types';
import type { DemoDepartment, DemoPerson } from '../fixture/demo-fixture.types';

type Result = { status: StepOutcome['status']; label: string };

interface DepartmentRow {
  id: string;
  code: string;
  name: string;
  status: string;
}

interface DepartmentProfile extends DepartmentRow {
  head: { employeeCode: string } | null;
  itAdmin: { employeeCode: string } | null;
}

/** Every date a person started is a fixed past day: the dataset never invents a hire date of today. */
const HIRE_DATE = '2025-01-06';
const same = (a: string, b: string) => a.normalize('NFC').trim() === b.normalize('NFC').trim();

async function departments(ctx: DemoRunContext): Promise<StepOutcome> {
  const existing = await listAll<DepartmentRow>(ctx, ctx.superAdminEmail, '/departments');
  const results: Result[] = [];
  for (const department of ctx.fixture.departments) {
    results.push(await oneDepartment(ctx, department, existing));
  }

  return summarize(results);
}

async function oneDepartment(
  ctx: DemoRunContext,
  department: DemoDepartment,
  existing: DepartmentRow[],
): Promise<Result> {
  const label = department.code;
  const found = existing.find((row) => row.code === department.code);
  if (found) {
    ctx.ids.departments.set(department.code, found.id);
    if (found.status !== 'ACTIVE') return { status: 'conflict', label: `${label} đã ngừng dùng` };

    return same(found.name, department.name)
      ? { status: 'present', label }
      : { status: 'conflict', label: `${label} đã có với tên khác` };
  }
  if (ctx.mode === 'plan') return { status: 'planned', label };
  const created = await ctx.api.call<{ id: string }>(ctx.superAdminEmail, 'POST', '/departments', {
    code: department.code,
    name: department.name,
    function: department.function,
  });
  ctx.ids.departments.set(department.code, created.id);

  return { status: 'done', label };
}

async function employees(ctx: DemoRunContext): Promise<StepOutcome> {
  const found = await ctx.accounts.findEmployees(ctx.fixture.people.map((person) => person.code));
  const members = new Map<string, Map<string, { fullName: string }>>();
  const results: Result[] = [];
  for (const person of ctx.fixture.people) {
    const existing = found.get(person.code);
    if (existing) {
      ctx.ids.employees.set(person.code, existing.id);
      results.push(await placedAsWanted(ctx, person, members));
      continue;
    }
    if (ctx.mode === 'plan') {
      results.push({ status: 'planned', label: person.code });
      continue;
    }
    const created = await ctx.api.call<{ id: string }>(ctx.superAdminEmail, 'POST', '/employees', {
      employeeCode: person.code,
      fullName: person.fullName,
      workEmail: emailOf(ctx, person.code),
      employmentType: person.employmentType,
      hireDate: HIRE_DATE,
      departmentCode: person.department,
      hrBasis: basis(ctx),
    });
    ctx.ids.employees.set(person.code, created.id);
    results.push({ status: 'done', label: person.code });
  }

  return summarize(results);
}

/**
 * An employee of a demo code is the demo one only while they are a member of the department the fixture places them in,
 * under the fixture's name: anything else is somebody's change, reported and never overwritten.
 */
async function placedAsWanted(
  ctx: DemoRunContext,
  person: DemoPerson,
  cache: Map<string, Map<string, { fullName: string }>>,
): Promise<Result> {
  const departmentId = ctx.ids.departments.get(person.department);
  if (!departmentId) return { status: 'conflict', label: `${person.code}: phòng ${person.department} không có` };
  if (!cache.has(departmentId)) {
    const rows = await listAll<{ employeeCode: string; fullName: string }>(
      ctx,
      ctx.superAdminEmail,
      `/departments/${departmentId}/employees`,
    );
    cache.set(departmentId, new Map(rows.map((row) => [row.employeeCode, row])));
  }
  const member = cache.get(departmentId)?.get(person.code);
  if (!member) return { status: 'conflict', label: `${person.code} đã có nhưng không thuộc ${person.department}` };

  return same(member.fullName, person.fullName)
    ? { status: 'present', label: person.code }
    : { status: 'conflict', label: `${person.code} đã có với họ tên khác` };
}

function accountSpecs(ctx: DemoRunContext): DemoAccountSpec[] {
  return ctx.fixture.people
    .filter((person) => person.account !== null)
    .map((person) => ({ employeeCode: person.code, loginEmail: emailOf(ctx, person.code), role: person.account! }));
}

async function accounts(ctx: DemoRunContext): Promise<StepOutcome> {
  const specs = accountSpecs(ctx);
  const before = await ctx.accounts.describe(specs);
  const after = ctx.mode === 'apply' ? await ctx.accounts.create(specs) : before;
  const results: Result[] = after.map((item) => {
    if (item.appUserId) ctx.ids.appUsers.set(item.employeeCode, item.appUserId);
    const wasAbsent = before.find((candidate) => candidate.employeeCode === item.employeeCode)?.state === 'absent';
    if (item.state === 'conflict') return { status: 'conflict', label: `${item.employeeCode}: ${item.reason}` };
    if (item.state === 'no-employee') return { status: 'conflict', label: `${item.employeeCode}: chưa có nhân viên` };
    if (item.state === 'absent') return { status: 'planned', label: item.employeeCode };

    return { status: wasAbsent ? 'done' : 'present', label: item.employeeCode };
  });

  return summarize(results);
}

async function profileOf(ctx: DemoRunContext, code: string): Promise<DepartmentProfile> {
  const id = ctx.ids.departments.get(code);
  if (!id) throw new Error(`The department ${code} has no id yet`);

  return ctx.api.call<DepartmentProfile>(ctx.superAdminEmail, 'GET', `/departments/${id}`);
}

async function itAdmins(ctx: DemoRunContext): Promise<StepOutcome> {
  const results: Result[] = [];
  for (const department of ctx.fixture.departments.filter((candidate) => candidate.itAdmin !== null)) {
    const profile = await profileOf(ctx, department.code);
    const label = `${department.code} ← ${department.itAdmin}`;
    if (profile.itAdmin?.employeeCode === department.itAdmin) results.push({ status: 'present', label });
    else if (profile.itAdmin)
      results.push({ status: 'conflict', label: `${label}: đã có ${profile.itAdmin.employeeCode}` });
    else if (ctx.mode === 'plan') results.push({ status: 'planned', label });
    else {
      await ctx.api.call(ctx.superAdminEmail, 'PATCH', `/departments/${profile.id}`, {
        itAdminEmployeeId: ctx.ids.employees.get(department.itAdmin!),
      });
      results.push({ status: 'done', label });
    }
  }

  return summarize(results);
}

async function heads(ctx: DemoRunContext): Promise<StepOutcome> {
  const results: Result[] = [];
  for (const department of ctx.fixture.departments.filter((candidate) => candidate.head !== null)) {
    const profile = await profileOf(ctx, department.code);
    const label = `${department.code} ← ${department.head}`;
    if (profile.head?.employeeCode === department.head) results.push({ status: 'present', label });
    else if (profile.head) results.push({ status: 'conflict', label: `${label}: đã có ${profile.head.employeeCode}` });
    else if (ctx.mode === 'plan') results.push({ status: 'planned', label });
    else {
      await ctx.api.call(ctx.superAdminEmail, 'POST', `/departments/${profile.id}/head-assignments`, {
        employeeId: ctx.ids.employees.get(department.head!),
        effectiveFrom: ctx.today,
      });
      results.push({ status: 'done', label });
    }
  }

  return summarize(results);
}

/** A role somebody outside the dataset holds stays theirs: the dataset never takes an approval role from a real holder. */
async function approvalRoles(ctx: DemoRunContext): Promise<StepOutcome> {
  const current = await ctx.api.call<{ items: { role: string; holder: { employeeCode: string } | null }[] }>(
    ctx.superAdminEmail,
    'GET',
    '/approval-roles',
  );
  const results: Result[] = [];
  for (const [role, code] of Object.entries(ctx.fixture.approvalRoles)) {
    const holder = current.items.find((item) => item.role === role)?.holder ?? null;
    const label = `${role} ← ${code}`;
    if (holder?.employeeCode === code) results.push({ status: 'present', label });
    else if (holder) results.push({ status: 'conflict', label: `${label}: đang do ${holder.employeeCode} giữ` });
    else if (ctx.mode === 'plan') results.push({ status: 'planned', label });
    else {
      await ctx.api.call(ctx.superAdminEmail, 'PUT', `/approval-roles/${role}`, {
        employeeId: ctx.ids.employees.get(code),
      });
      results.push({ status: 'done', label });
    }
  }

  return summarize(results);
}

export const ORGANIZATION_STEPS: readonly DemoStep[] = [
  { key: 'org.departments', title: 'Phòng ban (Super Admin)', needs: [], run: departments },
  { key: 'org.employees', title: 'Nhân viên (Super Admin)', needs: ['org.departments'], run: employees },
  { key: 'org.accounts', title: 'Tài khoản demo (lệnh vận hành)', needs: ['org.employees'], run: accounts },
  { key: 'org.it-admins', title: 'IT Admin phụ trách phòng (Super Admin)', needs: ['org.accounts'], run: itAdmins },
  { key: 'org.heads', title: 'Trưởng phòng (Super Admin)', needs: ['org.employees'], run: heads },
  { key: 'org.approval-roles', title: 'Vai trò phê duyệt (Super Admin)', needs: ['org.accounts'], run: approvalRoles },
];
