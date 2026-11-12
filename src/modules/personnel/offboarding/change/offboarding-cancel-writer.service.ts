import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../../core/business-date';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { OrganizationHistoryApi } from '../../../organization/public/organization-history.api';
import { LeaveDepartureService } from '../../leave/leave-departure.service';
import { PersonnelNotifier } from '../../event-notice/personnel-notifier.service';
import { PersonnelFileHooks } from '../../event-notice/personnel-file-hooks.service';
import { groundsSnapshot, normalizedGroundsNote } from '../../personnel-grounds.policy';
import { actorColumns, type PersonnelActor } from '../../public/personnel.types';
import { OffboardingAuditService } from '../offboarding-audit.service';
import { OffboardingPeriodsService } from '../offboarding-periods.service';
import { OffboardingRepo } from '../offboarding.repo';
import type { OffboardingRecord } from '../offboarding.types';
import { OffboardingCancelTakeBack, type BlockSettled } from './offboarding-cancel-takeback.service';
import type { RevocationsWithdrawn } from './offboarding-change.policy';

/** What the cancellation of a handover answers beyond the record: the first placement put back, and what was taken back from the tasks. */
export type CancelledOffboarding = OffboardingRecord & {
  firstPlacementRestored?: boolean;
  revocationsWithdrawn: RevocationsWithdrawn;
};

/**
 * Writes the cancellation of a handover once it was judged (`US-03-04` AC-15, AC-26, `QĐ-110c`): the periods put back, the block settled
 * (dropped when it has not taken effect; kept for the Super Admin to lift when it has, with what it did to the tasks and the machines taken
 * back), the person back to what they were doing, the record, its changes and the audit entry, the hook of the file, and the notice, in the
 * transaction of the event.
 */
@Injectable()
export class OffboardingCancelWriter {
  constructor(
    private readonly repo: OffboardingRepo,
    private readonly history: OrganizationHistoryApi,
    private readonly periods: OffboardingPeriodsService,
    private readonly leaves: LeaveDepartureService,
    private readonly audit: OffboardingAuditService,
    private readonly hooks: PersonnelFileHooks,
    private readonly notifier: PersonnelNotifier,
    private readonly takeBack: OffboardingCancelTakeBack,
  ) {}

  /** Puts the periods back, settles the block, and brings the person back to what they were doing (`AC-26`). */
  async cancel(
    tx: DbTx,
    actor: PersonnelActor,
    held: OffboardingRecord,
    why: { reason: string; today: BusinessDate; groundsNote?: string },
  ): Promise<CancelledOffboarding> {
    if (held.departmentId !== null) await this.periods.undo(tx, held);
    const firstPlacementRestored = await this.periods.restoreFirstPlacement(tx, held);
    const settled = await this.takeBack.settleBlock(tx, actor, held, why.today);
    // The person is back to what they were doing: a leave ended for the handover is taken up again when its day is still ahead (`AC-26`).
    const workState =
      held.priorWorkState === 'ON_LONG_LEAVE'
        ? await this.leaves.resumeAfterCancelledDeparture(tx, actor, held.employeeId, why.today)
        : 'WORKING';
    await this.history.setEmployeeWorkState(tx, held.employeeId, workState);
    const by = actorColumns(actor);
    const cancelled = await this.repo.cancel(tx, held.id, {
      appUserId: by.appUserId,
      ticketId: by.ticketId,
      reason: why.reason,
    });
    await this.record(tx, actor, held, { ...why, workState, settled, firstPlacementRestored });
    await this.hooks.onCancelled(tx, {
      fileKind: 'OFFBOARDING',
      fileId: held.id,
      employeeId: held.employeeId,
      dueOn: held.departureEffectiveOn,
      accessBlockInForce: settled.inForce,
    });
    await this.notifier.departureChanged(tx, cancelled, 'DEPARTURE_CANCELLED', held.departureEffectiveOn);

    return {
      ...cancelled,
      ...(firstPlacementRestored !== undefined ? { firstPlacementRestored } : {}),
      revocationsWithdrawn: settled.withdrawn,
    };
  }

  /** The changes of the case (what was taken back from the tasks, then the cancellation) and the audit entry of the cancellation. */
  private async record(
    tx: DbTx,
    actor: PersonnelActor,
    held: OffboardingRecord,
    done: {
      reason: string;
      groundsNote?: string;
      workState: string;
      settled: BlockSettled;
      firstPlacementRestored: boolean | undefined;
    },
  ): Promise<void> {
    const { reason, settled, firstPlacementRestored } = done;
    const by = actorColumns(actor);
    const grounds = done.groundsNote ? groundsSnapshot(normalizedGroundsNote(done.groundsNote)) : null;
    const { cancelled, itAdminToClose, continues } = settled.withdrawn;
    const count = cancelled + itAdminToClose + continues;
    if (count > 0)
      await this.repo.insertChange(tx, {
        caseId: held.id,
        kind: 'REVOCATIONS_WITHDRAWN',
        reason,
        detail: { count, cancelled, itAdminToClose, continues },
        changedByAppUserId: by.appUserId,
        changedByTicketId: by.ticketId,
      });
    await this.repo.insertChange(tx, {
      caseId: held.id,
      kind: 'CANCELLED',
      oldLastWorkingDay: held.lastWorkingDay,
      reason,
      detail: {
        workState: done.workState,
        grounds,
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
        grounds,
        workState: done.workState,
        accessBlock: settled.block,
        revocationsWithdrawn: { cancelled, itAdminToClose, continues },
      },
    );
  }
}
