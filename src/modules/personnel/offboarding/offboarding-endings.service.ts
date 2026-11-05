import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OrganizationHistoryApi } from '../../organization/public/organization-history.api';
import { LeaveDepartureService } from '../leave/leave-departure.service';
import type { PersonnelActor } from '../public/personnel.types';
import { TransferChangeService } from '../transfer/transfer-change.service';
import { OffboardingRefusedError } from './offboarding.errors';
import type { DepartureHeld, DepartureSeen } from './offboarding-preconditions.service';
import { OffboardingPeriodsService, type ScheduledDeparture } from './offboarding-periods.service';
import { leavesAtOnce } from './offboarding.policy';
import type { RecordOffboardingInput } from './offboarding.types';

/** The standard reason a transfer that waits is cancelled for when the person leaves before it takes effect (`QĐ-77j`). */
export const DEPARTURE_BEFORE_TRANSFER = 'DEPARTURE_BEFORE_TRANSFER';

/**
 * What a recorded departure ends, in this order (`US-03-04` AC-8, AC-14, AC-19, `US-03-03` AC-6): the transfer that would still wait
 * is cancelled with the basis of the departure, a long leave ends the day the handover is recorded, the head of the department is
 * handed over and the placement is ended the day after the last working day, and a planned departure starts handing over.
 */
@Injectable()
export class OffboardingEndings {
  constructor(
    private readonly transfers: TransferChangeService,
    private readonly leaves: LeaveDepartureService,
    private readonly periods: OffboardingPeriodsService,
    private readonly history: OrganizationHistoryApi,
  ) {}

  async end(
    tx: DbTx,
    actor: PersonnelActor,
    input: RecordOffboardingInput,
    facts: { seen: DepartureSeen; held: DepartureHeld; organizationId: string; today: BusinessDate },
  ): Promise<ScheduledDeparture> {
    const { seen, held, today } = facts;
    if (held.pending) await this.cancelWaitingTransfer(tx, actor, held.pending.id, input, today);
    // A leave that runs ends the day the handover is recorded, so the days of handover are not days of leave (`US-03-03` AC-6).
    if (held.employee.workState === 'ON_LONG_LEAVE') {
      await this.leaves.endForDeparture(tx, actor, input.employeeId, today);
    }
    const scheduled = seen.before
      ? await this.periods.schedule(tx, {
          organizationId: facts.organizationId,
          employeeId: input.employeeId,
          departmentId: seen.before.departmentId,
          endsOn: seen.endsOn,
          leavesAsHead: seen.leavesAsHead,
          successor: input.successor,
        })
      : { placementClosedId: null, headHandover: null };
    // A departure that is `LEFT` the moment it is recorded never passes through the handover.
    if (
      !leavesAtOnce({
        accessBlockMode: input.accessBlockMode,
        lastWorkingDay: input.lastWorkingDay as BusinessDate,
        today,
      })
    )
      await this.history.setEmployeeWorkState(tx, input.employeeId, 'HANDING_OVER');

    return scheduled;
  }

  /** The transfer that waits is cancelled with the basis of the departure, as a cancellation by the Super Admin would be. */
  private async cancelWaitingTransfer(
    tx: DbTx,
    actor: PersonnelActor,
    transferId: string,
    input: RecordOffboardingInput,
    today: BusinessDate,
  ): Promise<void> {
    const { refused } = await this.transfers.cancelForDeparture(
      tx,
      actor,
      transferId,
      { reason: DEPARTURE_BEFORE_TRANSFER, grounds: input.grounds },
      today,
    );
    if (refused) throw new OffboardingRefusedError('PENDING_EVENT_EXISTS', { kind: 'TRANSFER', reason: refused.code });
  }
}
