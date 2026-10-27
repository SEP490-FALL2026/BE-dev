import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { TransactionRunner, readSqlState, type DbTx } from '../../../infrastructure/database/transaction-runner';
import { isCheckViolation } from '../../../infrastructure/database/unique-violation';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { OrganizationHistoryService } from '../../organization/organization-history.service';
import {
  EmployeeNotFoundError,
  HeadHandoverRefusedError,
  PlacementDepartmentInactiveError,
  PlacementOverlapError,
} from '../../organization/organization.errors';
import { OrganizationService } from '../../organization/organization.service';
import { groundsSnapshot, normalizedGrounds } from '../grounds/grounds.policy';
import { personnelAuditEvent } from '../mappers/personnel-audit-event';
import { PersonnelFileHooks } from '../personnel-file-hooks';
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
    private readonly organization: OrganizationService,
    private readonly history: OrganizationHistoryService,
    private readonly guard: TransferGuardService,
    private readonly transfers: TransferRepo,
    private readonly settlement: TransferSettlementService,
    private readonly audit: AuditService,
    private readonly hooks: PersonnelFileHooks,
  ) {}

  /** Moves the day. Throws TransferRefusedError. */
  async reschedule(actor: AuthenticatedPrincipal, id: string, input: ChangeTransferInput): Promise<TransferRecord> {
    const newEffectiveOn = input.newEffectiveOn;
    if (newEffectiveOn === undefined) throw new TransferRefusedError('NO_CHANGE');

    return this.change(actor, id, input, async (tx, held, today, selfMode) => {
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
        ...this.pendingFacts(held, today, periodStart, selfMode, input),
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
        changedByAppUserId: actor.appUserId,
      });
      await this.auditChange(tx, actor, 'DEPARTMENT_TRANSFER.RESCHEDULED', held, selfMode, {
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

      return (await this.transfers.find(record.id, tx)) ?? record;
    });
  }

  /** Cancels the transfer: the person keeps the department and the title, the head of the department keeps being head. */
  async cancel(actor: AuthenticatedPrincipal, id: string, input: ChangeTransferInput): Promise<TransferRecord> {
    return this.change(actor, id, input, (tx, held, today, selfMode) =>
      this.applyCancel(tx, actor, held, today, selfMode, input),
    );
  }

  /** What cancelling does, under the locks of whoever calls: the placements and the head period go back, the log and the audit are written. */
  private async applyCancel(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    held: TransferRecord,
    today: BusinessDate,
    selfMode: PendingTransferFacts['selfMode'],
    input: ChangeTransferInput,
  ): Promise<TransferRecord> {
    const periodStart = (await this.history.getPlacementStart(tx, held.closesPlacementId)) ?? today;
    const refusal = cancelRefusal(this.pendingFacts(held, today, periodStart, selfMode, input));
    if (refusal) this.guard.refuse(refusal);

    await this.history.cancelStructureChange(tx, placementsOf(held));
    if (held.headHandover) {
      await this.history.undoScheduledHeadHandover(tx, held.headHandover);
    }
    const grounds = normalizedGrounds(input.grounds ?? {});
    const reason = input.reason.trim();
    const record = await this.transfers.cancel(tx, held.id, { appUserId: actor.appUserId, reason });
    await this.transfers.insertChange(tx, {
      transferId: held.id,
      kind: 'CANCELLED',
      oldEffectiveOn: held.effectiveOn,
      newEffectiveOn: null,
      reason,
      grounds,
      changedByAppUserId: actor.appUserId,
    });
    await this.auditChange(tx, actor, 'DEPARTMENT_TRANSFER.CANCELLED', held, selfMode, {
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
    actor: AuthenticatedPrincipal,
    transferId: string,
    input: ChangeTransferInput,
    today: BusinessDate,
    selfMode: PendingTransferFacts['selfMode'],
  ): Promise<{ refused: { code: string; details?: Record<string, unknown> } | null }> {
    try {
      const held = await this.transfers.lock(tx, transferId);
      if (!held) throw new TransferRefusedError('NOT_FOUND');
      await this.applyCancel(tx, actor, held, today, selfMode, input);

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
    actor: AuthenticatedPrincipal,
    id: string,
    input: ChangeTransferInput,
    apply: (
      tx: DbTx,
      held: TransferRecord,
      today: BusinessDate,
      selfMode: Awaited<ReturnType<TransferGuardService['selfMode']>>,
    ) => Promise<TransferRecord>,
  ): Promise<TransferRecord> {
    const seen = await this.transfers.find(id);
    if (!seen) throw new TransferRefusedError('NOT_FOUND');
    const selfMode = await this.guard.selfMode(actor, seen.employeeId);

    return this.guarded(() =>
      this.runner.run(async (tx) => {
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

        return apply(tx, held, today, selfMode);
      }),
    );
  }

  /**
   * The database has the last word on the periods put back: if someone changed the head of the department or the person's
   * placements between the recording and now, they no longer fit, and nothing is saved.
   */
  private async guarded<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (readSqlState(error) === '23P01' || isCheckViolation(error))
        throw new TransferRefusedError('CONCURRENT_CHANGE');
      throw error;
    }
  }

  private pendingFacts(
    held: TransferRecord,
    today: BusinessDate,
    periodStart: BusinessDate,
    selfMode: PendingTransferFacts['selfMode'],
    input: ChangeTransferInput,
  ): PendingTransferFacts {
    return {
      status: held.status,
      effectiveOn: held.effectiveOn,
      today,
      periodStart,
      reason: input.reason,
      grounds: input.grounds,
      selfMode,
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
    actor: AuthenticatedPrincipal,
    action: string,
    held: TransferRecord,
    selfMode: PendingTransferFacts['selfMode'],
    snapshots: {
      before: { [key: string]: string | null };
      after: { [key: string]: string | null | { [key: string]: string } };
    },
  ): Promise<void> {
    await this.audit.record(
      tx,
      personnelAuditEvent(actor, held.organizationId, action, 'DepartmentTransfer', held.id, snapshots.before, {
        ...snapshots.after,
        selfExecuted: selfMode === 'ALLOW_SELF_EXECUTED',
      }),
    );
    if (selfMode === 'ALLOW_SELF_EXECUTED') {
      await this.audit.record(
        tx,
        personnelAuditEvent(
          actor,
          held.organizationId,
          'PERSONNEL.SELF_EXECUTED',
          'DepartmentTransfer',
          held.id,
          null,
          {
            event: action,
          },
        ),
      );
    }
  }
}
