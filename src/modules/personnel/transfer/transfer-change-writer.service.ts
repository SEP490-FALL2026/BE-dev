import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationHistoryApi } from '../../organization/public/organization-history.api';
import {
  HeadHandoverRefusedError,
  PlacementDepartmentInactiveError,
  PlacementOverlapError,
} from '../../organization/public/organization.errors';
import { PersonnelNotifier } from '../event-notice/personnel-notifier.service';
import { PersonnelFileHooks } from '../event-notice/personnel-file-hooks.service';
import { groundsSnapshot, normalizedGroundsNote } from '../personnel-grounds.policy';
import { personnelAuditEvent } from '../personnel-audit-event.mapper';
import { actorColumns, type PersonnelActor } from '../public/personnel.types';
import { TransferRefusedError } from './transfer.errors';
import {
  cancelRefusal,
  previousSuccessorChoice,
  rescheduleRefusal,
  retiredDestinationRefusal,
  type PendingTransferFacts,
} from './transfer.policy';
import { TransferGuardService } from './transfer-guard.service';
import { TransferRepo } from './transfer.repo';
import { TransferSettlementService } from './transfer-settlement.service';
import type { ChangeTransferInput, HeadHandoverFacts, SuccessorChoice, TransferRecord } from './transfer.types';

/** The two placements a waiting transfer wrote. */
const placementsOf = (held: TransferRecord) => ({
  closedPlacementId: held.closesPlacementId,
  openedPlacementId: held.opensPlacementId,
});

/**
 * Writes the move of the day of a transfer that has not taken effect, or its cancellation, under the locks the caller holds
 * (`US-03-01` AC-19, AC-20, AC-21): the periods taken back and, for a move, written again for the new day, the head handover moved or
 * taken back with it and judged again on the new day, the record, its log, the audit entry, the hook of the file and the notice.
 */
