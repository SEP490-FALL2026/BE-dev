import { DemoApiError } from '../demo-api-client';
import { dayOffset } from '../demo-dates';
import { emailOf, listAll, summarize, tag } from '../demo-step-kit';
import type { DemoRunContext, DemoStep, StepOutcome } from '../demo-run.types';
import type { DemoEmployeeImport, DemoImportRow } from '../fixture/demo-fixture.types';
import { EMPLOYEE_IMPORT_COLUMNS, csvCell } from './file-builders';

type Result = { status: StepOutcome['status']; label: string };

/** Everybody started 400 days before today, as the people of `org.employees` did. */
const HIRE_DAYS_AGO = 400;

function workEmailOf(ctx: DemoRunContext, row: DemoImportRow): string {
  return typeof row.email === 'string'
    ? `${row.email}@${ctx.fixture.emailDomain}`
    : emailOf(ctx, row.email.sameAsPerson);
}

/** The CSV the Super Admin uploads: the columns of the template of `GET /import-templates/employees`, one line a person. */
export function employeeImportCsv(ctx: DemoRunContext, spec: DemoEmployeeImport): string {
  const cells = (row: DemoImportRow): Record<(typeof EMPLOYEE_IMPORT_COLUMNS)[number], string> => ({
    employee_code: row.code,
    full_name: row.fullName,
    work_email: workEmailOf(ctx, row),
    employment_type: row.employmentType,
    hire_date: dayOffset(ctx.today, -HIRE_DAYS_AGO),
    department_code: row.department,
    job_title: row.jobTitle ?? '',
  });

  return [
    EMPLOYEE_IMPORT_COLUMNS.join(','),
    ...spec.rows.map((row) => EMPLOYEE_IMPORT_COLUMNS.map((column) => csvCell(cells(row)[column])).join(',')),
  ].join('\n');
}

interface ImportView {
  id: string;
  previewVersion: number;
  summary: { errors: number };
}

/** A file was uploaded before when the Audit Trail has an `EMPLOYEE_IMPORT.UPLOADED` event that names its file (there is no list of imports). */
async function uploadedBefore(ctx: DemoRunContext, fileName: string): Promise<boolean> {
  const events = await listAll<{ after: { fileName?: string } | null }>(
    ctx,
    ctx.superAdminEmail,
    '/audit-events?action=EMPLOYEE_IMPORT.UPLOADED',
  );

  return events.some((event) => event.after?.fileName === fileName);
}

async function upload(ctx: DemoRunContext, spec: DemoEmployeeImport): Promise<ImportView> {
  return ctx.api.upload<ImportView>(ctx.superAdminEmail, '/employee-imports', {
    name: spec.fileName,
    content: employeeImportCsv(ctx, spec),
    type: 'text/csv',
  });
}

/** The confirmed file: the people exist when it is done; a line the server refuses is a conflict, not something to confirm over. */
async function confirmedImport(ctx: DemoRunContext, spec: DemoEmployeeImport): Promise<Result> {
  const label = spec.fileName;
  const found = await ctx.accounts.findEmployees(spec.rows.map((row) => row.code));
  for (const [code, employee] of found) ctx.ids.employees.set(code, employee.id);
  if (spec.rows.every((row) => found.has(row.code))) return { status: 'present', label };
  if (ctx.mode === 'plan') return { status: 'planned', label };
  const preview = await upload(ctx, spec);
  if (preview.summary.errors !== 0) {
    return {
      status: 'conflict',
      label: `${label}: bản xem trước có ${preview.summary.errors} dòng lỗi, không xác nhận`,
    };
  }
  await ctx.api.call(ctx.superAdminEmail, 'POST', `/employee-imports/${preview.id}/confirmations`, {
    previewVersion: preview.previewVersion,
    idempotencyKey: spec.idempotencyKey,
  });

  return { status: 'done', label };
}

/** The previewed file: uploaded once and never confirmed, with the lines the fixture says the server must refuse. */
async function previewedImport(ctx: DemoRunContext, spec: DemoEmployeeImport): Promise<Result> {
  const label = spec.fileName;
  if (await uploadedBefore(ctx, spec.fileName)) return { status: 'present', label };
  if (ctx.mode === 'plan') return { status: 'planned', label };
  const preview = await upload(ctx, spec);

  return preview.summary.errors === spec.expectedErrors.length
    ? { status: 'done', label }
    : {
        status: 'conflict',
        label: `${label}: bản xem trước có ${preview.summary.errors} dòng lỗi, mong ${spec.expectedErrors.length}`,
      };
}

