import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Page, pageOf } from '../../../core/application/pagination';
import { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import type { SeatTarget, SeatTargetRef } from '../../catalog/public/catalog.types';
import { AssignmentConflictError, SeatBaselineClosedError } from '../../licensing/public/licensing.errors';
import { LicensingSeatBaselineApi } from '../../licensing/public/licensing-seat-baseline.api';
import type { BaselineFacts, NewBaselineAssignment } from '../../licensing/public/licensing.types';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import {
  seatImportCancelledEvent,
  seatImportConfirmedEvent,
  seatImportUploadedEvent,
} from './seat-baseline-import-audit.mapper';
import {
  SeatImportAlreadyConfirmedError,
  SeatImportNotFoundError,
  SeatImportPreviewOutdatedError,
  SeatImportPreviewStaleError,
  SeatImportStateError,
} from './seat-baseline-import.errors';
import { ImportRecord, SeatBaselineImportRepo, StoredRow } from './seat-baseline-import.repo';
import type {
  SeatCells,
  SeatImportResult,
  SeatImportSummary,
  SeatImportTarget,
  SeatImportView,
  SeatRowOutcome,
  SeatRowResult,
} from './seat-baseline-import.types';
import { readSeatFile } from './seat-baseline-file.policy';
import { judgeSeatRows, lookupNamesOf, occupiedOn, sameJudgement, type SeatFacts } from './seat-baseline-rows.policy';

/** A preview that is not confirmed goes stale on its own after this long. */
export const PREVIEW_TTL_MS = 24 * 60 * 60 * 1000;

const targetOf = (target: SeatTarget): SeatImportTarget => ({
  kind: target.kind,
  subscriptionId: target.subscriptionId,
  planId: target.planId,
  planName: target.planName,
  applicationName: target.applicationName,
  provisioningType: target.provisioningType,
});

const refOf = (record: ImportRecord): SeatTargetRef =>
  record.subscriptionId ? { subscriptionId: record.subscriptionId } : { planId: record.planId };

/**
 * Importing the seat baseline from a file (`US-02-05`): upload reads the file into rows and judges each one against the
 * seats and the people as they are, without writing anything; the IT Admin looks at the preview; only a confirmation of the
 * preview that is still current creates the assignments, once, in one transaction. Each import is for one subscription
 * or one internal plan. The ordinary route to an assignment is a request (G5/G6): this is the one exception, for the
 * installation, and it ends when the baseline is closed.
 */
@Injectable()
export class SeatBaselineImportService {
  constructor(
    private readonly repo: SeatBaselineImportRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly licensingBaseline: LicensingSeatBaselineApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  // --- upload and preview -------------------------------------------------------------

  /**
   * Throws SeatImportFileInvalidError and the file errors, the target errors of licensing (SeatTargetInvalidError,
   * SeatTargetNotFoundError, SeatPlanNotSupportedError, SeatQuantityUnknownError) and SeatBaselineClosedError.
   */
  async upload(
    actor: AuthenticatedPrincipal,
    input: { fileName: string; bytes: Buffer; subscriptionId?: string; planId?: string },
  ): Promise<SeatImportView> {
    const organization = await this.requireOrganization();
    const { rows, ignored } = readSeatFile(input.bytes);
    const ref = this.licensingBaseline.seatTargetRef(input);
    const target = await this.licensingBaseline.resolveBaselineTarget(ref);
    const base = await this.licensingBaseline.baselineFacts(target);
    if (base.closed) throw new SeatBaselineClosedError();

    const judged = await this.evaluate(rows, base);
    const summary = this.summarize(judged, base);
    const contentHash = createHash('sha256').update(input.bytes).digest('hex');
    const fileName = input.fileName.slice(0, 255);

    const id = await this.runner.run(async (tx) => {
      const created = await this.repo.create(tx, {
        organizationId: organization.id,
        uploadedBy: actor.appUserId,
        fileName,
        contentHash,
        planId: target.planId,
        subscriptionId: target.subscriptionId,
        ignoredColumns: ignored,
        summary,
        expiresAt: new Date(Date.now() + PREVIEW_TTL_MS),
        rows: judged.map(({ lineNumber, cells, outcome, errors }) => ({ lineNumber, cells, outcome, errors })),
      });
      await this.audit.record(
        tx,
        seatImportUploadedEvent(organization.id, actor, created, { fileName, contentHash, summary }),
      );

      return created;
    });

    return this.view(id);
  }

  async view(id: string): Promise<SeatImportView> {
    const record = await this.repo.find(id);
    if (!record) throw new SeatImportNotFoundError();

    return this.toView(record);
  }

  async rows(
    id: string,
    query: { outcome?: SeatRowOutcome; page: number; pageSize: number },
  ): Promise<Page<StoredRow>> {
    if (!(await this.repo.find(id))) throw new SeatImportNotFoundError();
    const { items, total } = await this.repo.page(id, {
      ...(query.outcome ? { outcome: query.outcome } : {}),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return pageOf(items, total, query.page, query.pageSize);
  }

  /** Throws the preview away: nothing was written, and nothing will be. Cancelling twice is the same. */
  async cancel(actor: AuthenticatedPrincipal, id: string): Promise<SeatImportView> {
    const organization = await this.requireOrganization();

    await this.runner.run(async (tx) => {
      const current = await this.repo.lock(tx, id);
      if (!current) throw new SeatImportNotFoundError();
      if (current.status === 'CANCELLED') return;
      if (current.status === 'COMPLETED') throw new SeatImportStateError('NOT_PREVIEW');

      await this.repo.markCancelled(tx, id, new Date());
      await this.audit.record(tx, seatImportCancelledEvent(organization.id, actor, id));
    });

    return this.view(id);
  }

  // --- confirmation -------------------------------------------------------------------

  /**
   * Writes the assignments the preview promised, once. The import row is locked first, so two confirmations at the same
   * time meet one after the other: the second finds it written and gets the first one's result (the same key) or is
   * refused with it (another key). Then the subscription is locked `FOR UPDATE` and the baseline is held `FOR SHARE`, the
   * people and the Cost Centers `FOR SHARE`, and every row is judged again; if any row would now be judged differently the
   * preview is stale and nothing is written. Throws SeatBaselineClosedError when the baseline is closed.
   */
  async confirm(
    actor: AuthenticatedPrincipal,
    id: string,
    input: { previewVersion: number; idempotencyKey: string },
  ): Promise<{ import: SeatImportView; replayed: boolean }> {
    const organization = await this.requireOrganization();
    let replayed = false;

    await this.runner.run(async (tx) => {
      const current = await this.repo.lock(tx, id);
      if (!current) throw new SeatImportNotFoundError();

      if (current.status === 'COMPLETED') {
        if (current.confirmKey === input.idempotencyKey) {
          replayed = true;

          return;
        }
        throw new SeatImportAlreadyConfirmedError(current.result);
      }
      if (current.status === 'CANCELLED') throw new SeatImportStateError('CANCELLED');
      if (current.expiresAt <= new Date()) throw new SeatImportStateError('EXPIRED');
      if (current.previewVersion !== input.previewVersion)
        throw new SeatImportPreviewOutdatedError(current.previewVersion);

      const target = await this.licensingBaseline.lockBaselineTarget(tx, refOf(current));
      const base = await this.licensingBaseline.baselineFacts(target, tx);
      if (base.closed) throw new SeatBaselineClosedError();

      const stored = await this.repo.rows(tx, id);
      const facts = await this.lockedFacts(tx, stored, base);
      const fresh = judgeSeatRows(stored, facts);
      const changed = fresh.filter((row, index) => !sameJudgement(row, stored[index])).map((row) => row.lineNumber);
      if (changed.length > 0) throw new SeatImportPreviewStaleError(changed);

      const valid = fresh.filter((row) => row.outcome === 'VALID' && row.parsed);
      const rows: NewBaselineAssignment[] = valid.map((row) => ({ ...(row.parsed as NonNullable<typeof row.parsed>) }));
      try {
        await this.licensingBaseline.createBaselineAssignments(tx, actor, { importId: id, target, rows });
      } catch (error) {
        // The database refused a row the judgement accepted: someone wrote in between, so the preview is stale.
        if (error instanceof AssignmentConflictError)
          throw new SeatImportPreviewStaleError([valid[error.index].lineNumber]);
        throw error;
      }

      const result = this.resultOf(base, fresh);
      await this.repo.markCompleted(tx, id, { result, confirmKey: input.idempotencyKey, now: new Date() });
      await this.audit.record(
        tx,
        seatImportConfirmedEvent(organization.id, actor, id, { previewVersion: current.previewVersion, result }),
      );
    });

    return { import: await this.view(id), replayed };
  }

  // --- helpers ------------------------------------------------------------------------

  /** The facts a judgement stands on, with the people and the Cost Centers the rows name read now (in `tx` when given). */
  private async factsFor(rows: readonly { cells: SeatCells }[], base: BaselineFacts, tx?: DbTx): Promise<SeatFacts> {
    const names = lookupNamesOf(rows);
    const employees = await this.organizationReads.getEmployeesByCodes(names.employeeCodes, tx);
    const costCenters = await this.organizationReads.getCostCentersByCodes(names.costCenterCodes, tx);
    const companyDomains = await this.organizationReads.getCompanyEmailDomains(tx);
    // The department of each person on the day of the import and its Unit: a service account is owned and charged there.
    const units = await this.organizationReads.getOwningUnits(
      employees.map((employee) => employee.id),
      base.recordedOn,
      tx,
    );

    return {
      target: {
        kind: base.target.kind,
        purchasedQuantity: base.target.purchasedQuantity,
        ownerDepartmentId: base.target.ownerDepartmentId,
      },
      recordedOn: base.recordedOn,
      employees: new Map(
        employees.map((employee) => [
          employee.employeeCode,
          {
            id: employee.id,
            status: employee.status,
            employmentType: employee.employmentType,
            hireDate: employee.hireDate,
            owningUnit: units.get(employee.id) ?? null,
          },
        ]),
      ),
      costCenters: new Map(
        costCenters.map((costCenter) => [
          costCenter.code,
          { id: costCenter.id, kind: costCenter.kind, status: costCenter.status },
        ]),
      ),
      companyDomains,
      existing: base.existing,
    };
  }

  /** Reads the facts, holds the people and the Cost Centers they name `FOR SHARE` in id order, and reads them again. */
  private async lockedFacts(tx: DbTx, stored: readonly StoredRow[], base: BaselineFacts): Promise<SeatFacts> {
    const before = await this.factsFor(stored, base, tx);
    const names = lookupNamesOf(stored);
    const employeeIds = names.employeeCodes.flatMap((code) => before.employees.get(code)?.id ?? []).sort();
    for (const employeeId of employeeIds) await this.organizationReads.lockEmployeeForShare(tx, employeeId);
    // The Cost Centers the rows name and the Unit of each person's department, held so none is retired meanwhile.
    const costCenterIds = [
      ...names.costCenterCodes.flatMap((code) => before.costCenters.get(code)?.id ?? []),
      ...[...before.employees.values()].flatMap((employee) => employee.owningUnit?.costCenter?.id ?? []),
    ];
    await this.organizationReads.lockCostCentersShared(tx, [...new Set(costCenterIds)]);

    return this.factsFor(stored, base, tx);
  }

  private async evaluate(
    rows: readonly { lineNumber: number; cells: SeatCells }[],
    base: BaselineFacts,
  ): Promise<SeatRowResult[]> {
    return judgeSeatRows(rows, await this.factsFor(rows, base));
  }

  private summarize(rows: readonly SeatRowResult[], base: BaselineFacts): SeatImportSummary {
    const byCode: Record<string, number> = {};
    for (const row of rows) for (const error of row.errors) byCode[error.code] = (byCode[error.code] ?? 0) + 1;
    const valid = rows.filter((row) => row.outcome === 'VALID').length;
    const purchased = base.target.kind === 'SUBSCRIPTION' ? base.target.purchasedQuantity : null;
    const occupiedBefore = occupiedOn(
      base.existing.map((assignment) => ({ from: assignment.effectiveFrom, until: assignment.validUntil })),
      base.recordedOn,
    );

    return {
      target: targetOf(base.target),
      totalRows: rows.length,
      valid,
      errors: rows.length - valid,
      byCode,
      seats:
        purchased === null
          ? null
          : {
              purchased,
              occupiedBefore,
              freeBefore: Math.max(0, purchased - occupiedBefore),
              freeAfter: Math.max(0, purchased - occupiedBefore - valid),
            },
      recordedOn: base.recordedOn,
    };
  }

  private resultOf(base: BaselineFacts, fresh: readonly SeatRowResult[]): SeatImportResult {
    const created = fresh.filter((row) => row.outcome === 'VALID').length;
    const purchased = base.target.kind === 'SUBSCRIPTION' ? base.target.purchasedQuantity : null;
    if (purchased === null) return { created, errors: fresh.length - created, occupied: null, free: null };
    const occupied =
      occupiedOn(
        base.existing.map((assignment) => ({ from: assignment.effectiveFrom, until: assignment.validUntil })),
        base.recordedOn,
      ) + created;

    return { created, errors: fresh.length - created, occupied, free: Math.max(0, purchased - occupied) };
  }

  private toView(record: ImportRecord): SeatImportView {
    return {
      id: record.id,
      fileName: record.fileName,
      status: record.status,
      previewVersion: record.previewVersion,
      target: record.summary.target,
      ignoredColumns: record.ignoredColumns,
      summary: record.summary,
      result: record.result,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      confirmedAt: record.confirmedAt,
      cancelledAt: record.cancelledAt,
    };
  }

  private async requireOrganization() {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('A seat baseline was imported before installation');

    return organization;
  }
}
