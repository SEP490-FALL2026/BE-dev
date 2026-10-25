import { Injectable } from '@nestjs/common';
import { addDays } from '../../../core/business-date';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { OrganizationHistoryService } from '../../organization/organization-history.service';
import { OrganizationService } from '../../organization/organization.service';
import { LeaveDepartureService } from '../leave/leave-departure.service';
import { PersonnelFileHooks } from '../personnel-file-hooks';
import { TransferGuardService } from '../transfer/transfer-guard.service';
import { OffboardingAuditService } from './offboarding-audit.service';
import { OffboardingFrame } from './offboarding-frame.service';
import { OffboardingHandoverService } from './offboarding-handover.service';
import { OffboardingPeriodsService } from './offboarding-periods.service';
import { OffboardingRefusedError } from './offboarding.errors';
import { cancelRefusal, changeLastDayRefusal, departureEffectiveOn } from './offboarding.policy';
import { OffboardingRepo } from './offboarding.repo';
import type { ChangeLastDayInput, OffboardingRecord, SuccessorChoice } from './offboarding.types';

/**
 * Moves the last working day of a handover under way, or cancels it (`US-03-04` AC-14, AC-15, AC-22, AC-26, AC-29). Both need a
 * reason and only a handover that is still under way, and both put the periods the record wrote back exactly (the placement is open
 * again, the head of the department is back) before they write again. A move is judged on the new day like a record: when the head
 * cannot be handed over there, the whole command is refused and nothing is saved. A cancellation takes no task away because none
 * was made, and the person is back to what they were doing, a long leave included when its day is still ahead.
 */
@Injectable()
export class OffboardingChangeService {
  constructor(
    private readonly frame: OffboardingFrame,
    private readonly repo: OffboardingRepo,
    private readonly organization: OrganizationService,
    private readonly history: OrganizationHistoryService,
    private readonly guard: TransferGuardService,
    private readonly periods: OffboardingPeriodsService,
    private readonly handovers: OffboardingHandoverService,
    private readonly leaves: LeaveDepartureService,
    private readonly audit: OffboardingAuditService,
    private readonly hooks: PersonnelFileHooks,
  ) {}

  /** Moves the last working day. Throws OffboardingRefusedError. */
  changeLastDay(actor: AuthenticatedPrincipal, id: string, input: ChangeLastDayInput): Promise<OffboardingRecord> {
    const chosenId = input.successor?.kind === 'EMPLOYEE' ? input.successor.employeeId : null;

    return this.frame.run(actor, id, { lockDepartment: true, successorEmployeeId: chosenId }, async (tx, context) => {
      const { held, today, selfMode } = context;
      const placementFrom =
        (held.placementClosedId ? await this.history.getPlacementStart(tx, held.placementClosedId) : null) ?? today;
      const employee = await this.organization.getEmployee(held.employeeId, tx);
      if (!employee) throw new OffboardingRefusedError('EMPLOYEE_NOT_FOUND');
      const facts = {
        state: held.state,
        today,
        hireDate: employee.hireDate,
        placementFrom,
        currentLastWorkingDay: held.lastWorkingDay,
        newLastWorkingDay: input.lastWorkingDay,
        reason: input.reason,
        selfMode,
      };
      const early = changeLastDayRefusal({ ...facts, successor: null });
      if (early) throw new OffboardingRefusedError(early.code, early.details);

      // The periods go back first so the new day is judged on the department as it was before the handover; a refusal rolls it all back.
      await this.periods.undo(tx, held);
      const endsOn = departureEffectiveOn({
        lastWorkingDay: input.lastWorkingDay,
        abrupt: false,
        today,
        placementFrom,
      });
      const lastInOffice = addDays(endsOn, -1);
      // Read in this transaction, after the periods went back: a read outside it would still see the handover the record wrote.
      const heads = await this.history.getHeadsOnDates([{ departmentId: held.departmentId, onDate: lastInOffice }], tx);
      const leavesAsHead = heads.get(`${held.departmentId}|${lastInOffice}`) === held.employeeId;
      const chosen: SuccessorChoice | undefined = input.successor ?? this.previousChoice(held);
      const refusal = leavesAsHead
        ? await this.guard.judgeSuccessor(tx, {
            chosen,
            leaverId: held.employeeId,
            departmentId: held.departmentId,
            day: endsOn,
          })
        : null;
      if (refusal) throw new OffboardingRefusedError(refusal.code, refusal.details);

      const scheduled = await this.periods.schedule(tx, {
        organizationId: held.organizationId,
        employeeId: held.employeeId,
        departmentId: held.departmentId,
        endsOn,
        leavesAsHead,
        successor: chosen,
      });
      const moved = await this.repo.reschedule(tx, held.id, {
        lastWorkingDay: input.lastWorkingDay,
        departureEffectiveOn: endsOn,
        handoverDueOn: await this.handovers.plannedDueOn(input.lastWorkingDay),
        headHandover: scheduled.headHandover,
        placementClosedId: scheduled.placementClosedId,
      });
      const selfExecuted = selfMode === 'ALLOW_SELF_EXECUTED';
      const reason = input.reason.trim();
      await this.repo.insertChange(tx, {
        caseId: held.id,
        kind: 'LAST_DAY_CHANGED',
        oldLastWorkingDay: held.lastWorkingDay,
        newLastWorkingDay: moved.lastWorkingDay,
        reason,
        detail: {
          oldDepartureEffectiveOn: held.departureEffectiveOn,
          newDepartureEffectiveOn: moved.departureEffectiveOn,
          oldHeadSuccessor: this.successorOf(held),
          newHeadSuccessor: this.successorOf(moved),
        },
        changedByAppUserId: actor.appUserId,
        selfExecuted,
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
          headSuccessor: this.successorOf(moved),
        },
        selfExecuted,
      );
      await this.handovers.reconcile(tx, actor, moved);
      await this.hooks.onDueChanged(tx, {
        fileKind: 'OFFBOARDING',
        fileId: held.id,
        employeeId: held.employeeId,
        dueOn: moved.departureEffectiveOn,
        previousDueOn: held.departureEffectiveOn,
      });

      return moved;
    });
  }

