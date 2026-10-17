import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { InvalidEmailError, normalizeEmail } from '../../core/email';
import { TransactionRunner } from '../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../audit/audit.service';
import { EmployeeCodeTakenError, EmployeeEmailTakenError } from '../organization/organization.errors';
import { displayJobTitleName, normalizeJobTitleName } from '../organization/job-title-name';
import { OrganizationService } from '../organization/organization.service';
import { CsvError, parseCsvRows } from './csv';
import {
  EMPLOYEE_COLUMNS,
  EmployeeColumn,
  EmployeeImportLookup,
  EmployeeRowClassifier,
  EmployeeRowOutcome,
  ExistingEmployee,
  mapEmployeeColumns,
} from './employee-import-rows';
import {
  ImportAlreadyConfirmedError,
  ImportDuplicateFileError,
  ImportFileInvalidError,
  ImportFileMissingColumnsError,
  ImportFileUnreadableError,
  ImportNotFoundError,
  ImportPreviewOutdatedError,
  ImportPreviewStaleError,
  ImportStateError,
} from './employee-import.errors';
import { EmployeeImportRepo, ImportRecord, LatestImport, StoredRow } from './employee-import.repo';

/** The people file is read whole, so it has a ceiling: more rows than this belong in several files. */
export const MAX_DATA_ROWS = 1000;
/** A preview that is not confirmed goes stale on its own after this long. */
export const PREVIEW_TTL_MS = 24 * 60 * 60 * 1000;

type Cells = Partial<Record<EmployeeColumn, string>>;

export interface ImportSummary {
  totalRows: number;
  valid: number;
  errors: number;
  existingSame: number;
  existingDifferent: number;
  /** The people the confirmation would create, by department. */
  newPeopleByDepartment: { departmentCode: string; count: number }[];
  /** Departments those people join that nobody heads yet (US-02-02 AC-1). */
  departmentsWithoutHead: { code: string; name: string }[];
  /** The same file, imported before (US-02-01 AC-4). */
  duplicateOf: { importId: string; fileName: string; confirmedAt: string } | null;
}

export interface ImportResult {
  created: number;
  existingSame: number;
  existingDifferent: number;
  errors: number;
  createdByDepartment: { departmentCode: string; count: number }[];
  departmentsWithoutHead: { code: string; name: string }[];
}

export interface ImportView {
  id: string;
  fileName: string;
  status: ImportRecord['status'];
  previewVersion: number;
  ignoredColumns: string[];
  summary: ImportSummary;
  result: ImportResult | null;
  createdAt: Date;
  expiresAt: Date;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
}

