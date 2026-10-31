import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Page, pageOf } from '../../../../core/application/pagination';
import { TransactionRunner } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../../audit/public/audit.api';
import { LicensingSeatBaselineApi } from '../../../licensing/public/licensing-seat-baseline.api';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import { importCancelledEvent, importUploadedEvent } from '../employee-import-audit.mapper';
import type { EmployeeRowOutcome } from '../employee-import-row.types';
import { outcomeCounts, toImportView } from '../employee-import-view.mapper';
import { ImportNotFoundError, ImportStateError } from '../employee-import.errors';
import { assertMayImportEmployees } from '../employee-import.policy';
import { EmployeeImportRepo, LatestImport, StoredRow } from '../employee-import.repo';
import { ImportSummary, ImportView } from '../employee-import.types';
import { clean } from '../row-validation/employee-import-row-validation.policy';
import { EmployeeImportRowValidationService } from '../row-validation/employee-import-row-validation.service';
import { readEmployeeFile } from './employee-import-file.policy';
import { reviewQueueOf } from './employee-import-review-queue.service';

/** A preview that is not confirmed goes stale on its own after this long. */
export const PREVIEW_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * The preview of a people file (`US-02-01`, `US-02-02`): upload reads the file into rows and judges each one without writing
 * anything but the preview; the person looks at it, may judge it again against the data as it is now, or throw it away. Writing
 * the people is the confirmation (`../confirmation/`). Only the Super Admin imports people: `employee-import.policy.ts` says
 * so first in every use case.
 */
@Injectable()
export class EmployeeImportPreviewService {
  constructor(
    private readonly repo: EmployeeImportRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
    private readonly licensing: LicensingSeatBaselineApi,
    private readonly rowValidation: EmployeeImportRowValidationService,
  ) {}

  /**
   * The latest people import that was not thrown away: its status and how many rows were wrong. The onboarding
   * checklist reads it, through the module facade, to say whether the people file is done (US-02-04 AC-6).
   */
  async latestImport(): Promise<LatestImport | null> {
    return this.repo.findLatestKept((await this.requireOrganization()).id);
  }

  async upload(actor: AuthenticatedPrincipal, file: { fileName: string; bytes: Buffer }): Promise<ImportView> {
    assertMayImportEmployees(actor.roles);
    const organization = await this.requireOrganization();
    const { rows, ignored } = readEmployeeFile(file.bytes);
    const contentHash = createHash('sha256').update(file.bytes).digest('hex');
    const evaluated = await this.rowValidation.judge(rows, await this.rowValidation.ownRecord(actor.employeeId));
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

    return this.read(id);
  }

  /** One import as it stands. Throws ImportForbiddenError or ImportNotFoundError. */
  async view(actor: AuthenticatedPrincipal, id: string): Promise<ImportView> {
    assertMayImportEmployees(actor.roles);

    return this.read(id);
  }

  private async read(id: string): Promise<ImportView> {
    const record = await this.repo.find(id);
    if (!record) throw new ImportNotFoundError();

    return toImportView(record);
  }

  async rows(
    actor: AuthenticatedPrincipal,
    id: string,
    query: { outcome?: EmployeeRowOutcome; page: number; pageSize: number },
  ): Promise<Page<StoredRow>> {
    assertMayImportEmployees(actor.roles);
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
  async refresh(actor: AuthenticatedPrincipal, id: string): Promise<ImportView> {
    assertMayImportEmployees(actor.roles);
    const organization = await this.requireOrganization();
    const stored = await this.repo.find(id);
    if (!stored) throw new ImportNotFoundError();
    if (stored.status !== 'PREVIEW')
      throw new ImportStateError(stored.status === 'CANCELLED' ? 'CANCELLED' : 'NOT_PREVIEW');

    const evaluated = await this.rowValidation.judge(
      (await this.repo.rows(undefined, id)).map((row) => ({ lineNumber: row.lineNumber, cells: row.cells })),
      await this.rowValidation.ownRecord(actor.employeeId),
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

    return this.read(id);
  }

  /** Throws the preview away: nothing was written, and nothing will be (AC-3). Cancelling twice is the same. */
  async cancel(actor: AuthenticatedPrincipal, id: string): Promise<ImportView> {
    assertMayImportEmployees(actor.roles);
    const organization = await this.requireOrganization();

    await this.runner.run(async (tx) => {
      const current = await this.repo.lock(tx, id);
      if (!current) throw new ImportNotFoundError();
      if (current.status === 'CANCELLED') return;
      if (current.status === 'COMPLETED') throw new ImportStateError('NOT_PREVIEW');

      await this.repo.markCancelled(tx, id, new Date());
      await this.audit.record(tx, importCancelledEvent(organization.id, actor, id));
    });

    return this.read(id);
  }

  private async summarize(
    rows: StoredRow[],
    duplicate: { id: string; fileName: string; confirmedAt: Date } | null,
  ): Promise<ImportSummary> {
    const lookup = await this.rowValidation.lookup(rows);
    const byDepartment = new Map<string, number>();
    for (const row of rows) {
      if (row.outcome !== 'VALID') continue;
      const code = clean(row.cells.department_code);
      byDepartment.set(code, (byDepartment.get(code) ?? 0) + 1);
    }

    return {
      totalRows: rows.length,
      ...outcomeCounts(rows),
      newPeopleByDepartment: [...byDepartment].map(([departmentCode, count]) => ({ departmentCode, count })),
      departmentsWithoutHead: await this.rowValidation.departmentsWithoutHead(lookup, [...byDepartment.keys()]),
      reviewQueue: await reviewQueueOf(this.licensing, this.organizationReads, rows),
      duplicateOf: duplicate
        ? { importId: duplicate.id, fileName: duplicate.fileName, confirmedAt: duplicate.confirmedAt.toISOString() }
        : null,
    };
  }

  private async requireOrganization() {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('A people file was imported before installation');

    return organization;
  }
}
