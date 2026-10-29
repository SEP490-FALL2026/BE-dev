import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationHistoryApi } from '../../organization/public/organization-history.api';
import {
  EmployeeNotFoundError,
  HeadHandoverRefusedError,
  PlacementDepartmentInactiveError,
  PlacementOverlapError,
} from '../../organization/public/organization.errors';
import { OrganizationApi } from '../../organization/public/organization.api';
import { PersonnelNotifier } from '../event-notice/personnel-notifier.service';
import { groundsSnapshot, normalizedGrounds } from '../policies/grounds.policy';
import { personnelAuditEvent } from '../mappers/personnel-audit-event.mapper';
import { PersonnelFileHooks } from '../event-notice/personnel-file-hooks.service';
import { actorColumns, type PersonnelActor } from '../public/personnel.types';
import { TransferRefusedError } from './transfer.errors';
import {
  cancelRefusal,
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
 * Moves the day of a transfer that has not taken effect, or cancels it (`US-03-01` AC-19, AC-20, AC-21). Both need a reason and
 * a basis, and both only while the day has not come. The head handover of the old department moves or is taken back with it, and
 * is judged again on the new day: when the successor cannot take it, the whole command is refused and nothing is saved.
 */
@Injectable()
export class TransferChangeService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly organization: OrganizationApi,
    private readonly history: OrganizationHistoryApi,
    private readonly guard: TransferGuardService,
    private readonly transfers: TransferRepo,
    private readonly settlement: TransferSettlementService,
    private readonly audit: AuditApi,
    private readonly hooks: PersonnelFileHooks,
    private readonly notifier: PersonnelNotifier,
  ) {}

  /**
   * Moves the day. Throws TransferRefusedError and PersonnelAccessRefusedError. With `outer` it runs in the transaction of the
   * caller (the controlled procedure writes its ticket in the same one) and the caller guards the race.
   */
  async reschedule(
    actor: PersonnelActor,
    id: string,
    input: ChangeTransferInput,
    outer?: DbTx,
  ): Promise<TransferRecord> {
    const newEffectiveOn = input.newEffectiveOn;
    if (newEffectiveOn === undefined) throw new TransferRefusedError('NO_CHANGE');

    return this.change(actor, id, input, outer, async (tx, held, today) => {
      const periodStart = (await this.history.getPlacementStart(tx, held.closesPlacementId)) ?? today;
      const handover = held.headHandover;
      const chosen: SuccessorChoice | undefined =
        input.successor ??
        (handover
          ? handover.successorEmployeeId
            ? { kind: 'EMPLOYEE', employeeId: handover.successorEmployeeId }
            : { kind: 'NONE' }
          : undefined);
      const refusal = rescheduleRefusal({
        ...this.pendingFacts(held, today, periodStart, input),
        newEffectiveOn,
        successor: await this.guard.successorFacts(tx, {
          required: handover !== null,
          chosen,
          transfereeId: held.employeeId,
          oldDepartmentId: held.fromDepartmentId,
          day: newEffectiveOn,
        }),
      });
      if (refusal) this.guard.refuse(refusal);

      // The periods are taken back and written again for the new day: the placement the person had is open, then the head's
      // period goes back where it ended before and is ended again on the new day, then the placement is closed again.
      await this.history.cancelStructureChange(tx, placementsOf(held));
      const moved = handover ? await this.shiftHead(tx, held, handover, newEffectiveOn, chosen) : null;
      const scheduled = await this.scheduleAgain(tx, held, newEffectiveOn);
      const record = await this.transfers.reschedule(tx, held.id, {
        effectiveOn: newEffectiveOn,
        closesPlacementId: scheduled.closedPlacementId,
        opensPlacementId: scheduled.openedPlacementId,
        headHandover: moved,
      });
      const grounds = normalizedGrounds(input.grounds ?? {});
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
    });
  }

  /** Cancels the transfer: the person keeps the department, the head of the department keeps being head. */
  async cancel(actor: PersonnelActor, id: string, input: ChangeTransferInput, outer?: DbTx): Promise<TransferRecord> {
    return this.change(actor, id, input, outer, async (tx, held, today) => {
      const cancelled = await this.applyCancel(tx, actor, held, today, input);
      await this.tell(tx, held, 'TRANSFER_CANCELLED', held.effectiveOn);

      return cancelled;
    });
  }

  /** What cancelling does, under the locks of whoever calls: the placements and the head period go back, the log and the audit are written. */
  private async applyCancel(
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
    const grounds = normalizedGrounds(input.grounds ?? {});
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

  /** The transfer of the person that waits, as it is now and without taking a lock: what the record of a departure takes its locks from. */
  peekPendingOf(tx: DbTx, employeeId: string): Promise<TransferRecord | null> {
    return this.transfers.findPendingOf(tx, employeeId);
  }

  /**
   * The transfer of the person that waits, after those whose day has come were settled (`US-03-04` AC-8, `US-03-01` AC-21): what
   * the record of a departure judges before it takes its locks. Null when none waits.
   */
  async pendingOf(tx: DbTx, employeeId: string, today: BusinessDate): Promise<TransferRecord | null> {
    await this.settlement.settleDueOf(tx, employeeId, today);

    return this.transfers.findPendingOf(tx, employeeId);
  }

  /**
   * Cancels the transfer that waits because the person is to leave before its day, inside the transaction of the record of the
   * departure, which holds the departments and the employee (`US-03-01` AC-21). The basis of the cancellation is the basis of the
   * departure. Answers what the transfer refused instead of throwing it, so the caller says it in its own words.
   */
  async cancelForDeparture(
    tx: DbTx,
    actor: PersonnelActor,
    transferId: string,
    input: ChangeTransferInput,
    today: BusinessDate,
  ): Promise<{ refused: { code: string; details?: Record<string, unknown> } | null }> {
    try {
      const held = await this.transfers.lock(tx, transferId);
      if (!held) throw new TransferRefusedError('NOT_FOUND');
      await this.applyCancel(tx, actor, held, today, input);

      return { refused: null };
    } catch (error) {
      if (error instanceof TransferRefusedError) return { refused: { code: error.code, details: error.details } };
      throw error;
    }
  }

  /**
   * The frame both commands share: the transfer is read, the locks are taken in the order of the protocol (the departments by
   * id, the employee, the successor), the transfer is read again under them, and `apply` does the rest in the transaction.
   */
  private async change(
    actor: PersonnelActor,
    id: string,
    input: ChangeTransferInput,
    outer: DbTx | undefined,
    apply: (tx: DbTx, held: TransferRecord, today: BusinessDate) => Promise<TransferRecord>,
  ): Promise<TransferRecord> {
    const seen = await this.transfers.find(id, outer);
    if (!seen) throw new TransferRefusedError('NOT_FOUND');
    this.guard.requireWriter(actor, seen.employeeId);

    const work = async (tx: DbTx): Promise<TransferRecord> => {
      const today = await this.organization.businessToday(new Date(), tx);
      await this.history.lockDepartments(tx, {
        updateIds: seen.headHandover ? [seen.fromDepartmentId] : [],
        shareIds: [seen.fromDepartmentId, seen.toDepartmentId],
      });
      await this.organization.lockEmployeeForUpdate(tx, seen.employeeId);
      const chosenId = input.successor?.kind === 'EMPLOYEE' ? input.successor.employeeId : null;
      if (chosenId) await this.lockSuccessor(tx, chosenId);
      const held = await this.transfers.lock(tx, id);
      if (!held) throw new TransferRefusedError('NOT_FOUND');
      if (held.headHandover?.successorEmployeeId && held.headHandover.successorEmployeeId !== chosenId) {
        await this.lockSuccessor(tx, held.headHandover.successorEmployeeId);
      }
      await this.guard.requireOperatorSubject(tx, actor, seen.employeeId);

      return apply(tx, held, today);
    };

    return outer ? work(outer) : this.guard.guarded(() => this.runner.run(work));
  }

  /** Everyone concerned is told the transfer moved or was cancelled, in the same transaction. */
  private tell(
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
      grounds: input.grounds,
    };
  }

  private async lockSuccessor(tx: DbTx, employeeId: string): Promise<void> {
    try {
      await this.organization.lockEmployeeForShare(tx, employeeId);
    } catch (error) {
      if (!(error instanceof EmployeeNotFoundError)) throw error;
    }
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
      after: { [key: string]: string | null | { [key: string]: string } };
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
