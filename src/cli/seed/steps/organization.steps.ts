import type { DemoAccountSpec } from '../../../modules/installation/public/demo-accounts.types';
import { dayOffset } from '../demo-dates';
import { emailOf, listAll, summarize } from '../demo-step-kit';
import type { DemoRunContext, DemoStep, StepOutcome } from '../demo-run.types';
import type { DemoDepartment, DemoPerson, DemoPersonnelEvent } from '../fixture/demo-fixture.types';

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

/** Everybody started 400 days before today: a seat granted in the past never precedes the person it is for. */
export const HIRE_DAYS_AGO = 400;
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

/** The body of `POST /employees` for a person of the fixture: a person with a term carries the day the contract ends (RQ-2, D-21). */
export function employeeBodyOf(ctx: DemoRunContext, person: DemoPerson): Record<string, unknown> {
  return {
    employeeCode: person.code,
    fullName: person.fullName,
    workEmail: emailOf(ctx, person.code),
    employmentType: person.employmentType,
    hireDate: dayOffset(ctx.today, -HIRE_DAYS_AGO),
    ...(person.department === null ? {} : { departmentCode: person.department }),
    ...(person.contractEndInDays === undefined
      ? {}
      : { contractEndDate: dayOffset(ctx.today, person.contractEndInDays) }),
  };
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
    const created = await ctx.api.call<{ id: string }>(
      ctx.superAdminEmail,
      'POST',
      '/employees',
      employeeBodyOf(ctx, person),
    );
    ctx.ids.employees.set(person.code, created.id);
    results.push({ status: 'done', label: person.code });
  }

  return summarize(results);
}

/**
 * An employee of a demo code is the demo one only while they are a member of the department the fixture places them in,
 * under the fixture's name: anything else is somebody's change, reported and never overwritten. One the fixture leaves
 * unplaced is read from the profile instead (no department yet).
 */
async function placedAsWanted(
  ctx: DemoRunContext,
  person: DemoPerson,
  cache: Map<string, Map<string, { fullName: string }>>,
): Promise<Result> {
  if (person.department === null) return stillUnplaced(ctx, person);
  const event = personnelEvent(ctx, person.code);
  if (event) return afterPersonnelEvent(ctx, person, event);
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

function personnelEvent(ctx: DemoRunContext, code: string): DemoPersonnelEvent | undefined {
  return [...ctx.fixture.personnel, ctx.fixture.abruptDeparture].find((event) => event.employee === code);
}

interface EmployeeProfile {
  fullName: string;
  department: { code: string } | null;
  status: string;
  workState: string;
}

/** Compare with the event's stored date, never a fresh relative date that would move forward on each rerun. */
async function departmentAfterTransfer(
  ctx: DemoRunContext,
  person: DemoPerson,
  event: Extract<DemoPersonnelEvent, { kind: 'TRANSFER' }>,
): Promise<string | null> {
  const rows = await listAll<{ effectiveOn: string; status: string; to: { department: { code: string } } }>(
    ctx,
    ctx.superAdminEmail,
    `/department-transfers?employeeId=${ctx.ids.employees.get(person.code)}`,
  );
  const transfer = rows.find((row) => row.status !== 'CANCELLED' && row.to.department.code === event.toDepartment);
  return transfer && transfer.effectiveOn <= ctx.today ? event.toDepartment : person.department;
}

/** Only the changes declared by this dataset can explain a different current placement. Names must still match. */
async function afterPersonnelEvent(
  ctx: DemoRunContext,
  person: DemoPerson,
  event: DemoPersonnelEvent,
): Promise<Result> {
  const profile = await ctx.api.call<EmployeeProfile>(
    ctx.superAdminEmail,
    'GET',
    `/employees/${ctx.ids.employees.get(person.code)}`,
  );
  if (!same(profile.fullName, person.fullName))
    return { status: 'conflict', label: `${person.code}: họ tên đã thay đổi` };
  if (
    event.kind === 'OFFBOARDING' &&
    (profile.status === 'TERMINATED' || ['HANDING_OVER', 'LEFT'].includes(profile.workState))
  ) {
    return { status: 'present', label: person.code };
  }
  const expected = event.kind === 'TRANSFER' ? await departmentAfterTransfer(ctx, person, event) : person.department;
  return profile.department?.code === expected
    ? { status: 'present', label: person.code }
    : { status: 'conflict', label: `${person.code}: phòng hiện tại không khớp sự kiện của fixture` };
}

/**
 * The unplaced employee is the demo one under the fixture's name. Placing them is the very thing the demo shows (`QĐ-93g`), so a profile that has a
 * department since is present too, reported with it; only another name is somebody else's change.
 */
async function stillUnplaced(ctx: DemoRunContext, person: DemoPerson): Promise<Result> {
  const id = ctx.ids.employees.get(person.code);
  const profile = await ctx.api.call<{ fullName: string; department: { code: string } | null }>(
    ctx.superAdminEmail,
    'GET',
    `/employees/${id}`,
  );
  if (!same(profile.fullName, person.fullName))
    return { status: 'conflict', label: `${person.code} đã có với họ tên khác` };

  return profile.department === null
    ? { status: 'present', label: person.code }
    : { status: 'present', label: `${person.code} (đã được xếp vào ${profile.department.code} khi demo)` };
}

/**
 * The accounts the run describes against the fixture. A person the dataset locks is left out once the account is locked: the demo account
 * contract reports a locked account as different from its spec (`ACCOUNT_DIFFERS`), which would stop every later run (C-1).
 */
export function accountSpecsToCheck(ctx: DemoRunContext, lockedCodes: ReadonlySet<string>): DemoAccountSpec[] {
  return ctx.fixture.people
    .filter((person) => person.account !== null && !(person.lockedInDemo && lockedCodes.has(person.code)))
    .map((person) => ({
      employeeCode: person.code,
      loginEmail: emailOf(ctx, person.code),
      initialRole: person.account!,
      ...(ctx.fixture.approvalRoles.SPENDING_APPROVER === person.code
        ? { finalRole: 'SPENDING_APPROVER' as const }
        : {}),
    }));
}

/** The locked accounts of the dataset's own people, by employee code (the Super Admin reads the list; there is no filter by employee). */
async function lockedAccounts(ctx: DemoRunContext): Promise<Map<string, string>> {
  const rows = await listAll<{ id: string; employee: { employeeCode: string } | null }>(
    ctx,
    ctx.superAdminEmail,
    '/app-users?status=LOCKED',
  );
  const wanted = new Set(ctx.fixture.people.filter((person) => person.lockedInDemo).map((person) => person.code));

  return new Map(
    rows
      .filter((row) => row.employee !== null && wanted.has(row.employee.employeeCode))
      .map((row) => [row.employee!.employeeCode, row.id]),
  );
}

async function accounts(ctx: DemoRunContext): Promise<StepOutcome> {
  const locked = await lockedAccounts(ctx);
  const specs = accountSpecsToCheck(ctx, new Set(locked.keys()));
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
  for (const [code, id] of locked) {
    ctx.ids.appUsers.set(code, id);
    results.push({ status: 'present', label: `${code} (đã khóa)` });
  }

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
      const accountId = ctx.ids.appUsers.get(department.head!);
      if (!accountId) throw new Error(`The head ${department.head} has no account`);
      const account = await ctx.api.call<{ roles: string[] }>(ctx.superAdminEmail, 'GET', `/app-users/${accountId}`);
      if (account.roles.length !== 1 || account.roles[0] !== 'MANAGER') {
        results.push({ status: 'conflict', label: `${label}: MANAGER required` });
        continue;
      }
      await ctx.api.call(ctx.superAdminEmail, 'POST', `/departments/${profile.id}/head-assignments`, {
        employeeId: ctx.ids.employees.get(department.head!),
        effectiveFrom: ctx.today,
      });
      results.push({ status: 'done', label });
    }
  }

  return summarize(results);
}

