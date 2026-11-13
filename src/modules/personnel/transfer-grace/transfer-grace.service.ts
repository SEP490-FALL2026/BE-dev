import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { PersonnelNotifier } from '../event-notice/personnel-notifier.service';
import { personnelSystemAuditEvent } from '../personnel-audit-event.mapper';
import { TransferEffectsService } from './transfer-effects.service';
import { TransferGraceRepo } from './transfer-grace.repo';
import { graceOf, graceStartsOn, graceWindowEnd } from './transfer-grace.policy';
import type { GraceOpened, GraceTransferFacts } from './transfer-grace.types';

/**
 * The day a transfer takes effect, the system opens the grace of the old rights (`QĐ-110p`, SPEC MF3-B.4), in the transaction of the
 * transfer: the last day of the grace and the day of the reminder are kept on the transfer, the paid requests of the old department are closed
 * and the money held for the old rights goes back to its budget ({@link TransferEffectsService}), the picture of the rights before is kept, the
 * Audit Trail says so, and the person, the heads of the two departments and the IT Admin of each are told with the last day of the grace.
 * Nothing is revoked: the sweeper of MF3-C does it when the grace ends. Idempotent: the first statement asks for a transfer with no grace, so
 * whoever sees the day first (the placement, the hourly pass, the next write for the person) opens it and the others find it open and do nothing.
 */
@Injectable()
export class TransferGraceService {
  constructor(
    private readonly effects: TransferEffectsService,
    private readonly graces: TransferGraceRepo,
    private readonly parameters: OperatingParametersApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly notifier: PersonnelNotifier,
  ) {}

  /** Returns what it did, or null when the grace was open already. */
  async open(tx: DbTx, transfer: GraceTransferFacts, now: Date = new Date()): Promise<GraceOpened | null> {
    const today = await this.organizationReads.businessToday(now, tx);
    const startsOn = graceStartsOn(transfer.effectiveOn, today);
    const grace = graceOf({
      effectiveOn: transfer.effectiveOn,
      notedOn: today,
      workingDays: Number(await this.parameters.getValue('TRANSFER_GRACE_WORKING_DAYS')),
      reminderWorkingDays: Number(await this.parameters.getValue('TRANSFER_GRACE_REMINDER_WORKING_DAYS')),
      nonWorkingDates: await this.parameters.getNonWorkingDates(startsOn, graceWindowEnd(startsOn)),
    });
    if (!(await this.graces.claim(tx, transfer.id, { endsOn: grace.endsOn, reminderOn: grace.reminderOn })))
      return null;
    const snapshot = await this.effects.apply(tx, transfer, today, now);
    await this.graces.keepSnapshot(tx, transfer.id, snapshot);
    await this.audit.record(
      tx,
      personnelSystemAuditEvent(
        transfer.organizationId,
        'DEPARTMENT_TRANSFER.GRACE_OPENED',
        'DepartmentTransfer',
        transfer.id,
        `transfer-grace:${transfer.id}`,
        { graceEndsOn: null },
        {
          graceEndsOn: grace.endsOn,
          graceReminderOn: grace.reminderOn,
          rights: snapshot.rights.length,
          requestsCancelled: snapshot.requestsCancelled,
          requestsToCheck: snapshot.requestsToCheck,
        },
      ),
    );
    await this.notifier.transferGraceStarted(tx, {
      organizationId: transfer.organizationId,
      transferId: transfer.id,
      employeeId: transfer.employeeId,
      fromDepartmentId: transfer.fromDepartmentId,
      toDepartmentId: transfer.toDepartmentId,
      graceEndsOn: grace.endsOn,
      today,
    });

    return {
      graceEndsOn: grace.endsOn,
      graceReminderOn: grace.reminderOn,
      rightCount: snapshot.rights.length,
      requestsCancelled: snapshot.requestsCancelled,
      requestsToCheck: snapshot.requestsToCheck,
    };
  }
}
