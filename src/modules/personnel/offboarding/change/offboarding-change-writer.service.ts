import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { PersonnelNotifier } from '../../event-notice/personnel-notifier.service';
import { PersonnelFileHooks } from '../../event-notice/personnel-file-hooks.service';
import { DepartureDeadlineService } from '../../departure-deadline/departure-deadline.service';
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
 * Writes the move of the last working day of a handover once it was judged (`US-03-04` AC-14, AC-22): the periods of the record put back and
 * written again for the move, the record, its change and the audit entry, the refusal of the person moved with the day, the hook of the
 * file, and the notice, in the transaction of the event. The cancellation is written by `OffboardingCancelWriter`.
 */
@Injectable()
export class OffboardingChangeWriter {
  constructor(
    private readonly repo: OffboardingRepo,
    private readonly periods: OffboardingPeriodsService,
    private readonly handovers: OffboardingHandoverService,
    private readonly audit: OffboardingAuditService,
    private readonly hooks: PersonnelFileHooks,
    private readonly notifier: PersonnelNotifier,
    private readonly deadlines: DepartureDeadlineService,
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
      // The deadline of the revocations follows the last working day (`QĐ-110c`).
      revocationDueOn: await this.deadlines.revocationDueOn(input.lastWorkingDay),
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
    await this.notifier.departureChanged(tx, moved, 'DEPARTURE_LAST_DAY_CHANGED', moved.departureEffectiveOn);

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
}
