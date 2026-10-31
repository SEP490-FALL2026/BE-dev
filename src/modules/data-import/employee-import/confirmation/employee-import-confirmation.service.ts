import { Injectable } from '@nestjs/common';
import type { HrBasis } from '../../../organization/public/hr-basis.types';
import { DbTx, TransactionRunner } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../../audit/public/audit.api';
import { NotificationsApi } from '../../../notifications/public/notifications.api';
import { EmployeeCodeTakenError, EmployeeEmailTakenError } from '../../../organization/public/organization.errors';
import { OrganizationApi } from '../../../organization/public/organization.api';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import { importConfirmedEvent, importEmployeeCreatedEvent } from '../employee-import-audit.mapper';
import type { EmployeeCells } from '../employee-import-row.types';
import { outcomeCounts, toImportView } from '../employee-import-view.mapper';
import {
  ImportAlreadyConfirmedError,
  ImportDuplicateFileError,
  ImportNotFoundError,
  ImportPreviewOutdatedError,
  ImportPreviewStaleError,
  ImportStateError,
} from '../employee-import.errors';
import { assertMayImportEmployees } from '../employee-import.policy';
import { EmployeeImportRepo } from '../employee-import.repo';
import { ImportResult, ImportView } from '../employee-import.types';
import {
  EmployeeRowResult,
  idsUsedByValidRows,
  judgeEmployeeRows,
  sameJudgement,
} from '../row-validation/employee-import-row-validation.policy';
import {
  EmployeeImportRowValidationService,
  OwnRecord,
} from '../row-validation/employee-import-row-validation.service';

type JudgedRow = { lineNumber: number; cells: EmployeeCells } & EmployeeRowResult;

/**
 * Confirming a people preview (`US-02-01`, `US-02-02`, `US-02-03`): only a confirmation of the preview that is still current
 * creates the people, once, in one transaction. A row that is a person already there is never changed by an import: it is
 * reported as the same or as different. Importing creates no account, role or invitation, and tells, for each person created,
 * the head of their department and the IT Admin in charge, in the same transaction (`US-02-02` AC-17). Only the Super
 * Admin imports people: `employee-import.policy.ts` says so first.
 */
@Injectable()
export class EmployeeImportConfirmationService {
  constructor(
    private readonly repo: EmployeeImportRepo,
    private readonly organization: OrganizationApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
    private readonly notifications: NotificationsApi,
    private readonly rowValidation: EmployeeImportRowValidationService,
  ) {}

  /**
   * Writes the people the preview promised, once. The import row is locked first, so two confirmations at the same
   * time meet one after the other: the second finds it written and gets the first one's result (the same key) or is
   * refused with it (another key). Before writing, every row is judged again under the locks of the departments and
   * job titles it uses; if any row would now be judged differently the preview is stale and nothing is written.
   */
  async confirm(
    actor: AuthenticatedPrincipal,
    id: string,
    input: { previewVersion: number; idempotencyKey: string; acknowledgeDuplicateFile: boolean; hrBasis: HrBasis },
  ): Promise<{ import: ImportView; replayed: boolean }> {
    assertMayImportEmployees(actor.roles);
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

      const own = await this.rowValidation.ownRecord(actor.employeeId, tx);
      const { fresh, before } = await this.judgeAgainUnderLocks(tx, id, own);
      const createdByDepartment = await this.writeValidRows(tx, organization.id, fresh, {
        actor,
        importId: id,
        hrBasis: input.hrBasis,
      });

      const { existingSame, existingDifferent, errors } = outcomeCounts(fresh);
      const result: ImportResult = {
        created: [...createdByDepartment.values()].reduce((sum, count) => sum + count, 0),
        existingSame,
        existingDifferent,
        errors,
        createdByDepartment: [...createdByDepartment].map(([departmentCode, count]) => ({ departmentCode, count })),
        departmentsWithoutHead: await this.rowValidation.departmentsWithoutHead(before, [
          ...createdByDepartment.keys(),
        ]),
      };
      await this.repo.markCompleted(tx, id, { result, confirmKey: input.idempotencyKey, now: new Date() });
      await this.audit.record(
        tx,
        importConfirmedEvent(organization.id, actor, id, {
          previewVersion: current.previewVersion,
          result,
          repeatedFile: duplicate !== null,
          hrBasis: input.hrBasis,
        }),
      );
    });

    return { import: await this.read(id), replayed };
  }

  /**
   * Locks what the valid rows of the stored preview rely on, then judges every row again on what the locks protect.
   * Throws the lines whose judgement changed: the preview is stale.
   */
  private async judgeAgainUnderLocks(tx: DbTx, id: string, own: OwnRecord) {
    const stored = await this.repo.rows(tx, id);
    const cells = stored.map((row) => ({ lineNumber: row.lineNumber, cells: row.cells }));
    const before = await this.rowValidation.lookup(cells, own, tx);
    const wanted = idsUsedByValidRows(stored, before);
    await this.organizationReads.lockForEmployeeImport(tx, wanted.departmentIds);
    const fresh = judgeEmployeeRows(cells, await this.rowValidation.lookup(cells, own, tx));
    const changed = fresh.filter((row, index) => !sameJudgement(row, stored[index])).map((row) => row.lineNumber);
    if (changed.length > 0) throw new ImportPreviewStaleError(changed);

    return { fresh, before };
  }

  /** Creates the people of the valid rows, members from today, and counts them by department code in file order. */
  private async writeValidRows(
    tx: DbTx,
    organizationId: string,
    fresh: JudgedRow[],
    on: { actor: AuthenticatedPrincipal; importId: string; hrBasis: HrBasis },
  ): Promise<Map<string, number>> {
    const today = await this.organizationReads.businessToday();
    const createdByDepartment = new Map<string, number>();
    for (const row of fresh) {
      if (row.outcome !== 'VALID' || !row.parsed) continue;
      try {
        const { id: employeeId } = await this.organization.createEmployeeWithPlacement(tx, {
          organizationId,
          employeeCode: row.parsed.employeeCode,
          fullName: row.parsed.fullName,
          workEmail: row.parsed.workEmail,
          employmentType: row.parsed.employmentType,
          hireDate: row.parsed.hireDate,
          memberSince: today,
          departmentId: row.parsed.departmentId,
          jobTitle: row.parsed.jobTitleName,
        });
        await this.audit.record(
          tx,
          importEmployeeCreatedEvent(organizationId, on.actor, employeeId, {
            importId: on.importId,
            employeeCode: row.parsed.employeeCode,
            department: row.parsed.departmentCode,
            jobTitle: row.parsed.jobTitleName,
            hrBasis: on.hrBasis,
          }),
        );
        const notices = await this.organizationReads.getProfileNotices(tx, {
          kind: 'CREATED',
          organizationId,
          employeeId,
          onDate: today,
        });
        for (const notice of notices) await this.notifications.notifyInApp(tx, notice);
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

  private async read(id: string): Promise<ImportView> {
    const record = await this.repo.find(id);
    if (!record) throw new ImportNotFoundError();

    return toImportView(record);
  }

  private async requireOrganization() {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('A people file was imported before installation');

    return organization;
  }
}