export interface Page<T> {
  items: T[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

const clean = (value: string | undefined): string => displayJobTitleName(value ?? '');

function safeNormalize(email: string): string | null {
  try {
    return normalizeEmail(email);
  } catch (error) {
    if (error instanceof InvalidEmailError) return null;
    throw error;
  }
}

function toLookup(data: Awaited<ReturnType<OrganizationService['lookupForEmployeeImport']>>): EmployeeImportLookup {
  return {
    departments: new Map(data.departments.map((row) => [row.code, row])),
    jobTitles: new Map(data.jobTitles.map((row) => [row.normalizedName, row])),
    existing: new Map<string, ExistingEmployee>(data.employees.map((row) => [row.employeeCode, row])),
    emailOwners: new Map(data.emailOwners.map((row) => [row.normalizedEmail, row.employeeCode])),
  };
}

/**
 * Importing people from a file (`US-02-01`, `US-02-02`, `US-02-03`): upload reads the file into rows and judges each
 * one without writing anything; the person looks at the preview; only a confirmation of the preview that is still
 * current creates the people, once, in one transaction. A row that is a person already there is never changed by
 * an import: it is reported as the same or as different. Importing creates no account, role or invitation.
 */
@Injectable()
export class EmployeeImportService {
  constructor(
    private readonly repo: EmployeeImportRepo,
    private readonly organization: OrganizationService,
    private readonly audit: AuditService,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * The latest people import that was not thrown away: its status and how many rows were wrong. The onboarding
   * checklist reads it to say whether the people file is done (US-02-04 AC-6).
   */
  async latestImport(): Promise<LatestImport | null> {
    return this.repo.findLatestKept((await this.requireOrganization()).id);
  }

  // --- upload and preview -------------------------------------------------------------

  async upload(actor: AuthenticatedPrincipal, file: { fileName: string; bytes: Buffer }): Promise<ImportView> {
    const organization = await this.requireOrganization();
    if (file.bytes.length === 0) throw new ImportFileInvalidError('FILE_EMPTY');
    if (file.bytes.includes(0)) throw new ImportFileInvalidError('FILE_NOT_TEXT');

    const contentHash = createHash('sha256').update(file.bytes).digest('hex');
    const { rows, ignored } = this.readFile(file.bytes.toString('utf8'));
    const evaluated = await this.evaluate(rows);
    const duplicate = await this.repo.findCompletedWithContent(organization.id, contentHash);
    const summary = await this.summarize(evaluated, duplicate);

    const id = await this.runner.run(async (tx) => {
      const created = await this.repo.create(tx, {
        organizationId: organization.id,
        uploadedBy: actor.appUserId,
        fileName: file.fileName.slice(0, 255),
        contentHash,
        ignoredColumns: ignored,
        summary,
        expiresAt: new Date(Date.now() + PREVIEW_TTL_MS),
        rows: evaluated,
      });
      await this.audit.record(tx, {
        organizationId: organization.id,
        actorKind: 'USER',
        actorAppUserId: actor.appUserId,
        actorRoles: actor.roles,
        action: 'EMPLOYEE_IMPORT.UPLOADED',
        resourceType: 'EmployeeImport',
        resourceId: created,
        before: null,
        after: {
          fileName: file.fileName.slice(0, 255),
          fileDigest: contentHash,
          rows: summary.totalRows,
          valid: summary.valid,
          errors: summary.errors,
        },
        correlationId: actor.sessionId,
      });

      return created;
    });

    return this.view(id);
  }

  async view(id: string): Promise<ImportView> {
    const record = await this.repo.find(id);
    if (!record) throw new ImportNotFoundError();

    return this.toView(record);
  }

  async rows(
    id: string,
    query: { outcome?: EmployeeRowOutcome; page: number; pageSize: number },
  ): Promise<Page<StoredRow>> {
    if (!(await this.repo.find(id))) throw new ImportNotFoundError();
    const { items, total } = await this.repo.page(id, {
      ...(query.outcome ? { outcome: query.outcome } : {}),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return {
      items,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems: total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }

  /**
   * Judges the same rows again against the data as it is now, under a higher preview version; the older version
   * can no longer be confirmed (`US-02-01` AC-10). The file is not uploaded again.
   */
  async refresh(id: string): Promise<ImportView> {
    const organization = await this.requireOrganization();
    const stored = await this.repo.find(id);
    if (!stored) throw new ImportNotFoundError();
    if (stored.status !== 'PREVIEW')
      throw new ImportStateError(stored.status === 'CANCELLED' ? 'CANCELLED' : 'NOT_PREVIEW');

    const evaluated = await this.evaluate(
      (await this.repo.rows(undefined, id)).map((row) => ({ lineNumber: row.lineNumber, cells: row.cells })),
    );
    const duplicate = await this.repo.findCompletedWithContent(organization.id, stored.contentHash);
    const summary = await this.summarize(evaluated, duplicate);

    await this.runner.run(async (tx) => {
      const current = await this.repo.lock(tx, id);
      if (!current) throw new ImportNotFoundError();
      if (current.status !== 'PREVIEW')
        throw new ImportStateError(current.status === 'CANCELLED' ? 'CANCELLED' : 'NOT_PREVIEW');
      await this.repo.replacePreview(tx, id, {
        rows: evaluated,
        summary,
        expiresAt: new Date(Date.now() + PREVIEW_TTL_MS),
      });
    });

    return this.view(id);
  }

  /** Throws the preview away: nothing was written, and nothing will be (AC-3). Cancelling twice is the same. */
  async cancel(actor: AuthenticatedPrincipal, id: string): Promise<ImportView> {
    const organization = await this.requireOrganization();

    await this.runner.run(async (tx) => {
      const current = await this.repo.lock(tx, id);
      if (!current) throw new ImportNotFoundError();
      if (current.status === 'CANCELLED') return;
      if (current.status === 'COMPLETED') throw new ImportStateError('NOT_PREVIEW');

      await this.repo.markCancelled(tx, id, new Date());
      await this.audit.record(tx, {
        organizationId: organization.id,
        actorKind: 'USER',
        actorAppUserId: actor.appUserId,
        actorRoles: actor.roles,
        action: 'EMPLOYEE_IMPORT.CANCELLED',
        resourceType: 'EmployeeImport',
        resourceId: id,
        before: { status: 'PREVIEW' },
        after: { status: 'CANCELLED' },
        correlationId: actor.sessionId,
      });
    });

    return this.view(id);
  }

  // --- confirmation -------------------------------------------------------------------

  /**
   * Writes the people the preview promised, once. The import row is locked first, so two confirmations at the same
   * time meet one after the other: the second finds it written and gets the first one's result (the same key) or is
   * refused with it (another key). Before writing, every row is judged again under the locks of the departments and
   * job titles it uses; if any row would now be judged differently the preview is stale and nothing is written.
   */
  async confirm(
    actor: AuthenticatedPrincipal,
    id: string,
    input: { previewVersion: number; idempotencyKey: string; acknowledgeDuplicateFile: boolean },
  ): Promise<{ import: ImportView; replayed: boolean }> {
    const organization = await this.requireOrganization();
    let replayed = false;

    await this.runner.run(async (tx) => {
      const current = await this.repo.lock(tx, id);
      if (!current) throw new ImportNotFoundError();

      if (current.status === 'COMPLETED') {
        if (current.confirmKey === input.idempotencyKey) {
          replayed = true;

          return;
        }
        throw new ImportAlreadyConfirmedError(current.result);
      }
      if (current.status === 'CANCELLED') throw new ImportStateError('CANCELLED');
      if (current.expiresAt <= new Date()) throw new ImportStateError('EXPIRED');
      if (current.previewVersion !== input.previewVersion) throw new ImportPreviewOutdatedError(current.previewVersion);

      const duplicate = await this.repo.findCompletedWithContent(organization.id, current.contentHash, tx);
      if (duplicate && !input.acknowledgeDuplicateFile) {
        throw new ImportDuplicateFileError({
          importId: duplicate.id,
          fileName: duplicate.fileName,
          confirmedAt: duplicate.confirmedAt,
        });
      }

      const stored = await this.repo.rows(tx, id);
      const cells = stored.map((row) => ({ lineNumber: row.lineNumber, cells: row.cells }));
      // Lock what the valid rows will rely on, then judge every row again on what the locks protect.
      const before = await this.lookup(cells, tx);
      const wanted = this.idsUsedByValidRows(stored, before);
      await this.organization.lockForEmployeeImport(tx, wanted.departmentIds, wanted.jobTitleIds);
      const fresh = this.judge(cells, await this.lookup(cells, tx));
      const changed = fresh.filter((row, index) => !sameJudgement(row, stored[index])).map((row) => row.lineNumber);
      if (changed.length > 0) throw new ImportPreviewStaleError(changed);

      const today = await this.organization.businessToday();
      const createdByDepartment = new Map<string, number>();
      for (const row of fresh) {
        if (row.outcome !== 'VALID' || !row.parsed) continue;
        try {
          await this.organization.createEmployeeWithPlacement(tx, {
            organizationId: organization.id,
            employeeCode: row.parsed.employeeCode,
            fullName: row.parsed.fullName,
            workEmail: row.parsed.workEmail,
            employmentType: row.parsed.employmentType,
            hireDate: row.parsed.hireDate,
            memberSince: today,
            departmentId: row.parsed.departmentId,
            jobTitleId: row.parsed.jobTitleId,
          });
        } catch (error) {
          // Someone entered the same code or email between the judgement and the write: the preview is stale.
          if (error instanceof EmployeeCodeTakenError || error instanceof EmployeeEmailTakenError) {
            throw new ImportPreviewStaleError([row.lineNumber]);
          }
          throw error;
        }
        createdByDepartment.set(
          row.parsed.departmentCode,
          (createdByDepartment.get(row.parsed.departmentCode) ?? 0) + 1,
        );
      }

      const result: ImportResult = {
        created: [...createdByDepartment.values()].reduce((sum, count) => sum + count, 0),
        existingSame: fresh.filter((row) => row.outcome === 'EXISTS_SAME').length,
        existingDifferent: fresh.filter((row) => row.outcome === 'EXISTS_DIFFERENT').length,
        errors: fresh.filter((row) => row.outcome === 'ERROR').length,
        createdByDepartment: [...createdByDepartment].map(([departmentCode, count]) => ({ departmentCode, count })),
        departmentsWithoutHead: await this.withoutHead(before, [...createdByDepartment.keys()]),
      };
      await this.repo.markCompleted(tx, id, { result, confirmKey: input.idempotencyKey, now: new Date() });
      await this.audit.record(tx, {
        organizationId: organization.id,
        actorKind: 'USER',
        actorAppUserId: actor.appUserId,
        actorRoles: actor.roles,
        action: 'EMPLOYEE_IMPORT.CONFIRMED',
        resourceType: 'EmployeeImport',
        resourceId: id,
        before: { status: 'PREVIEW', previewVersion: current.previewVersion },
        after: {
          status: 'COMPLETED',
          created: result.created,
          existingSame: result.existingSame,
          existingDifferent: result.existingDifferent,
          errors: result.errors,
          repeatedFile: duplicate !== null,
        },
        correlationId: actor.sessionId,
      });
    });

    return { import: await this.view(id), replayed };
  }

  // --- helpers ------------------------------------------------------------------------

  /** Reads the file into rows of named cells, or throws why it cannot be used as a whole. */
  private readFile(text: string): { rows: { lineNumber: number; cells: Cells }[]; ignored: string[] } {
    let table;
    try {
      table = parseCsvRows(text, { maxRows: MAX_DATA_ROWS + 1 });
    } catch (error) {
      if (error instanceof CsvError) {
        if (error.reason === 'TOO_MANY_ROWS') {
          throw new ImportFileInvalidError('FILE_TOO_MANY_ROWS', { maxRows: MAX_DATA_ROWS });
        }
        throw new ImportFileUnreadableError(error.reason, error.row);
      }
      throw error;
    }
    if (table.length === 0) throw new ImportFileInvalidError('FILE_EMPTY');

    const [header, ...data] = table;
    const columns = mapEmployeeColumns(header.cells);
    if (columns.missing.length > 0) throw new ImportFileMissingColumnsError(columns.missing);
    if (data.length === 0) throw new ImportFileInvalidError('FILE_EMPTY');

    return {
      ignored: columns.ignored,
      rows: data.map((row) => ({
        lineNumber: row.line,
        cells: Object.fromEntries(
          EMPLOYEE_COLUMNS.flatMap((column) => {
            const index = columns.indexOf[column];

            return index === undefined ? [] : [[column, row.cells[index] ?? '']];
          }),
        ),
      })),
    };
  }

  private async lookup(rows: { cells: Cells }[], tx?: Parameters<OrganizationService['lookupForEmployeeImport']>[1]) {
    const cells = rows.map((row) => row.cells);
    const unique = (values: string[]) => [...new Set(values.filter((value) => value !== ''))];

    return toLookup(
      await this.organization.lookupForEmployeeImport(
        {
          departmentCodes: unique(cells.map((cell) => clean(cell.department_code))),
          normalizedJobTitleNames: unique(cells.map((cell) => normalizeJobTitleName(clean(cell.job_title)))),
          employeeCodes: unique(cells.map((cell) => clean(cell.employee_code))),
          normalizedEmails: unique(cells.map((cell) => safeNormalize(clean(cell.work_email)) ?? '')),
        },
        tx,
      ),
    );
  }

  private judge(rows: { lineNumber: number; cells: Cells }[], lookup: EmployeeImportLookup) {
    const classifier = new EmployeeRowClassifier(lookup);

    return rows.map((row) => ({ lineNumber: row.lineNumber, cells: row.cells, ...classifier.classify(row.cells) }));
  }

  private async evaluate(rows: { lineNumber: number; cells: Cells }[]): Promise<(StoredRow & { parsed?: unknown })[]> {
    return this.judge(rows, await this.lookup(rows)).map((row) => ({
      lineNumber: row.lineNumber,
      cells: row.cells,
      outcome: row.outcome,
      errors: row.errors,
      differences: row.differences ?? null,
    }));
  }

  private idsUsedByValidRows(stored: StoredRow[], lookup: EmployeeImportLookup) {
    const departmentIds = new Set<string>();
    const jobTitleIds = new Set<string>();
    for (const row of stored) {
      if (row.outcome !== 'VALID') continue;
      const department = lookup.departments.get(clean(row.cells.department_code));
      const title = lookup.jobTitles.get(normalizeJobTitleName(clean(row.cells.job_title)));
      if (department) departmentIds.add(department.id);
      if (title) jobTitleIds.add(title.id);
    }

    return { departmentIds: [...departmentIds], jobTitleIds: [...jobTitleIds] };
  }

  private async summarize(
    rows: StoredRow[],
    duplicate: { id: string; fileName: string; confirmedAt: Date } | null,
  ): Promise<ImportSummary> {
    const lookup = await this.lookup(rows);
    const byDepartment = new Map<string, number>();
    for (const row of rows) {
      if (row.outcome !== 'VALID') continue;
      const code = clean(row.cells.department_code);
      byDepartment.set(code, (byDepartment.get(code) ?? 0) + 1);
    }

    return {
      totalRows: rows.length,
      valid: rows.filter((row) => row.outcome === 'VALID').length,
      errors: rows.filter((row) => row.outcome === 'ERROR').length,
      existingSame: rows.filter((row) => row.outcome === 'EXISTS_SAME').length,
      existingDifferent: rows.filter((row) => row.outcome === 'EXISTS_DIFFERENT').length,
      newPeopleByDepartment: [...byDepartment].map(([departmentCode, count]) => ({ departmentCode, count })),
      departmentsWithoutHead: await this.withoutHead(lookup, [...byDepartment.keys()]),
      duplicateOf: duplicate
        ? { importId: duplicate.id, fileName: duplicate.fileName, confirmedAt: duplicate.confirmedAt.toISOString() }
        : null,
    };
  }

  private async withoutHead(lookup: EmployeeImportLookup, departmentCodes: string[]) {
    const ids = departmentCodes.flatMap((code) => {
      const department = lookup.departments.get(code);

      return department ? [department.id] : [];
    });
    const without = await this.organization.departmentsWithoutHead(ids);

    return without.map((department) => ({ code: department.code, name: department.name }));
  }

  private toView(record: ImportRecord): ImportView {
    return {
      id: record.id,
      fileName: record.fileName,
      status: record.status,
      previewVersion: record.previewVersion,
      ignoredColumns: record.ignoredColumns,
      summary: record.summary as ImportSummary,
      result: (record.result ?? null) as ImportResult | null,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      confirmedAt: record.confirmedAt,
      cancelledAt: record.cancelledAt,
    };
  }

  private async requireOrganization() {
    const organization = await this.organization.getOrganization();
    if (!organization) throw new Error('A people file was imported before installation');

    return organization;
  }
}

/** The same text for the same data whatever order the keys came in: PostgreSQL stores `jsonb` with its own key order. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonical(nested)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value) ?? 'null';
}

/** Whether a row is judged the same way now as in the preview: same outcome, same reasons, same differences. */
function sameJudgement(
  fresh: { outcome: EmployeeRowOutcome; errors: unknown; differences?: unknown },
  stored: StoredRow,
): boolean {
  return (
    fresh.outcome === stored.outcome &&
    canonical(fresh.errors) === canonical(stored.errors) &&
    canonical(fresh.differences ?? null) === canonical(stored.differences)
  );
}
