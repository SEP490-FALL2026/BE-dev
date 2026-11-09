import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { LicensingApi } from '../../licensing/public/licensing.api';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { GhostSeatDecisionRepo } from '../ghost-seat/ghost-seat-decision.repo';
import { GhostSeatRepo } from '../ghost-seat/ghost-seat.repo';
import { GhostSeatService } from '../ghost-seat/ghost-seat.service';
import type { GhostSeatRecord } from '../ghost-seat/ghost-seat.types';
import { DecisionFollowUpService } from './decision-follow-up.service';
import { decisionDueOn, queueStateOf } from './decision-routing.policy';
import { returnOutcomeOf } from './decision.policy';
import {
  GhostSeatAlreadyReturnedError,
  GhostSeatDecisionNotFoundError,
  GhostSeatNotReturnableError,
  GhostSeatTaskInProgressError,
} from './decision.errors';
import { DECISION_REFERENCE_KIND } from './decision-reclaim.service';
import type { FollowUpDay } from './decision.types';

/**
 * The IT Admin cannot do what the head decided to reclaim and gives it back, once (`OI-02`, `US-10-06` AC-10): the reason of the head is
 * taken back from the task through licensing (the task goes on while another reason stands, is cancelled when none does, and is left alone
 * when another IT Admin works it; a task already closed as failed or cancelled is given back as it is), and the recommendation goes back to the head with a due day counted again from today. The
 * recommendation is locked first, then licensing is called (`DA6-23`). Any IT Admin may return it; the audit says whether it was the one
 * in charge. Throws GhostSeatDecisionNotFoundError, GhostSeatAlreadyReturnedError, GhostSeatNotReturnableError and GhostSeatTaskInProgressError.
 */
@Injectable()
export class DecisionReturnService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly repo: GhostSeatRepo,
    private readonly decisions: GhostSeatDecisionRepo,
    private readonly ghostSeats: GhostSeatService,
    private readonly licensing: LicensingApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly notifications: NotificationsApi,
    private readonly followUp: DecisionFollowUpService,
  ) {}

  async returnToHead(
    actor: AuthenticatedPrincipal,
    id: string,
    reason: string,
    now: Date = new Date(),
  ): Promise<GhostSeatRecord> {
    return this.runner.run(async (tx) => {
      const record = await this.repo.lock(tx, id);
      const day = await this.followUp.dayOf(now);
      if (!record || !day || record.organizationId !== day.organizationId) throw new GhostSeatDecisionNotFoundError();
      if (record.returnCount === 1) throw new GhostSeatAlreadyReturnedError();
      if (
        record.group === 'G2' ||
        record.group === 'G1' ||
        record.state !== 'RECLAIM_DECIDED' ||
        record.assignmentId === null
      ) {
        throw new GhostSeatNotReturnableError();
      }
      const withdrawn = await this.licensing.withdrawRevocationReason(tx, actor, {
        assignmentId: record.assignmentId,
        source: 'GHOST_SEAT',
        referenceId: record.id,
        cause: 'NO_LONGER_APPLIES',
        cancelInProgressClaimedBy: actor.appUserId,
      });
      const outcome = returnOutcomeOf(withdrawn);
      if (outcome === 'IT_ADMIN_TO_CLOSE') throw new GhostSeatTaskInProgressError();
      if (outcome === null) throw new GhostSeatNotReturnableError();
      await this.decisions.insertReturn(tx, {
        recommendationId: record.id,
        reason,
        returnedByAppUserId: actor.appUserId,
        taskId: withdrawn.taskId ?? record.revocationTaskId,
      });

      return this.handBack(tx, actor, record, day, outcome);
    });
  }

  private async handBack(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    record: GhostSeatRecord,
    day: FollowUpDay,
    outcome: 'CANCELLED' | 'CONTINUES',
  ): Promise<GhostSeatRecord> {
    const departmentId = record.deciderDepartmentId;
    const head = departmentId
      ? (await this.organizationReads.getDepartmentHeads([departmentId], day.today, tx)).get(departmentId)
      : undefined;
    const inCharge = departmentId
      ? await this.organizationReads.getItAdminInChargeOfDepartment(departmentId, tx)
      : null;
    const updated = await this.ghostSeats.transition(
      tx,
      record,
      queueStateOf(head !== undefined, true) === 'RETURNED_TO_HEAD' ? 'RETURNED_TO_HEAD' : 'WAITING_FOR_HEAD',
      {
        returnCount: 1,
        revocationTaskId: null,
        decisionDueOn: decisionDueOn(day.today, day.workingDays, day.nonWorking),
        overdueNoticedAt: null,
      },
      'GHOST_SEAT.RETURNED',
      { kind: 'USER', principal: actor },
      { byInCharge: inCharge === actor.employeeId, taskOutcome: outcome, referenceKind: DECISION_REFERENCE_KIND },
    );
    await this.tell(tx, updated, day.organizationId, head?.employeeId ?? null);

    return updated;
  }

  private async tell(
    tx: DbTx,
    record: GhostSeatRecord,
    organizationId: string,
    headEmployeeId: string | null,
  ): Promise<void> {
    const params = {
      recommendationId: record.id,
      employeeId: record.employeeId ?? '',
      applicationId: record.applicationId,
    };
    const subject = { type: 'GHOST_SEAT_RECOMMENDATION', id: record.id };
    if (headEmployeeId) {
      await this.notifications.notifyInApp(tx, {
        organizationId,
        recipientEmployeeId: headEmployeeId,
        code: 'GHOST_SEAT_RETURNED',
        subject,
        params,
        eventKey: `GHOST_SEAT_RETURNED:${record.id}`,
      });
    } else if (record.deciderDepartmentId) {
      await this.notifications.holdForDepartment(tx, {
        organizationId,
        departmentId: record.deciderDepartmentId,
        code: 'GHOST_SEAT_RETURNED',
        subject,
        params,
        eventKey: `GHOST_SEAT_RETURNED:${record.id}`,
      });
    }
  }
}
