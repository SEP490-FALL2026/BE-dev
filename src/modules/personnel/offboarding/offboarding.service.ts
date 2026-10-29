import { Injectable } from '@nestjs/common';
import { addDays, type BusinessDate } from '../../../core/business-date';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import { isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import { OrganizationHistoryApi } from '../../organization/public/organization-history.api';
import { EmployeeNotFoundError } from '../../organization/public/organization.errors';
import { OrganizationApi } from '../../organization/public/organization.api';
import { PersonnelNotifier } from '../event-notice/personnel-notifier.service';
import { LeaveDepartureService } from '../leave/leave-departure.service';
import { groundsSnapshot, normalizedGrounds } from '../policies/grounds.policy';
import { PersonnelFileHooks } from '../event-notice/personnel-file-hooks.service';
import { actorColumns, type PersonnelActor } from '../public/personnel.types';
import { TransferChangeService } from '../transfer/transfer-change.service';
import { TransferGuardService } from '../transfer/transfer-guard.service';
import { OffboardingAuditService } from './offboarding-audit.service';
import { OffboardingFrame } from './offboarding-frame.service';
import { OffboardingHandoverService } from './offboarding-handover.service';
import { OffboardingLeftService } from './offboarding-left.service';
import { OffboardingPeriodsService } from './offboarding-periods.service';
import { OffboardingRefusedError } from './offboarding.errors';
import { departureEffectiveOn, recordRefusal } from './offboarding.policy';
import { OffboardingRepo } from './offboarding.repo';
import type { OffboardingRecord, PriorWorkState, RecordOffboardingInput } from './offboarding.types';

/**
 * Records a person who leaves: a planned handover with the last working day and the basis it rests on, or an abrupt departure that
 * is `LEFT` at once (`US-03-04` AC-2, AC-8, AC-18, AC-19, AC-23, AC-29, `US-03-03` AC-6, `US-03-01` AC-21). One transaction under the
 * locks of the protocol (the departments by id, the employee, a chosen successor, the accounts): the transfer that would still wait
 * is cancelled, a long leave ends, the head of the department the person leaves is handed over (never a reason to refuse, `QĐ-77k`),
 * the placement ends the day after the last working day, and the confirmation of the handover is opened for every tool. No seat is
 * taken away and no task is made here (`AC-5`).
 */
@Injectable()
export class OffboardingService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly organization: OrganizationApi,
    private readonly history: OrganizationHistoryApi,
    private readonly guard: TransferGuardService,
    private readonly transfers: TransferChangeService,
    private readonly leaves: LeaveDepartureService,
    private readonly periods: OffboardingPeriodsService,
    private readonly handovers: OffboardingHandoverService,
    private readonly left: OffboardingLeftService,
    private readonly frame: OffboardingFrame,
    private readonly repo: OffboardingRepo,
    private readonly audit: OffboardingAuditService,
    private readonly hooks: PersonnelFileHooks,
    private readonly notifier: PersonnelNotifier,
  ) {}

  /** Throws OffboardingRefusedError for everything the policy or the database refuses, and PersonnelAccessRefusedError for the actor. */
  record(actor: PersonnelActor, input: RecordOffboardingInput): Promise<OffboardingRecord> {
    this.guard.requireWriter(actor, input.employeeId);

    return this.frame.guarded(() => this.runner.run((tx) => this.recordInTx(tx, actor, input)));
  }

  /** The same in the transaction of the caller (the write that starts from a notice of the head, or from the controlled procedure). */
  async recordInTx(tx: DbTx, actor: PersonnelActor, input: RecordOffboardingInput): Promise<OffboardingRecord> {
    this.guard.requireWriter(actor, input.employeeId);
    const organization = await this.guard.requireOrganization();
    const today = await this.organization.businessToday(new Date(), tx);

    // What the person is now, read before the locks so they can be taken in the order of the protocol.
    const seen = await this.organization.getEmployee(input.employeeId, tx);
    if (!seen) throw new OffboardingRefusedError('EMPLOYEE_NOT_FOUND');
    if (seen.status === 'TERMINATED' || seen.workState === 'LEFT') throw new OffboardingRefusedError('EMPLOYEE_LEFT');
    if (seen.workState === 'HANDING_OVER') throw new OffboardingRefusedError('ALREADY_HANDING_OVER');
    if (input.lastWorkingDay === undefined) throw new OffboardingRefusedError('LAST_WORKING_DAY_REQUIRED');
    const before = await this.history.getPlacementInForce(tx, input.employeeId, today);
    if (!before) throw new OffboardingRefusedError('PLACEMENT_OVERLAP', { reason: 'NO_OPEN_PLACEMENT' });
    const endsOn = departureEffectiveOn({
      lastWorkingDay: input.lastWorkingDay,
      abrupt: input.abrupt,
      today,
      placementFrom: before.validFrom,
    });
    const lastInOffice = addDays(endsOn, -1);
    const headsAt = async (): Promise<boolean> =>
      (await this.organization.getHeadedDepartment(input.employeeId, lastInOffice))?.departmentId ===
      before.departmentId;
    const leavesAsHead = await headsAt();
    const waiting = await this.transfers.peekPendingOf(tx, input.employeeId);

    // Locks: the departments by id, then the employee (and a chosen successor), then the accounts.
    await this.history.lockDepartments(tx, {
      updateIds: leavesAsHead ? [before.departmentId] : [],
      shareIds: [before.departmentId, ...(waiting ? [waiting.toDepartmentId] : [])],
    });
    await this.organization.lockEmployeeForUpdate(tx, input.employeeId);
    if (leavesAsHead && input.successor?.kind === 'EMPLOYEE') await this.lockSuccessor(tx, input.successor.employeeId);
    await this.guard.requireOperatorSubject(tx, actor, input.employeeId);

    const employee = await this.organization.getEmployee(input.employeeId, tx);
    const current = await this.history.getPlacementInForce(tx, input.employeeId, today);
    if (!employee || !current || current.placementId !== before.placementId)
      throw new OffboardingRefusedError('CONCURRENT_CHANGE');
    if ((await headsAt()) !== leavesAsHead) throw new OffboardingRefusedError('CONCURRENT_CHANGE');
    const pending = await this.transfers.pendingOf(tx, input.employeeId, today);
    if (pending?.id !== waiting?.id) throw new OffboardingRefusedError('CONCURRENT_CHANGE');

    const refusal = recordRefusal({
      today,
      hireDate: employee.hireDate,
      placementFrom: current.validFrom,
      lastWorkingDay: input.lastWorkingDay,
      abrupt: input.abrupt,
      employee: { status: employee.status, workState: employee.workState },
      grounds: input.grounds,
      pendingTransfer: pending && { effectiveOn: pending.effectiveOn },
      transferCancellationReason: input.pendingTransferCancellation?.reason,
      namedAsSuccessor: await this.repo.isNamedSuccessorOfPendingTransfer(tx, input.employeeId),
      successor: leavesAsHead
        ? await this.guard.judgeSuccessor(tx, {
            chosen: input.successor,
            leaverId: input.employeeId,
            departmentId: before.departmentId,
            day: endsOn,
          })
        : null,
    });
    if (refusal) throw new OffboardingRefusedError(refusal.code, refusal.details);
    const grounds = normalizedGrounds(input.grounds ?? {});
    const by = actorColumns(actor);

    if (pending) await this.cancelWaitingTransfer(tx, actor, pending.id, input, today);
    // A leave that runs ends the day the handover is recorded, so the days of handover are not days of leave (`US-03-03` AC-6).
    if (employee.workState === 'ON_LONG_LEAVE') await this.leaves.endForDeparture(tx, actor, input.employeeId, today);
    const scheduled = await this.periods.schedule(tx, {
      organizationId: organization.id,
      employeeId: input.employeeId,
      departmentId: before.departmentId,
      endsOn,
      leavesAsHead,
      successor: input.successor,
    });
    if (!input.abrupt) await this.history.setEmployeeWorkState(tx, input.employeeId, 'HANDING_OVER');

    const handoverDueOn = input.abrupt ? null : await this.handovers.plannedDueOn(input.lastWorkingDay);
    const record = await this.insertCase(
      tx,
      {
        organizationId: organization.id,
        employeeId: input.employeeId,
        departmentId: before.departmentId,
        abrupt: input.abrupt,
        priorWorkState: employee.workState as PriorWorkState,
        lastWorkingDay: input.lastWorkingDay,
        departureEffectiveOn: endsOn,
        handoverDueOn,
        grounds,
        headHandover: scheduled.headHandover,
        placementClosedId: scheduled.placementClosedId,
        recordedByAppUserId: by.appUserId,
        recordedByTicketId: by.ticketId,
        noticeId: input.noticeId ?? null,
      },
      input.abrupt ? { on: today, by: (await this.guard.standIn(tx, actor)).appUserId } : undefined,
    );

    await this.repo.insertChange(tx, {
      caseId: record.id,
      kind: 'RECORDED',
      newLastWorkingDay: record.lastWorkingDay,
      detail: {
        abrupt: record.abrupt,
        departureEffectiveOn: endsOn,
        headSuccessor: scheduled.headHandover ? (scheduled.headHandover.successorEmployeeId ?? 'NONE') : null,
        transferCancelled: pending?.id ?? null,
      },
      changedByAppUserId: by.appUserId,
      changedByTicketId: by.ticketId,
    });
    await this.audit.changed(tx, actor, record, 'OFFBOARDING_CASE.RECORDED', null, {
      employeeCode: employee.employeeCode,
      abrupt: record.abrupt,
      lastWorkingDay: record.lastWorkingDay,
      departureEffectiveOn: endsOn,
      handoverDueOn: record.handoverDueOn,
      grounds: groundsSnapshot(grounds),
      headSuccessor: scheduled.headHandover ? (scheduled.headHandover.successorEmployeeId ?? 'NONE') : null,
      departmentWithoutHeadFrom:
        scheduled.headHandover && scheduled.headHandover.successorEmployeeId === null ? endsOn : null,
      transferCancelled: pending?.id ?? null,
    });
    await this.audit.employeeInformed(tx, actor, record);
    await this.hooks.onRecorded(tx, {
      fileKind: 'OFFBOARDING',
      fileId: record.id,
      employeeId: record.employeeId,
      dueOn: record.departureEffectiveOn,
    });
    await this.handovers.open(tx, actor, record, { leaverIsHead: leavesAsHead, today });
    if (input.abrupt) {
      await this.left.leaveInTx(tx, actor, record, today, 'RECORDING');
      await this.notifier.abruptDeparture(tx, {
        organizationId: organization.id,
        employeeId: record.employeeId,
        departmentId: record.departmentId,
        caseId: record.id,
        effectiveOn: record.departureEffectiveOn,
        lastDayInOffice: addDays(record.departureEffectiveOn, -1),
      });
    }
    await this.notifier.eventRecorded(tx, {
      organizationId: organization.id,
      employeeId: record.employeeId,
      departmentId: record.departmentId,
      eventKind: 'DEPARTURE_RECORDED',
      eventId: record.id,
      subjectType: 'OFFBOARDING_CASE',
      effectiveOn: record.departureEffectiveOn,
    });

    return (await this.repo.find(record.id, tx)) ?? record;
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
      { reason: input.pendingTransferCancellation?.reason ?? '', grounds: input.grounds },
      today,
    );
    if (refused) throw new OffboardingRefusedError('PENDING_EVENT_EXISTS', { kind: 'TRANSFER', reason: refused.code });
  }

  private async insertCase(
    tx: DbTx,
    input: Parameters<OffboardingRepo['insert']>[1],
    left: { on: BusinessDate; by: string } | undefined,
  ): Promise<OffboardingRecord> {
    try {
      return await this.repo.insert(tx, input, left ? 'LEFT' : 'HANDING_OVER', left);
    } catch (error) {
      if (isUniqueViolation(error, 'offboarding_cases_one_live_per_employee', 'employee_id'))
        throw new OffboardingRefusedError('ALREADY_HANDING_OVER');
      throw error;
    }
  }

  /** Takes the successor row `FOR SHARE`; one that does not exist is judged by the policy, not here. */
  private async lockSuccessor(tx: DbTx, employeeId: string): Promise<void> {
    try {
      await this.organization.lockEmployeeForShare(tx, employeeId);
    } catch (error) {
      if (!(error instanceof EmployeeNotFoundError)) throw error;
    }
  }
}