@Injectable()
export class TransferChangeWriter {
  constructor(
    private readonly history: OrganizationHistoryApi,
    private readonly guard: TransferGuardService,
    private readonly transfers: TransferRepo,
    private readonly settlement: TransferSettlementService,
    private readonly audit: AuditApi,
    private readonly hooks: PersonnelFileHooks,
    private readonly notifier: PersonnelNotifier,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  /** Moves the day: judged on the new day and on who follows the head, then the periods go back and are written again. */
  async reschedule(
    tx: DbTx,
    actor: PersonnelActor,
    held: TransferRecord,
    today: BusinessDate,
    input: ChangeTransferInput & { newEffectiveOn: BusinessDate },
  ): Promise<TransferRecord> {
    const { newEffectiveOn } = input;
    const periodStart = (await this.history.getPlacementStart(tx, held.closesPlacementId)) ?? today;
    const handover = held.headHandover;
    const chosen: SuccessorChoice | undefined = input.successor ?? previousSuccessorChoice(handover);
    // The destination takes nobody in before the day it takes effect, whatever day the transfer is moved to (`QĐ-104e(3)`).
    const destination = await this.organizationReads.getDepartmentBrief(held.toDepartmentId, tx);
    const refusal = rescheduleRefusal({
      ...this.pendingFacts(held, today, periodStart, input),
      newEffectiveOn,
      destinationEffectiveFrom: destination?.effectiveFrom ?? null,
      successor: await this.guard.successorFacts(tx, {
        required: handover !== null,
        chosen,
        transfereeId: held.employeeId,
        oldDepartmentId: held.fromDepartmentId,
        day: newEffectiveOn,
      }),
    });
    if (refusal) this.guard.refuse(refusal, held.fromDepartmentId);

    const { moved, record } = await this.rewritePeriods(tx, held, { newEffectiveOn, chosen });
    const grounds = normalizedGroundsNote(input.groundsNote ?? '');
    await this.transfers.insertChange(tx, {
      transferId: held.id,
      kind: 'RESCHEDULED',
      oldEffectiveOn: held.effectiveOn,
      newEffectiveOn,
      reason: input.reason.trim(),
      grounds,
      changedByAppUserId: actorColumns(actor).appUserId,
      changedByTicketId: actorColumns(actor).ticketId,
    });
    await this.auditChange(tx, actor, 'DEPARTMENT_TRANSFER.RESCHEDULED', held, {
      before: { effectiveOn: held.effectiveOn },
      after: {
        effectiveOn: newEffectiveOn,
        reason: input.reason.trim(),
        grounds: groundsSnapshot(grounds),
        headSuccessor: moved?.successorEmployeeId ?? null,
      },
    });
    await this.hooks.onDueChanged(tx, {
      fileKind: 'TRANSFER',
      fileId: held.id,
      employeeId: held.employeeId,
      dueOn: newEffectiveOn,
      previousDueOn: held.effectiveOn,
    });
    // The new day is today: the placement began in this transaction, so the transfer has taken effect.
    if (newEffectiveOn <= today) await this.settlement.settleOne(tx, held.id, 'RESCHEDULED_TO_TODAY');
    await this.tell(tx, held, 'TRANSFER_RESCHEDULED', newEffectiveOn);

    return (await this.transfers.find(record.id, tx)) ?? record;
  }

  /**
   * The periods are taken back and written again for the new day: the placement the person had is open, then the head's period goes back
   * where it ended before and is ended again on the new day, then the placement is closed again; the record follows.
   */
  private async rewritePeriods(
    tx: DbTx,
    held: TransferRecord,
    to: { newEffectiveOn: BusinessDate; chosen: SuccessorChoice | undefined },
  ): Promise<{ moved: HeadHandoverFacts | null; record: TransferRecord }> {
    const { newEffectiveOn, chosen } = to;
    const handover = held.headHandover;
    await this.history.cancelStructureChange(tx, placementsOf(held));
    const moved = handover ? await this.shiftHead(tx, held, handover, newEffectiveOn, chosen) : null;
    const scheduled = await this.scheduleAgain(tx, held, newEffectiveOn);
    const record = await this.transfers.reschedule(tx, held.id, {
      effectiveOn: newEffectiveOn,
      closesPlacementId: scheduled.closedPlacementId,
      opensPlacementId: scheduled.openedPlacementId,
      headHandover: moved,
    });

    return { moved, record };
  }

  /** What cancelling does, under the locks of whoever calls: the placements and the head period go back, the log and the audit are written. */
  async applyCancel(
    tx: DbTx,
    actor: PersonnelActor,
    held: TransferRecord,
    today: BusinessDate,
    input: ChangeTransferInput,
  ): Promise<TransferRecord> {
    const periodStart = (await this.history.getPlacementStart(tx, held.closesPlacementId)) ?? today;
    const refusal = cancelRefusal(this.pendingFacts(held, today, periodStart, input));
    if (refusal) this.guard.refuse(refusal);

    await this.history.cancelStructureChange(tx, placementsOf(held));
    if (held.headHandover) {
      await this.history.undoScheduledHeadHandover(tx, held.headHandover);
    }
    const grounds = normalizedGroundsNote(input.groundsNote ?? '');
    const reason = input.reason.trim();
    const { appUserId, ticketId } = actorColumns(actor);
    const record = await this.transfers.cancel(tx, held.id, { appUserId, ticketId, reason });
    await this.transfers.insertChange(tx, {
      transferId: held.id,
      kind: 'CANCELLED',
      oldEffectiveOn: held.effectiveOn,
      newEffectiveOn: null,
      reason,
      grounds,
      changedByAppUserId: appUserId,
      changedByTicketId: ticketId,
    });
    await this.auditChange(tx, actor, 'DEPARTMENT_TRANSFER.CANCELLED', held, {
      before: { effectiveOn: held.effectiveOn, status: 'PENDING' },
      after: { status: 'CANCELLED', reason, grounds: groundsSnapshot(grounds) },
    });
    await this.hooks.onCancelled(tx, {
      fileKind: 'TRANSFER',
      fileId: held.id,
      employeeId: held.employeeId,
      dueOn: held.effectiveOn,
    });

    return record;
  }

  /** Everyone concerned is told the transfer moved or was cancelled, in the same transaction. */
  tell(
    tx: DbTx,
    held: TransferRecord,
    eventKind: 'TRANSFER_RESCHEDULED' | 'TRANSFER_CANCELLED',
    on: BusinessDate,
  ): Promise<void> {
    return this.notifier.eventRecorded(tx, {
      organizationId: held.organizationId,
      employeeId: held.employeeId,
      departmentId: held.toDepartmentId,
      alsoDepartmentIds: [held.fromDepartmentId],
      eventKind,
      eventId: held.id,
      subjectType: 'DEPARTMENT_TRANSFER',
      effectiveOn: on,
    });
  }

  private pendingFacts(
    held: TransferRecord,
    today: BusinessDate,
    periodStart: BusinessDate,
    input: ChangeTransferInput,
  ): PendingTransferFacts {
    return {
      status: held.status,
      effectiveOn: held.effectiveOn,
      today,
      periodStart,
      reason: input.reason,
      groundsNote: input.groundsNote,
    };
  }

  private async shiftHead(
    tx: DbTx,
    held: TransferRecord,
    handover: HeadHandoverFacts,
    newEffectiveOn: BusinessDate,
    chosen: SuccessorChoice | undefined,
  ): Promise<HeadHandoverFacts | null> {
    const successorEmployeeId = chosen?.kind === 'EMPLOYEE' ? chosen.employeeId : null;
    try {
      const moved = await this.history.shiftScheduledHeadHandover(tx, handover, {
        organizationId: held.organizationId,
        departmentId: held.fromDepartmentId,
        outgoingEmployeeId: held.employeeId,
        effectiveOn: newEffectiveOn,
        successorEmployeeId,
      });

      return moved && { ...moved, successor: successorEmployeeId ? 'EMPLOYEE' : 'NONE', successorEmployeeId };
    } catch (error) {
      if (error instanceof HeadHandoverRefusedError) {
        throw new TransferRefusedError('SUCCESSOR_NOT_A_MEMBER_ON_DATE', { reason: error.reason });
      }
      throw error;
    }
  }

  private async scheduleAgain(tx: DbTx, held: TransferRecord, effectiveOn: BusinessDate) {
    try {
      return await this.history.scheduleStructureChange(tx, {
        organizationId: held.organizationId,
        employeeId: held.employeeId,
        effectiveOn,
        departmentId: held.toDepartmentId,
      });
    } catch (error) {
      if (error instanceof PlacementOverlapError)
        throw new TransferRefusedError('PLACEMENT_OVERLAP', { reason: error.reason });
      if (error instanceof PlacementDepartmentInactiveError) {
        const refusal = retiredDestinationRefusal();
        throw new TransferRefusedError(refusal.code, refusal.details);
      }
      throw error;
    }
  }

  private async auditChange(
    tx: DbTx,
    actor: PersonnelActor,
    action: string,
    held: TransferRecord,
    snapshots: {
      before: { [key: string]: string | null };
      after: { [key: string]: string | null | { [key: string]: string | null } };
    },
  ): Promise<void> {
    await this.audit.record(
      tx,
      personnelAuditEvent(
        actor,
        held.organizationId,
        action,
        'DepartmentTransfer',
        held.id,
        snapshots.before,
        snapshots.after,
      ),
    );
  }
}
