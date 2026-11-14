import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../../core/business-date';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { PendingBlockOutcome } from '../../../identity-access/public/identity-access.types';
import { LicensingApi } from '../../../licensing/public/licensing.api';
import type { WithdrawnRevocation } from '../../../licensing/public/licensing.types';
import { NotificationsApi } from '../../../notifications/public/notifications.api';
import { PersonnelNotifier } from '../../event-notice/personnel-notifier.service';
import type { PersonnelActor } from '../../public/personnel.types';
import { TransferGuardService } from '../../transfer/transfer-guard.service';
import { OffboardingHandoverService } from '../offboarding-handover.service';
import { departureRevocationSource } from '../offboarding.policy';
import type { OffboardingRecord } from '../offboarding.types';
import { cancelTakesBackEffects, revocationsWithdrawnOf, type RevocationsWithdrawn } from './offboarding-change.policy';

/** What cancelling a handover did to the block on the access: what became of it and, when it had taken effect, what was taken back. */
export interface BlockSettled {
  block: PendingBlockOutcome;
  /** The block had taken effect: it stays for the Super Admin to lift, and the machines of the person end their registration. */
  inForce: boolean;
  withdrawn: RevocationsWithdrawn;
}

/**
 * What a handover cancelled does to the block on the access of the person (`QĐ-100q`, `QĐ-110c`, A3 `D08`). A block that has not taken
 * effect is dropped and nothing was taken away. One that has stays, for the Super Admin to lift with an unlock and a reason, but what it
 * did is taken back: the reason the departure gave to the task of each seat is withdrawn through `licensing`, in the transaction of the
 * cancellation (the machines end their registration in the hook of the file, `DeviceRegistrationHook`). A task that
 * waits and has no other reason is cancelled as no longer applying and its seat stays as it was; a task another source asks for goes on; a
 * task in progress is left to the IT Admin who works it, who closes it by what happened at the provider, and the IT Admin in charge is
 * told once for the case. Seats the departure never asked a revocation for, and tasks that ended, count nowhere. The controlled procedure
 * (no account) withdraws as the Super Admin it serves and the Audit Trail says `OPERATOR`.
 */
@Injectable()
export class OffboardingCancelTakeBack {
  constructor(
    private readonly licensing: LicensingApi,
    private readonly guard: TransferGuardService,
    private readonly notifications: NotificationsApi,
    private readonly notifier: PersonnelNotifier,
    private readonly handovers: OffboardingHandoverService,
  ) {}

  /** Drops the block that has not taken effect; for one that has, withdraws the reasons of the departure from the tasks of the seats. */
  async settleBlock(
    tx: DbTx,
    actor: PersonnelActor,
    held: OffboardingRecord,
    today: BusinessDate,
  ): Promise<BlockSettled> {
    const block = await this.handovers.releaseAccessBlock(tx, held.employeeId, today);
    const inForce = cancelTakesBackEffects(block);

    return {
      block,
      inForce,
      withdrawn: inForce
        ? await this.withdrawRevocations(tx, actor, held, today)
        : { cancelled: 0, itAdminToClose: 0, continues: 0, alreadyDone: 0 },
    };
  }

  private async withdrawRevocations(
    tx: DbTx,
    actor: PersonnelActor,
    held: OffboardingRecord,
    today: BusinessDate,
  ): Promise<RevocationsWithdrawn> {
    const principal = await this.guard.standIn(tx, actor);
    const source = departureRevocationSource(held.accessBlockMode);
    const operator = actor.kind === 'OPERATOR' ? actor : undefined;
    const outcomes: WithdrawnRevocation['outcome'][] = [];
    for (const seat of await this.licensing.listPersonalSeatsOf(held.employeeId, today, tx)) {
      if (seat.revocation === null) continue;
      const withdrawn = await this.licensing.withdrawRevocationReason(tx, principal, {
        assignmentId: seat.assignmentId,
        source,
        referenceId: held.id,
        cause: 'NO_LONGER_APPLIES',
        cancelInProgressClaimedBy: principal.appUserId,
        ...(operator ? { operator } : {}),
      });
      outcomes.push(withdrawn.outcome);
    }
    const tally = revocationsWithdrawnOf(outcomes);
    if (tally.itAdminToClose > 0) await this.tellItAdmin(tx, held, tally.itAdminToClose);

    return tally;
  }

  /**
   * The IT Admin in charge of the department of the case, or the first one who can act, is told once for the case (`eventKey`): never the person
   * who left, whose account is blocked and who would read nothing (`PersonnelNotifier.itAdminOfDeparture`).
   */
  private async tellItAdmin(tx: DbTx, held: OffboardingRecord, taskCount: number): Promise<void> {
    const recipient = await this.notifier.itAdminOfDeparture(tx, held);
    if (recipient === null) return;

    await this.notifications.notifyInApp(tx, {
      organizationId: held.organizationId,
      recipientEmployeeId: recipient,
      code: 'DEPARTURE_REVOCATION_IT_CLOSE',
      subject: { type: 'OFFBOARDING_CASE', id: held.id },
      params: { caseId: held.id, employeeId: held.employeeId, taskCount },
      eventKey: `DEPARTURE_REVOCATION_IT_CLOSE:${held.id}`,
    });
  }
}
