import { Injectable } from '@nestjs/common';
import { addDays, type BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import { OrganizationApi } from '../../organization/public/organization.api';
import { PersonnelNotifier } from '../event-notice/personnel-notifier.service';
import { PersonnelFileHooks } from '../event-notice/personnel-file-hooks.service';
import { groundsSnapshot, normalizedGrounds } from '../personnel-grounds.policy';
import { actorColumns, type PersonnelActor } from '../public/personnel.types';
import { TransferGuardService } from '../transfer/transfer-guard.service';
import { headSuccessorLabel } from '../transfer/transfer.policy';
import { OffboardingAuditService } from './offboarding-audit.service';
import { OffboardingHandoverService } from './offboarding-handover.service';
import { OffboardingLeftService } from './offboarding-left.service';
import type { ScheduledDeparture } from './offboarding-periods.service';
import type { DepartureHeld, DepartureSeen } from './offboarding-preconditions.service';
import { OffboardingRefusedError } from './offboarding.errors';
import { departmentWithoutHeadFrom, leavesAtOnce } from './offboarding.policy';
import { OffboardingRepo } from './offboarding.repo';
import type { OffboardingRecord, PriorWorkState, RecordOffboardingInput } from './offboarding.types';

/** What the departure that was ended leaves behind: the case, its first change and the audit, then the file, the handover and the notices. */
export interface DepartureWritten {
  seen: DepartureSeen;
  held: DepartureHeld;
  scheduled: ScheduledDeparture;
  organizationId: string;
  today: BusinessDate;
}

/**
 * Writes the case of a departure and what follows it, in one transaction after the endings (`US-03-04` AC-2, AC-8, AC-23, AC-29): the
 * row (one blocked now with a last working day that is not ahead is `LEFT` at once), its first change, the audit entries, the hook of the file, the confirmation of the handover
 * for every tool, and the notices. Returns the case as it is read back, with what the database filled in.
 */
@Injectable()
export class OffboardingCaseWriter {
  constructor(
    private readonly repo: OffboardingRepo,
    private readonly audit: OffboardingAuditService,
    private readonly hooks: PersonnelFileHooks,
    private readonly handovers: OffboardingHandoverService,
    private readonly left: OffboardingLeftService,
    private readonly notifier: PersonnelNotifier,
    private readonly guard: TransferGuardService,
    private readonly organization: OrganizationApi,
  ) {}

  async write(
    tx: DbTx,
    actor: PersonnelActor,
    input: RecordOffboardingInput,
    written: DepartureWritten,
  ): Promise<OffboardingRecord> {
    const record = await this.insertCase(tx, actor, input, written);
    if (written.seen.cancelledPlacement) {
      await this.organization.cancelScheduledFirstPlacement(tx, written.seen.cancelledPlacement.placementId);
      await this.audit.firstPlacementCancelled(
        tx,
        actor,
        written.organizationId,
        input.employeeId,
        {
          departmentId: written.seen.cancelledPlacement.departmentId,
          effectiveFrom: written.seen.cancelledPlacement.validFrom,
        },
        record.id,
      );
    }
    await this.recordChange(tx, actor, input, { ...written, record });
    await this.announce(tx, actor, input, { ...written, record });

    return (await this.repo.find(record.id, tx)) ?? record;
  }

  private async insertCase(
    tx: DbTx,
    actor: PersonnelActor,
    input: RecordOffboardingInput,
    written: DepartureWritten,
  ): Promise<OffboardingRecord> {
    const blockNow = input.accessBlockMode === 'BLOCK_NOW';
    const plannedDue = blockNow ? null : await this.handovers.plannedDueOn(input.lastWorkingDay as BusinessDate);
    const row = this.buildCaseRow(actor, input, written, plannedDue);
    // The day the person left is their last working day, also when it is recorded afterwards (`Q-04` B).
    const left = this.leavesAtOnce(input, written)
      ? { on: input.lastWorkingDay as BusinessDate, by: (await this.guard.standIn(tx, actor)).appUserId }
      : undefined;
    try {
      return await this.repo.insert(tx, row, left ? 'LEFT' : 'HANDING_OVER', left);
    } catch (error) {
      if (isUniqueViolation(error, 'offboarding_cases_one_live_per_employee', 'employee_id'))
        throw new OffboardingRefusedError('ALREADY_HANDING_OVER');
      throw error;
    }
  }

  private buildCaseRow(
    actor: PersonnelActor,
    input: RecordOffboardingInput,
    written: DepartureWritten,
    handoverDueOn: BusinessDate | null,
  ): Parameters<OffboardingRepo['insert']>[1] {
    const { seen, held, scheduled } = written;
    const by = actorColumns(actor);
    const cancelled = seen.cancelledPlacement;

    return {
      organizationId: written.organizationId,
      employeeId: input.employeeId,
      departmentId: seen.before ? seen.before.departmentId : null,
      accessBlockMode: input.accessBlockMode,
      priorWorkState: held.employee.workState as PriorWorkState,
      lastWorkingDay: input.lastWorkingDay as BusinessDate,
      departureEffectiveOn: seen.endsOn,
      handoverDueOn,
      grounds: normalizedGrounds(input.grounds ?? {}),
      headHandover: scheduled.headHandover,
      placementClosedId: scheduled.placementClosedId,
      cancelledPlacementId: cancelled?.placementId ?? null,
      cancelledPlacementDepartmentId: cancelled?.departmentId ?? null,
      cancelledPlacementFrom: cancelled?.validFrom ?? null,
      recordedByAppUserId: by.appUserId,
      recordedByTicketId: by.ticketId,
      noticeId: input.noticeId ?? null,
    };
  }

  /** The first change of the case and the audit entries (the employee is told, too). */
  private async recordChange(
    tx: DbTx,
    actor: PersonnelActor,
    input: RecordOffboardingInput,
    done: DepartureWritten & { record: OffboardingRecord },
  ): Promise<void> {
    const { record, scheduled, seen, held } = done;
    const by = actorColumns(actor);
    const headSuccessor = headSuccessorLabel(scheduled.headHandover);
    const transferCancelled = held.pending?.id ?? null;

    await this.repo.insertChange(tx, {
      caseId: record.id,
      kind: 'RECORDED',
      newLastWorkingDay: record.lastWorkingDay,
      detail: {
        accessBlockMode: record.accessBlockMode,
        departureEffectiveOn: seen.endsOn,
        headSuccessor,
        transferCancelled,
      },
      changedByAppUserId: by.appUserId,
      changedByTicketId: by.ticketId,
    });
    await this.audit.changed(tx, actor, record, 'OFFBOARDING_CASE.RECORDED', null, {
      employeeCode: held.employee.employeeCode,
      accessBlockMode: record.accessBlockMode,
      lastWorkingDay: record.lastWorkingDay,
      departureEffectiveOn: seen.endsOn,
      handoverDueOn: record.handoverDueOn,
      grounds: groundsSnapshot(normalizedGrounds(input.grounds ?? {})),
      headSuccessor,
      departmentWithoutHeadFrom: departmentWithoutHeadFrom(scheduled.headHandover, seen.endsOn),
      transferCancelled,
    });
    await this.audit.employeeInformed(tx, actor, record);
  }

  private leavesAtOnce(input: RecordOffboardingInput, written: { today: BusinessDate }): boolean {
    return leavesAtOnce({
      accessBlockMode: input.accessBlockMode,
      lastWorkingDay: input.lastWorkingDay as BusinessDate,
      today: written.today,
    });
  }

  /** The hook of the file, the confirmation of the handover, the leaving of a departure blocked now, and the notices. */
  private async announce(
    tx: DbTx,
    actor: PersonnelActor,
    input: RecordOffboardingInput,
    done: DepartureWritten & { record: OffboardingRecord },
  ): Promise<void> {
    const { record, seen, today } = done;
    const { organizationId } = done;
    await this.hooks.onRecorded(tx, {
      fileKind: 'OFFBOARDING',
      fileId: record.id,
      employeeId: record.employeeId,
      dueOn: record.departureEffectiveOn,
    });
    if (seen.before) await this.handovers.open(tx, actor, record, { leaverIsHead: seen.leavesAsHead, today });
    const leftAtOnce = this.leavesAtOnce(input, done);
    if (input.accessBlockMode === 'WITH_LAST_DAY') {
      // From the day after the last working day the person is refused, whatever the state of the case (QĐ-100q).
      await this.handovers.blockAccessAfterLastDay(tx, record);
    } else if (!leftAtOnce) {
      // Blocked now with a last working day still ahead: refused from the next request, while the case is a handover under way.
      await this.handovers.blockAccessNow(tx, record, today);
    }
    if (leftAtOnce) await this.left.leaveInTx(tx, actor, record, record.lastWorkingDay, 'RECORDING');
    if (input.accessBlockMode === 'BLOCK_NOW') {
      await this.notifier.abruptDeparture(tx, {
        organizationId,
        employeeId: record.employeeId,
        departmentId: record.departmentId,
        caseId: record.id,
        effectiveOn: record.departureEffectiveOn,
        lastDayInOffice: addDays(record.departureEffectiveOn, -1),
      });
    }
    const alsoDepartmentIds = seen.cancelledPlacement ? [seen.cancelledPlacement.departmentId] : undefined;
    await this.notifier.eventRecorded(tx, {
      organizationId,
      employeeId: record.employeeId,
      departmentId: record.departmentId,
      alsoDepartmentIds,
      eventKind: 'DEPARTURE_RECORDED',
      eventId: record.id,
      subjectType: 'OFFBOARDING_CASE',
      effectiveOn: record.departureEffectiveOn,
    });
  }
}
