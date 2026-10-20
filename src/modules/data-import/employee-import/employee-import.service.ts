import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Page, pageOf } from '../../../core/application/pagination';
import { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { EmployeeCodeTakenError, EmployeeEmailTakenError } from '../../organization/organization.errors';
import { LicensingService } from '../../licensing/licensing.service';
import { OrganizationService } from '../../organization/organization.service';
import { importCancelledEvent, importConfirmedEvent, importUploadedEvent } from './employee-import-audit';
import { EmployeeFileRow, readEmployeeFile } from './employee-import-file';
import {
  EmployeeCells,
  EmployeeImportLookup,
  EmployeeRowOutcome,
  EmployeeRowResult,
  clean,
  idsUsedByValidRows,
  judgeEmployeeRows,
  lookupNamesOf,
  sameJudgement,
  toEmployeeImportLookup,
} from './employee-import-rows';
import {
  ImportAlreadyConfirmedError,
  ImportDuplicateFileError,
  ImportNotFoundError,
  ImportPreviewOutdatedError,
  ImportPreviewStaleError,
  ImportStateError,
} from './employee-import.errors';
import { EmployeeImportRepo, ImportRecord, LatestImport, StoredRow } from './employee-import.repo';
import { ImportResult, ImportSummary, ImportView } from './employee-import.types';

/** A preview that is not confirmed goes stale on its own after this long. */
export const PREVIEW_TTL_MS = 24 * 60 * 60 * 1000;

type JudgedRow = { lineNumber: number; cells: EmployeeCells } & EmployeeRowResult;

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
    private readonly licensing: LicensingService,
  ) {}

  /**
   * The latest people import that was not thrown away: its status and how many rows were wrong. The onboarding
   * checklist reads it, through the module facade, to say whether the people file is done (US-02-04 AC-6).
   */
  async latestImport(): Promise<LatestImport | null> {
    return this.repo.findLatestKept((await this.requireOrganization()).id);
  }

  // --- upload and preview -------------------------------------------------------------

  async upload(actor: AuthenticatedPrincipal, file: { fileName: string; bytes: Buffer }): Promise<ImportView> {
    const organization = await this.requireOrganization();
    const { rows, ignored } = readEmployeeFile(file.bytes);
    const contentHash = createHash('sha256').update(file.bytes).digest('hex');
    const evaluated = await this.evaluate(rows);
    const duplicate = await this.repo.findCompletedWithContent(organization.id, contentHash);
    const summary = await this.summarize(evaluated, duplicate);
    const fileName = file.fileName.slice(0, 255);

    const id = await this.runner.run(async (tx) => {
      const created = await this.repo.create(tx, {
        organizationId: organization.id,
        uploadedBy: actor.appUserId,
        fileName,
        contentHash,
        ignoredColumns: ignored,
        summary,
        expiresAt: new Date(Date.now() + PREVIEW_TTL_MS),
        rows: evaluated,
      });
      await this.audit.record(
        tx,
        importUploadedEvent(organization.id, actor, created, { fileName, contentHash, summary }),
      );

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

    return pageOf(items, total, query.page, query.pageSize);
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
      await this.audit.record(tx, importCancelledEvent(organization.id, actor, id));
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

      const { fresh, before } = await this.judgeAgainUnderLocks(tx, id);
      const createdByDepartment = await this.writeValidRows(tx, organization.id, fresh);

      const result: ImportResult = {
        created: [...createdByDepartment.values()].reduce((sum, count) => sum + count, 0),
        existingSame: fresh.filter((row) => row.outcome === 'EXISTS_SAME').length,
        existingDifferent: fresh.filter((row) => row.outcome === 'EXISTS_DIFFERENT').length,
        errors: fresh.filter((row) => row.outcome === 'ERROR').length,
        createdByDepartment: [...createdByDepartment].map(([departmentCode, count]) => ({ departmentCode, count })),
        departmentsWithoutHead: await this.withoutHead(before, [...createdByDepartment.keys()]),
      };
      await this.repo.markCompleted(tx, id, { result, confirmKey: input.idempotencyKey, now: new Date() });
      await this.audit.record(
        tx,
        importConfirmedEvent(organization.id, actor, id, {
          previewVersion: current.previewVersion,
          result,
          repeatedFile: duplicate !== null,
        }),
      );
    });

    return { import: await this.view(id), replayed };
  }

  /**
   * Locks what the valid rows of the stored preview rely on, then judges every row again on what the locks protect.
   * Throws the lines whose judgement changed: the preview is stale.
   */
  private async judgeAgainUnderLocks(tx: DbTx, id: string) {
    const stored = await this.repo.rows(tx, id);
    const cells = stored.map((row) => ({ lineNumber: row.lineNumber, cells: row.cells }));
    const before = await this.lookup(cells, tx);
    const wanted = idsUsedByValidRows(stored, before);
    await this.organization.lockForEmployeeImport(tx, wanted.departmentIds, wanted.jobTitleIds);
    const fresh = judgeEmployeeRows(cells, await this.lookup(cells, tx));
    const changed = fresh.filter((row, index) => !sameJudgement(row, stored[index])).map((row) => row.lineNumber);
    if (changed.length > 0) throw new ImportPreviewStaleError(changed);

    return { fresh, before };
  }

  /** Creates the people of the valid rows, members from today, and counts them by department code in file order. */
  private async writeValidRows(tx: DbTx, organizationId: string, fresh: JudgedRow[]): Promise<Map<string, number>> {
    const today = await this.organization.businessToday();
    const createdByDepartment = new Map<string, number>();
    for (const row of fresh) {
      if (row.outcome !== 'VALID' || !row.parsed) continue;
      try {
        await this.organization.createEmployeeWithPlacement(tx, {
          organizationId,
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
      createdByDepartment.set(row.parsed.departmentCode, (createdByDepartment.get(row.parsed.departmentCode) ?? 0) + 1);
    }

    return createdByDepartment;
  }

  // --- helpers ------------------------------------------------------------------------

  private async lookup(rows: readonly { cells: EmployeeCells }[], tx?: DbTx): Promise<EmployeeImportLookup> {
    return toEmployeeImportLookup(await this.organization.lookupForEmployeeImport(lookupNamesOf(rows), tx));
  }

  /** Every row judged against the data as it is now, kept as the preview stores it. */
  private async evaluate(rows: EmployeeFileRow[]): Promise<StoredRow[]> {
    return judgeEmployeeRows(rows, await this.lookup(rows)).map((row) => ({
      lineNumber: row.lineNumber,
      cells: row.cells,
      outcome: row.outcome,
      errors: row.errors,
      differences: row.differences ?? null,
    }));
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
      reviewQueue: await this.reviewQueue(rows),
      duplicateOf: duplicate
        ? { importId: duplicate.id, fileName: duplicate.fileName, confirmedAt: duplicate.confirmedAt.toISOString() }
        : null,
    };
  }

  /** The people who hold a seat, still work here and are not in the file (`US-02-02` AC-4), by code, at most 200. */
  private async reviewQueue(rows: readonly { cells: EmployeeCells }[]): Promise<ImportSummary['reviewQueue']> {
    const inFile = new Set(rows.map((row) => clean(row.cells.employee_code)));
    const holders = await this.licensing.openSeatHolders();
    if (holders.length === 0) return { total: 0, items: [] };
    const seats = new Map(holders.map((holder) => [holder.employeeId, holder.seats]));
    const people = await this.organization.getEmployees([...seats.keys()]);
    const queue = people
      .filter((person) => person.status === 'ACTIVE' && !inFile.has(person.employeeCode))
      .map((person) => ({
        employeeCode: person.employeeCode,
        fullName: person.fullName,
        seats: seats.get(person.id) ?? 0,
      }))
      .sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));

    return { total: queue.length, items: queue.slice(0, 200) };
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
      // A preview kept before the review queue existed has none.
      summary: {
        ...(record.summary as ImportSummary),
        reviewQueue: (record.summary as Partial<ImportSummary>).reviewQueue ?? { total: 0, items: [] },
      },
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
