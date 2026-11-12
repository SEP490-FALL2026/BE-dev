import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { OrganizationHistoryApi } from '../../../organization/public/organization-history.api';
import { LeaveDepartureService } from '../../leave/leave-departure.service';
import { PersonnelNotifier } from '../../event-notice/personnel-notifier.service';
import { PersonnelFileHooks } from '../../event-notice/personnel-file-hooks.service';
import { groundsSnapshot, normalizedGroundsNote } from '../../personnel-grounds.policy';
import { actorColumns, type PersonnelActor } from '../../public/personnel.types';
import { headSuccessorLabel } from '../../transfer/transfer.policy';
import { OffboardingAuditService } from '../offboarding-audit.service';
import { OffboardingHandoverService } from '../offboarding-handover.service';
import { OffboardingPeriodsService } from '../offboarding-periods.service';
import { OffboardingRepo } from '../offboarding.repo';
import type { ChangeLastDayInput, OffboardingRecord } from '../offboarding.types';
import type { JudgedMove } from './offboarding-change-judge.service';

/**
 * Writes the move of the last working day of a handover, or its cancellation, once it was judged (`US-03-04` AC-14, AC-15, AC-22, AC-26):
 * the periods of the record put back and written again for the move, the record, its change and the audit entry, the refusal of the person
 * moved with the day (or dropped), the hook of the file, and the notice, in the transaction of the event.
 */
@Injectable()
export class OffboardingChangeWriter {
  constructor(
    private readonly repo: OffboardingRepo,
    private readonly history: OrganizationHistoryApi,
    private readonly periods: OffboardingPeriodsService,
    private readonly handovers: OffboardingHandoverService,
    private readonly leaves: LeaveDepartureService,
    private readonly audit: OffboardingAuditService,
    private readonly hooks: PersonnelFileHooks,
    private readonly notifier: PersonnelNotifier,
  ) {}

  async move(
    tx: DbTx,
    actor: PersonnelActor,
    held: OffboardingRecord,
    judged: JudgedMove,
    input: ChangeLastDayInput,
  ): Promise<OffboardingRecord> {
    const scheduled =
      held.departmentId !== null
        ? await this.periods.schedule(tx, {
            organizationId: held.organizationId,
            employeeId: held.employeeId,
            departmentId: held.departmentId,
            endsOn: judged.endsOn,
            leavesAsHead: judged.leavesAsHead,
            successor: judged.chosen,
          })
        : { headHandover: null, placementClosedId: null };
    const moved = await this.repo.reschedule(tx, held.id, {
      lastWorkingDay: input.lastWorkingDay,
      departureEffectiveOn: judged.endsOn,
      // A departure blocked now has no deadline of the old handover column to move.
      handoverDueOn:
        held.accessBlockMode === 'BLOCK_NOW' ? null : await this.handovers.plannedDueOn(input.lastWorkingDay),
      headHandover: scheduled.headHandover,
      placementClosedId: scheduled.placementClosedId,
    });
    await this.handovers.moveAccessBlock(tx, held.employeeId, input.lastWorkingDay);
    await this.recordMove(tx, actor, { held, moved, reason: input.reason.trim(), groundsNote: input.groundsNote });
    await this.hooks.onDueChanged(tx, {
      fileKind: 'OFFBOARDING',
      fileId: held.id,
      employeeId: held.employeeId,
      dueOn: moved.departureEffectiveOn,
      previousDueOn: held.departureEffectiveOn,
    });
    await this.tell(tx, moved, 'DEPARTURE_LAST_DAY_CHANGED', moved.departureEffectiveOn);

    return moved;
  }

