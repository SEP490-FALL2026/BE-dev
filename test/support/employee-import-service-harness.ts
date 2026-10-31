import type { DbTx, TransactionRunner } from '../../src/infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../src/infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../src/modules/audit/public/audit.api';
import type { LicensingSeatBaselineApi } from '../../src/modules/licensing/public/licensing-seat-baseline.api';
import type { NotificationsApi } from '../../src/modules/notifications/public/notifications.api';
import type { InAppNotificationInput } from '../../src/modules/notifications/public/notifications.types';
import type { OrganizationApi } from '../../src/modules/organization/public/organization.api';
import type { EmployeeImportLookupData } from '../../src/modules/organization/public/organization.types';
import { EmployeeImportConfirmationService } from '../../src/modules/data-import/employee-import/confirmation/employee-import-confirmation.service';
import type {
  EmployeeImportRepo,
  ImportRecord,
  StoredRow,
} from '../../src/modules/data-import/employee-import/employee-import.repo';
import { EmployeeImportPreviewService } from '../../src/modules/data-import/employee-import/preview/employee-import-preview.service';
import { EmployeeImportRowValidationService } from '../../src/modules/data-import/employee-import/row-validation/employee-import-row-validation.service';

/*
 * The shared harness of the people import use-case specs (H8 Phase 0 characterization, split by use case in Prompt 21A):
 * what the services ask of their collaborators, in which transaction and in which order, and what they write and record.
 * The collaborators are in-memory stand-ins at the boundary (repository, organization facade, audit, transaction
 * runner); the row validation, the row rules and the CSV reader are real. Only construction lives here; the assertions stay
 * in the specs `src/modules/data-import/employee-import/preview/employee-import-{upload,preview-lifecycle}.service.spec.ts`
 * and `confirmation/employee-import-confirmation.service.spec.ts`.
 */

/** The fixed clock of every case: the specs install it with `jest.useFakeTimers(FAKE_CLOCK)`. */
export const NOW = new Date('2026-10-19T03:00:00.000Z');
export const FAKE_CLOCK: Parameters<typeof jest.useFakeTimers>[0] = {
  now: NOW,
  doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'],
};
export const TODAY = '2026-10-19';
/** The Super Admin: the only role that enters new employee records (`QĐ-82i`), with the HR basis of the entry. */
export const ACTOR: AuthenticatedPrincipal = {
  subject: 'u-sa',
  appUserId: 'u-sa',
  sessionId: 'session-1',
  employeeId: 'e-sa',
  directRoles: ['SUPER_ADMIN'],
  derivedRoles: [],
  roles: ['SUPER_ADMIN'],
};
export const OWN_EMPLOYEE_CODE = 'E-SA';
export const OWN_WORK_EMAIL = 'Sa+admin@Acme.vn';
export const HR_BASIS = {
  type: 'LABOR_CONTRACT',
  reference: 'HD-2026-001',
  issuer: 'HR Department',
  issuedOn: '2026-10-01',
} as const;

export interface Department {
  id: string;
  code: string;
  name: string;
  active: boolean;
  headed: boolean;
}

export interface Directory {
  departments: Department[];
  employees: EmployeeImportLookupData['employees'];
}

export function directory(): Directory {
  return {
    departments: [
      { id: 'd-ops', code: 'P-OPS', name: 'Operations', active: true, headed: true },
      { id: 'd-des', code: 'P-DES', name: 'Design', active: true, headed: false },
    ],
    employees: [
      {
        id: 'e-1',
        employeeCode: 'E-001',
        fullName: 'An Nguyen',
        workEmail: 'an@acme.vn',
        employmentType: 'STAFF',
        hireDate: '2026-01-05',
        departmentCode: 'P-OPS',
        jobTitleName: 'Administrator',
      },
      {
        id: 'e-2',
        employeeCode: 'E-002',
        fullName: 'Hoa Vo',
        workEmail: 'hoa@acme.vn',
        employmentType: 'STAFF',
        hireDate: '2026-02-01',
        departmentCode: 'P-OPS',
        jobTitleName: 'Administrator',
      },
    ],
  };
}