async function spendingApprover(ctx: DemoRunContext, code: string): Promise<Result> {
  const role = 'SPENDING_APPROVER';
  const label = `${role} \u2190 ${code}`;
  const accountId = ctx.ids.appUsers.get(code);
  if (!accountId) return { status: 'conflict', label: `${code}: no account` };
  const account = await ctx.api.call<{ roles: string[] }>(ctx.superAdminEmail, 'GET', `/app-users/${accountId}`);
  if (account.roles.includes(role)) return { status: 'present', label };
  const accounts = await listAll<{ id: string; roles: string[]; employee: { employeeCode: string } | null }>(
    ctx,
    ctx.superAdminEmail,
    '/app-users',
  );
  const holder = accounts.find((item) => item.roles.includes(role));
  if (holder) return { status: 'conflict', label: `${label}: held by ${holder.employee?.employeeCode ?? holder.id}` };
  if (ctx.mode === 'plan') return { status: 'planned', label };
  await ctx.api.call(ctx.superAdminEmail, 'PUT', `/app-users/${accountId}/role`, { role });
  return { status: 'done', label };
}

/** The one approval role left: a role somebody outside the dataset holds stays theirs, the dataset never takes it from a real holder. */
async function approvalRoles(ctx: DemoRunContext): Promise<StepOutcome> {
  return summarize([await spendingApprover(ctx, ctx.fixture.approvalRoles.SPENDING_APPROVER)]);
}

export const ORGANIZATION_STEPS: readonly DemoStep[] = [
  { key: 'org.departments', title: 'Phòng ban (Super Admin)', needs: [], run: departments },
  { key: 'org.employees', title: 'Nhân viên (Super Admin)', needs: ['org.departments'], run: employees },
  { key: 'org.accounts', title: 'Tài khoản đăng nhập (lệnh vận hành)', needs: ['org.employees'], run: accounts },
  { key: 'org.it-admins', title: 'IT Admin phụ trách phòng (Super Admin)', needs: ['org.accounts'], run: itAdmins },
  { key: 'org.heads', title: 'Trưởng phòng (Super Admin)', needs: ['org.accounts'], run: heads },
  { key: 'org.approval-roles', title: 'Người duyệt chi (Super Admin)', needs: ['org.accounts'], run: approvalRoles },
];