  /** The change of the case and the audit entry of the move. */
  private async recordMove(
    tx: DbTx,
    actor: PersonnelActor,
    move: { held: OffboardingRecord; moved: OffboardingRecord; reason: string; groundsNote: string | undefined },
  ): Promise<void> {
    const { held, moved, reason } = move;
    const grounds = move.groundsNote ? groundsSnapshot(normalizedGroundsNote(move.groundsNote)) : null;
    const by = actorColumns(actor);
    await this.repo.insertChange(tx, {
      caseId: held.id,
      kind: 'LAST_DAY_CHANGED',
      oldLastWorkingDay: held.lastWorkingDay,
      newLastWorkingDay: moved.lastWorkingDay,
      reason,
      detail: {
        oldDepartureEffectiveOn: held.departureEffectiveOn,
        newDepartureEffectiveOn: moved.departureEffectiveOn,
        oldHeadSuccessor: headSuccessorLabel(held.headHandover),
        newHeadSuccessor: headSuccessorLabel(moved.headHandover),
        grounds,
      },
      changedByAppUserId: by.appUserId,
      changedByTicketId: by.ticketId,
    });
    await this.audit.changed(
      tx,
      actor,
      held,
      'OFFBOARDING_CASE.LAST_DAY_CHANGED',
      { lastWorkingDay: held.lastWorkingDay, handoverDueOn: held.handoverDueOn },
      {
        lastWorkingDay: moved.lastWorkingDay,
        handoverDueOn: moved.handoverDueOn,
        reason,
        grounds,
        headSuccessor: headSuccessorLabel(moved.headHandover),
      },
    );
  }

  /** Puts the periods back, drops the block that has not taken effect, and brings the person back to what they were doing (`AC-26`). */
  async cancel(
    tx: DbTx,
    actor: PersonnelActor,
    held: OffboardingRecord,
    why: { reason: string; today: string; groundsNote?: string },
  ): Promise<OffboardingRecord & { firstPlacementRestored?: boolean }> {
    const { reason } = why;
    if (held.departmentId !== null) {
      await this.periods.undo(tx, held);
    }
    const firstPlacementRestored = await this.periods.restoreFirstPlacement(tx, held);
    // A block that has not taken effect goes with the handover; one that has stays until the Super Admin lifts it with a reason (QĐ-100q).
    const block = await this.handovers.releaseAccessBlock(tx, held.employeeId, why.today);
    // The person is back to what they were doing: a leave ended for the handover is taken up again when its day is still ahead (`AC-26`).
    const resumed =
      held.priorWorkState === 'ON_LONG_LEAVE'
        ? await this.leaves.resumeAfterCancelledDeparture(tx, actor, held.employeeId, why.today)
        : 'WORKING';
    await this.history.setEmployeeWorkState(tx, held.employeeId, resumed);
    const by = actorColumns(actor);
    const cancelled = await this.repo.cancel(tx, held.id, { appUserId: by.appUserId, ticketId: by.ticketId, reason });
    await this.repo.insertChange(tx, {
      caseId: held.id,
      kind: 'CANCELLED',
      oldLastWorkingDay: held.lastWorkingDay,
      reason,
      detail: {
        workState: resumed,
        grounds: why.groundsNote ? groundsSnapshot(normalizedGroundsNote(why.groundsNote)) : null,
        ...(firstPlacementRestored !== undefined ? { firstPlacementRestored } : {}),
      },
      changedByAppUserId: by.appUserId,
      changedByTicketId: by.ticketId,
    });
    await this.audit.changed(
      tx,
      actor,
      held,
      'OFFBOARDING_CASE.CANCELLED',
      { state: 'HANDING_OVER', lastWorkingDay: held.lastWorkingDay },
      {
        state: 'CANCELLED',
        reason,
        grounds: why.groundsNote ? groundsSnapshot(normalizedGroundsNote(why.groundsNote)) : null,
        workState: resumed,
        accessBlock: block,
      },
    );
    await this.hooks.onCancelled(tx, {
      fileKind: 'OFFBOARDING',
      fileId: held.id,
      employeeId: held.employeeId,
      dueOn: held.departureEffectiveOn,
    });
    await this.tell(tx, cancelled, 'DEPARTURE_CANCELLED', held.departureEffectiveOn);

    return { ...cancelled, ...(firstPlacementRestored !== undefined ? { firstPlacementRestored } : {}) };
  }

  /** The person and the head of their department are told the departure moved or was cancelled, in the same transaction. */
  private tell(
    tx: DbTx,
    record: OffboardingRecord,
    eventKind: 'DEPARTURE_LAST_DAY_CHANGED' | 'DEPARTURE_CANCELLED',
    effectiveOn: string,
  ): Promise<void> {
    return this.notifier.eventRecorded(tx, {
      organizationId: record.organizationId,
      employeeId: record.employeeId,
      departmentId: record.departmentId,
      eventKind,
      eventId: record.id,
      subjectType: 'OFFBOARDING_CASE',
      effectiveOn,
    });
  }
}