  /** Cancels a handover under way. Throws OffboardingRefusedError. */
  cancel(actor: AuthenticatedPrincipal, id: string, input: { reason: string }): Promise<OffboardingRecord> {
    return this.frame.run(actor, id, { lockDepartment: true }, async (tx, { held, today, selfMode }) => {
      const refusal = cancelRefusal({ state: held.state, reason: input.reason, selfMode });
      if (refusal) throw new OffboardingRefusedError(refusal.code, refusal.details);
      const reason = input.reason.trim();

      await this.periods.undo(tx, held);
      await this.handovers.cancel(tx, actor, held, reason);
      // The person is back to what they were doing: a leave ended for the handover is taken up again when its day is still ahead (`AC-26`).
      const resumed =
        held.priorWorkState === 'ON_LONG_LEAVE'
          ? await this.leaves.resumeAfterCancelledDeparture(tx, actor.appUserId, held.employeeId, today)
          : 'WORKING';
      await this.history.setEmployeeWorkState(tx, held.employeeId, resumed);
      const cancelled = await this.repo.cancel(tx, held.id, { appUserId: actor.appUserId, reason });
      const selfExecuted = selfMode === 'ALLOW_SELF_EXECUTED';
      await this.repo.insertChange(tx, {
        caseId: held.id,
        kind: 'CANCELLED',
        oldLastWorkingDay: held.lastWorkingDay,
        reason,
        detail: { workState: resumed },
        changedByAppUserId: actor.appUserId,
        selfExecuted,
      });
      await this.audit.changed(
        tx,
        actor,
        held,
        'OFFBOARDING_CASE.CANCELLED',
        { state: 'HANDING_OVER', lastWorkingDay: held.lastWorkingDay },
        { state: 'CANCELLED', reason, workState: resumed },
        selfExecuted,
      );
      await this.hooks.onCancelled(tx, {
        fileKind: 'OFFBOARDING',
        fileId: held.id,
        employeeId: held.employeeId,
        dueOn: held.departureEffectiveOn,
      });

      return cancelled;
    });
  }

  /** Who followed the head before the move, so a move that names nobody keeps the choice (`US-03-04` AC-22). */
  private previousChoice(held: OffboardingRecord): SuccessorChoice | undefined {
    const handover = held.headHandover;
    if (!handover) return undefined;

    return handover.successorEmployeeId
      ? { kind: 'EMPLOYEE', employeeId: handover.successorEmployeeId }
      : { kind: 'NONE' };
  }

  private successorOf(record: OffboardingRecord): string | null {
    return record.headHandover ? (record.headHandover.successorEmployeeId ?? 'NONE') : null;
  }
}