/** The confirmed files first, then the previews, so a preview is the newest import of the screen. */
async function employeeImports(ctx: DemoRunContext): Promise<StepOutcome> {
  const results: Result[] = [];
  const specs = [...ctx.fixture.employeeImports].sort((a, b) => Number(b.confirm) - Number(a.confirm));
  for (const spec of specs)
    results.push(spec.confirm ? await confirmedImport(ctx, spec) : await previewedImport(ctx, spec));

  return summarize(results);
}

interface AccountRow {
  id: string;
  employee: { employeeCode: string } | null;
}

const codesOf = (rows: readonly AccountRow[]): Set<string> =>
  new Set(rows.flatMap((row) => (row.employee ? [row.employee.employeeCode] : [])));

/** The body of the lock: the reason starts with the tag of the dataset, so the Audit Trail names where the lock came from (`QĐ-81`). */
export const lockBody = (ctx: DemoRunContext, reason: string): { reason: string } => ({
  reason: `${tag(ctx, 'LOCK')} ${reason}`,
});

async function lockOne(
  ctx: DemoRunContext,
  state: { employee: string; reason: string },
  locked: Set<string>,
): Promise<Result> {
  const label = `khóa ${state.employee}`;
  if (locked.has(state.employee)) return { status: 'present', label };
  const id = ctx.ids.appUsers.get(state.employee);
  if (!id)
    return ctx.mode === 'plan'
      ? { status: 'planned', label }
      : { status: 'conflict', label: `${label}: chưa có tài khoản` };
  if (ctx.mode === 'plan') return { status: 'planned', label };
  await ctx.api.call(ctx.superAdminEmail, 'POST', `/app-users/${id}/lock`, lockBody(ctx, state.reason));

  return { status: 'done', label };
}

/** An invitation not redeemed yet is an account in `INVITED`; a person who already has an account, whichever state, is left as they are. */
async function inviteOne(ctx: DemoRunContext, code: string, invited: Set<string>): Promise<Result> {
  const label = `mời ${code}`;
  if (invited.has(code)) return { status: 'present', label };
  const employeeId = ctx.ids.employees.get(code);
  if (!employeeId) return { status: 'conflict', label: `${label}: chưa có nhân viên` };
  if (ctx.mode === 'plan') return { status: 'planned', label };
  try {
    await ctx.api.call(ctx.superAdminEmail, 'POST', '/app-users', { employeeId });
  } catch (error) {
    if (
      error instanceof DemoApiError &&
      error.status === 409 &&
      error.code === 'APP_USER.ALREADY_EXISTS_FOR_EMPLOYEE'
    ) {
      return { status: 'present', label };
    }
    throw error;
  }

  return { status: 'done', label };
}

async function accountStates(ctx: DemoRunContext): Promise<StepOutcome> {
  const locked = codesOf(await listAll<AccountRow>(ctx, ctx.superAdminEmail, '/app-users?status=LOCKED'));
  const invited = codesOf(await listAll<AccountRow>(ctx, ctx.superAdminEmail, '/app-users?activationState=INVITED'));
  const results: Result[] = [];
  for (const state of ctx.fixture.accountStates.locked) results.push(await lockOne(ctx, state, locked));
  for (const code of ctx.fixture.accountStates.invited) results.push(await inviteOne(ctx, code, invited));

  return summarize(results);
}

export const PEOPLE_ADMIN_STEPS: readonly DemoStep[] = [
  {
    key: 'org.employee-imports',
    title: 'Nhập nhân sự: một file đã xác nhận, một bản xem trước có dòng lỗi (Super Admin)',
    needs: ['org.employees'],
    run: employeeImports,
  },
  {
    key: 'org.account-states',
    title: 'Một tài khoản bị khóa và một lời mời chưa kích hoạt (Super Admin)',
    needs: ['org.accounts'],
    run: accountStates,
  },
];