/** Line 2 and 3 are new people, 4 is a person already there and the same, 5 differs, 6 is wrong in three columns. */
export const FILE = [
  'employee_code,full_name,work_email,employment_type,hire_date,department_code,job_title,notes',
  'N-1,Binh Tran,Binh@Acme.vn,STAFF,2026-10-01,P-OPS,Administrator,first',
  'N-2,Chi Le,,intern,2026-10-02,P-DES,  designer ,',
  'E-001,An Nguyen,an@acme.vn,STAFF,2026-01-05,P-OPS,Administrator,',
  'E-002,Hoa Vo Thi,hoa@acme.vn,STAFF,2026-02-01,P-OPS,Administrator,',
  'N-3,Dung Pham,dung@acme.vn,STAFF,not-a-date,P-NOPE,Unknown,',
].join('\n');

export function harness(start: Directory = directory()) {
  const dir = start;
  const calls: string[] = [];
  const TX = { name: 'the transaction' } as unknown as DbTx;
  const where = (tx: unknown) => (tx === undefined ? '' : tx === TX ? 'tx' : 'OTHER');
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  const imports = new Map<string, ImportRecord>();
  const storedRows = new Map<string, StoredRow[]>();
  const created: unknown[] = [];
  const audits: unknown[] = [];
  const lookups: unknown[] = [];
  const locks: unknown[] = [];
  const notices: InAppNotificationInput[] = [];
  let sequence = 0;
  let organization: { id: string } | null = { id: 'org-1' };
  let failCreate: ((code: string) => Error | undefined) | undefined;
  let beforeLock: ((record: ImportRecord) => void) | undefined;
  const revive = (record: ImportRecord): ImportRecord => ({
    ...clone(record),
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    confirmedAt: record.confirmedAt,
    cancelledAt: record.cancelledAt,
  });

  const repo = {
    create(tx: DbTx, input: Parameters<EmployeeImportRepo['create']>[1]) {
      calls.push(`repo.create(${where(tx)})`);
      sequence += 1;
      const id = `import-${sequence}`;
      imports.set(id, {
        id,
        organizationId: input.organizationId,
        uploadedBy: input.uploadedBy,
        fileName: input.fileName,
        contentHash: input.contentHash,
        status: 'PREVIEW',
        previewVersion: 1,
        ignoredColumns: [...input.ignoredColumns],
        summary: clone(input.summary),
        result: null,
        confirmKey: null,
        createdAt: new Date(NOW),
        expiresAt: input.expiresAt,
        confirmedAt: null,
        cancelledAt: null,
      });
      storedRows.set(id, clone(input.rows));
      return Promise.resolve(id);
    },
    find(id: string, tx?: DbTx) {
      calls.push(`repo.find(${where(tx)})`);
      const record = imports.get(id);
      return Promise.resolve(record ? revive(record) : null);
    },
    lock(tx: DbTx, id: string) {
      calls.push(`repo.lock(${where(tx)})`);
      const record = imports.get(id);
      if (record && beforeLock) beforeLock(record);
      return Promise.resolve(record ? revive(record) : null);
    },
    rows(tx: DbTx | undefined, id: string) {
      calls.push(`repo.rows(${where(tx)})`);
      return Promise.resolve(clone(storedRows.get(id) ?? []));
    },
    page(id: string, filter: { outcome?: string; skip: number; take: number }) {
      calls.push(`repo.page(${JSON.stringify(filter)})`);
      const all = (storedRows.get(id) ?? []).filter((row) => !filter.outcome || row.outcome === filter.outcome);
      return Promise.resolve({ items: clone(all.slice(filter.skip, filter.skip + filter.take)), total: all.length });
    },
    replacePreview(tx: DbTx, id: string, input: { rows: StoredRow[]; summary: unknown; expiresAt: Date }) {
      calls.push(`repo.replacePreview(${where(tx)})`);
      const record = imports.get(id) as ImportRecord;
      record.previewVersion += 1;
      record.summary = clone(input.summary);
      record.expiresAt = input.expiresAt;
      storedRows.set(id, clone(input.rows));
      return Promise.resolve(record.previewVersion);
    },
    markCompleted(tx: DbTx, id: string, input: { result: unknown; confirmKey: string; now: Date }) {
      calls.push(`repo.markCompleted(${where(tx)})`);
      const record = imports.get(id) as ImportRecord;
      Object.assign(record, {
        status: 'COMPLETED',
        result: clone(input.result),
        confirmKey: input.confirmKey,
        confirmedAt: input.now,
      });
      return Promise.resolve();
    },
    markCancelled(tx: DbTx, id: string, now: Date) {
      calls.push(`repo.markCancelled(${where(tx)}, ${now.toISOString()})`);
      Object.assign(imports.get(id) as ImportRecord, { status: 'CANCELLED', cancelledAt: now });
      return Promise.resolve();
    },
    findLatestKept(organizationId: string) {
      calls.push(`repo.findLatestKept(${organizationId})`);
      return Promise.resolve({ id: 'import-9', status: 'PREVIEW' as const, errorRows: 3, createdAt: NOW });
    },
    findCompletedWithContent(organizationId: string, contentHash: string, client?: DbTx) {
      calls.push(`repo.findCompletedWithContent(${where(client)})`);
      const done = [...imports.values()]
        .filter((record) => record.organizationId === organizationId && record.contentHash === contentHash)
        .filter((record) => record.status === 'COMPLETED' && record.confirmedAt !== null);
      const latest = done.at(-1);
      return Promise.resolve(
        latest ? { id: latest.id, fileName: latest.fileName, confirmedAt: latest.confirmedAt as Date } : null,
      );
    },
  };

  const org = {
    getOrganization() {
      calls.push('org.getOrganization');
      return Promise.resolve(organization);
    },
    lookupForEmployeeImport(names: Parameters<OrganizationApi['lookupForEmployeeImport']>[0], tx?: DbTx) {
      calls.push(`org.lookupForEmployeeImport(${where(tx)})`);
      lookups.push(clone(names));
      const data: EmployeeImportLookupData = {
        departments: dir.departments
          .filter((department) => names.departmentCodes.includes(department.code))
          .map(({ id, code, active }) => ({ id, code, active })),
        employees: dir.employees.filter((employee) => names.employeeCodes.includes(employee.employeeCode)),
        emailOwners: dir.employees
          .filter((employee) => employee.workEmail && names.normalizedEmails.includes(employee.workEmail))
          .map((employee) => ({ normalizedEmail: employee.workEmail as string, employeeCode: employee.employeeCode })),
      };
      return Promise.resolve(data);
    },
    getEmployee(employeeId: string, tx?: DbTx) {
      calls.push(`org.getEmployee(${where(tx)})`);
      return Promise.resolve(
        employeeId === ACTOR.employeeId
          ? { id: employeeId, employeeCode: OWN_EMPLOYEE_CODE, workEmail: OWN_WORK_EMAIL }
          : null,
      );
    },
    lockForEmployeeImport(tx: DbTx, departmentIds: string[]) {
      calls.push(`org.lockForEmployeeImport(${where(tx)})`);
      locks.push({ departmentIds });
      return Promise.resolve();
    },
    businessToday() {
      calls.push('org.businessToday');
      return Promise.resolve(TODAY);
    },
    createEmployeeWithPlacement(tx: DbTx, input: { employeeCode: string }) {
      calls.push(`org.createEmployeeWithPlacement(${where(tx)}, ${input.employeeCode})`);
      const failure = failCreate?.(input.employeeCode);
      if (failure) return Promise.reject(failure);
      created.push(input);
      return Promise.resolve({ id: `new-${input.employeeCode}` });
    },
    /** The notices a created record owes, as the organization builds them: one, to the head of the department (`F17`). */
    getProfileNotices(tx: DbTx, request: { kind: string; organizationId: string; employeeId: string }) {
      calls.push(`org.getProfileNotices(${where(tx)}, ${request.kind}, ${request.employeeId})`);
      const notice: InAppNotificationInput = {
        organizationId: request.organizationId,
        recipientEmployeeId: 'e-head',
        code: 'EMPLOYEE_PROFILE_CREATED',
        subject: { type: 'EMPLOYEE', id: request.employeeId },
        params: { employeeId: request.employeeId, departmentId: null },
        eventKey: `employee_profile_created:${request.employeeId}`,
      };

      return Promise.resolve([notice]);
    },
    departmentsWithoutHead(ids: string[]) {
      calls.push(`org.departmentsWithoutHead(${ids.join(',')})`);
      return Promise.resolve(
        dir.departments
          .filter((department) => ids.includes(department.id) && !department.headed)
          .map(({ id, code, name }) => ({ id, code, name })),
      );
    },
  };

  const audit = {
    record(tx: DbTx, event: unknown) {
      calls.push(`audit.record(${where(tx)})`);
      audits.push(clone(event));
      return Promise.resolve();
    },
  };

  /** The inbox: a notice is written in the transaction of the record it is about, or not at all (`F17`). */
  const notifications = {
    notifyInApp(tx: DbTx, input: InAppNotificationInput) {
      calls.push(`notifications.notifyInApp(${where(tx)}, ${input.recipientEmployeeId})`);
      notices.push(clone(input));

      return Promise.resolve(true);
    },
  };

  const runner = {
    async run<T>(work: (tx: DbTx) => Promise<T>): Promise<T> {
      calls.push('BEGIN');
      try {
        const result = await work(TX);
        calls.push('COMMIT');
        return result;
      } catch (error) {
        calls.push('ROLLBACK');
        throw error;
      }
    },
  };

  const rowValidation = new EmployeeImportRowValidationService(org as unknown as OrganizationApi);
  const preview = new EmployeeImportPreviewService(
    repo as unknown as EmployeeImportRepo,
    org as unknown as OrganizationApi,
    audit as unknown as AuditApi,
    runner as unknown as TransactionRunner,
    { openSeatHolders: () => Promise.resolve([]) } as unknown as LicensingSeatBaselineApi,
    rowValidation,
  );
  const confirmation = new EmployeeImportConfirmationService(
    repo as unknown as EmployeeImportRepo,
    org as unknown as OrganizationApi,
    audit as unknown as AuditApi,
    runner as unknown as TransactionRunner,
    notifications as unknown as NotificationsApi,
    rowValidation,
  );

  return {
    preview,
    confirmation,
    dir,
    calls,
    imports,
    storedRows,
    created,
    audits,
    lookups,
    locks,
    notices,
    reset() {
      calls.length = 0;
      created.length = 0;
      audits.length = 0;
      lookups.length = 0;
      locks.length = 0;
      notices.length = 0;
    },
    withoutOrganization() {
      organization = null;
    },
    failCreateWith(fail: (code: string) => Error | undefined) {
      failCreate = fail;
    },
    onLock(change: (record: ImportRecord) => void) {
      beforeLock = change;
    },
  };
}

export type ImportHarness = ReturnType<typeof harness>;

export const upload = (h: ImportHarness, text: string | Buffer, fileName = 'people.csv') =>
  h.preview.upload(ACTOR, { fileName, bytes: typeof text === 'string' ? Buffer.from(text, 'utf8') : text });

export const confirmBody = (
  overrides: Partial<{ previewVersion: number; idempotencyKey: string; hrBasis: typeof HR_BASIS }> = {},
) => ({
  previewVersion: 1,
  idempotencyKey: 'key-00000001',
  acknowledgeDuplicateFile: false,
  hrBasis: HR_BASIS,
  ...overrides,
});
