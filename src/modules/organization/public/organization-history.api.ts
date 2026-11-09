import { Injectable } from '@nestjs/common';
import { BusinessDate } from '../../../core/business-date';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { AnnounceDueResult, OrganizationChangeService } from '../change-announcement/organization-change.service';
import { DepartmentRecordService } from '../department/department-record.service';
import { HeadAssignmentError } from '../department/department.errors';
import { EmployeeRecordService } from '../employee/employee-record.service';
import { toBrief } from '../organization-brief.mapper';
import { HeadHandoverRefusedError } from './organization.errors';
import { OrganizationReadApi } from './organization-read.api';
import type {
  DepartmentBrief,
  EmployeeWorkState,
  HeadHandoverInput,
  HeadHandoverRecord,
  HeadOnDateQuery,
  HeadPeriodOfEmployee,
  PlacementInForce,
  ScheduledStructureChange,
  StructureChangeInput,
} from './organization.types';

/**
 * The second public contract of the organization (ADR-0017): the writes of history that the personnel flows make, in their
 * own transaction. A placement or a head period is written for the day it takes effect, ahead of time, so every read by day
 * is right from midnight of it; what is dated for a day to come can still be moved or taken back until the day comes. A
 * change dated for today is told to the listeners in the same transaction, the others by the hourly sweep. The caller
 * holds the locks of the protocol (departments in id order, then the employee) and decides what the change is allowed to be;
 * the database refuses what cannot be (two placements meeting, a head who is not a member, a retired department).
 */
@Injectable()
export class OrganizationHistoryApi {
  constructor(
    private readonly organizationReads: OrganizationReadApi,
    private readonly employees: EmployeeRecordService,
    private readonly departments: DepartmentRecordService,
    private readonly changes: OrganizationChangeService,
  ) {}

  /**
   * Locks the departments in id order, whatever order they are named in (`FOR UPDATE` for those that will have a head period
   * moved, `FOR SHARE` for the rest), and gives what they are; a department that does not exist is absent.
   */
  async lockDepartments(
    tx: DbTx,
    departments: { updateIds: readonly string[]; shareIds: readonly string[] },
  ): Promise<Map<string, DepartmentBrief>> {
    const update = new Set(departments.updateIds);
    const ids = [...new Set([...departments.updateIds, ...departments.shareIds])].sort();
    const locked = new Map<string, DepartmentBrief>();
    for (const id of ids) {
      const record = update.has(id)
        ? await this.departments.lockForUpdate(tx, id)
        : await this.departments.lockShared(tx, id);
      const brief = toBrief(record);
      if (brief) locked.set(id, brief);
    }

    return locked;
  }

  /** Ends the placement in force on the day and begins the new one from it; told at once when the day is today or past. */
  async scheduleStructureChange(tx: DbTx, input: StructureChangeInput): Promise<ScheduledStructureChange> {
    const scheduled = await this.employees.scheduleStructureChange(tx, input);
    if (input.effectiveOn <= (await this.organizationReads.businessToday(new Date(), tx))) {
      await this.changes.emit(tx, {
        kind: 'PLACEMENT_START',
        placementId: scheduled.openedPlacementId,
        employeeId: input.employeeId,
        fromDepartmentId: scheduled.from.departmentId,
        toDepartmentId: input.departmentId,
        effectiveOn: input.effectiveOn,
      });
    }

    return scheduled;
  }

  /**
   * The placement of the person in force on `onDate`, with the days it covers, read in the caller's transaction (what a change
   * of the day needs to judge the new day against); null when there is none.
   */
  getPlacementInForce(tx: DbTx, employeeId: string, onDate: BusinessDate): Promise<PlacementInForce | null> {
    return this.employees.placementInForce(tx, employeeId, onDate);
  }

  /** The first day of a placement the caller wrote earlier; null when it is gone. */
  getPlacementStart(tx: DbTx, placementId: string): Promise<BusinessDate | null> {
    return this.employees.placementStart(tx, placementId);
  }

  /**
   * Takes back a change that has not taken effect: the placement it ended is open again. */
  cancelStructureChange(
    tx: DbTx,
    scheduled: Pick<ScheduledStructureChange, 'closedPlacementId' | 'openedPlacementId'>,
  ): Promise<void> {
    return this.employees.cancelStructureChange(tx, scheduled);
  }

  /**
   * Ends the period in which the person heads the department from the day and, when `successorEmployeeId` is given, opens the
   * successor's from it for what remained of the term; with none, the department has no head from the day (`INV-19`).
   * Null when the person does not head the department across the day. The caller holds the department `FOR UPDATE` and has
   * checked the successor; the head is ended before the placement is closed.
   */
  async scheduleHeadHandover(tx: DbTx, input: HeadHandoverInput): Promise<HeadHandoverRecord | null> {
    const ended = await this.departments.endHeadPeriodOf(
      tx,
      input.departmentId,
      input.outgoingEmployeeId,
      input.effectiveOn,
    );
    if (!ended) return null;
    const created = input.successorEmployeeId
      ? await this.openSuccessor(tx, { ...input, successorEmployeeId: input.successorEmployeeId }, ended.endedBefore)
      : null;
    if (input.effectiveOn <= (await this.organizationReads.businessToday(new Date(), tx))) {
      await this.changes.emit(tx, {
        kind: 'HEAD_PERIOD_END',
        periodId: ended.periodId,
        departmentId: input.departmentId,
        headEmployeeId: input.outgoingEmployeeId,
        effectiveOn: input.effectiveOn,
      });
      if (created && input.successorEmployeeId) {
        await this.changes.emit(tx, {
          kind: 'HEAD_PERIOD_START',
          periodId: created.periodId,
          departmentId: input.departmentId,
          headEmployeeId: input.successorEmployeeId,
          previousHeadEmployeeId: input.outgoingEmployeeId,
          effectiveOn: input.effectiveOn,
        });
      }
    }

    return {
      endedPeriodId: ended.periodId,
      endedPeriodValidTo: ended.endedBefore,
      createdPeriodId: created?.periodId ?? null,
    };
  }

  private async openSuccessor(
    tx: DbTx,
    input: HeadHandoverInput & { successorEmployeeId: string },
    validTo: BusinessDate | null,
  ): Promise<{ periodId: string }> {
    try {
      return await this.departments.startHeadPeriod(tx, {
        organizationId: input.organizationId,
        departmentId: input.departmentId,
        employeeId: input.successorEmployeeId,
        validFrom: input.effectiveOn,
        validTo,
      });
    } catch (error) {
      if (error instanceof HeadAssignmentError) {
        throw new HeadHandoverRefusedError(
          error.problem === 'HEADS_ANOTHER_DEPARTMENT' ? 'HEADS_ANOTHER_DEPARTMENT' : 'NOT_A_MEMBER_ON_DATE',
        );
      }
      throw error;
    }
  }

  /** Takes back a handover that has not taken effect: the successor's period is removed and the head's goes back to where it ended. */
  async undoScheduledHeadHandover(tx: DbTx, handover: HeadHandoverRecord): Promise<void> {
    if (handover.createdPeriodId) await this.departments.deleteHeadPeriod(tx, handover.createdPeriodId);
    await this.departments.restoreHeadPeriodEnd(tx, handover.endedPeriodId, handover.endedPeriodValidTo);
  }

  /** Moves a handover that has not taken effect to another day (and another successor): takes it back and writes it again. */
  async shiftScheduledHeadHandover(
    tx: DbTx,
    handover: HeadHandoverRecord,
    input: HeadHandoverInput,
  ): Promise<HeadHandoverRecord | null> {
    await this.undoScheduledHeadHandover(tx, handover);

    return this.scheduleHeadHandover(tx, input);
  }

  /**
   * Who heads each department on the day asked, one read for any number of pairs: the key is `<departmentId>|<day>` and the value
   * the head's employee id; a department nobody heads that day is absent. The handover confirmation reads it for the people a duty
   * falls to, which may be a successor not yet in office.
   */
  getHeadsOnDates(queries: readonly HeadOnDateQuery[], tx?: DbTx): Promise<Map<string, string>> {
    return this.departments.headsOnDates(queries, tx);
  }

  /** The active departments each of these employees is named IT Admin in charge of, by employee id, in one read (`US-03-04` AC-11). */
  async getDepartmentsInChargeOf(
    employeeIds: readonly string[],
    tx?: DbTx,
  ): Promise<Map<string, { id: string; code: string }[]>> {
    const rows = employeeIds.length === 0 ? [] : await this.departments.inChargeOfMany(employeeIds, tx);
    const byEmployee = new Map<string, { id: string; code: string }[]>();
    for (const row of rows) {
      if (row.itAdminEmployeeId)
        byEmployee.set(row.itAdminEmployeeId, [
          ...(byEmployee.get(row.itAdminEmployeeId) ?? []),
          { id: row.id, code: row.code },
        ]);
    }

    return byEmployee;
  }

  /** The periods in which the employee heads (or will head) a department that have not ended by `from`. */
  getHeadPeriodsOf(employeeId: string, from: BusinessDate, tx?: DbTx): Promise<HeadPeriodOfEmployee[]> {
    return this.departments.headPeriodsOf(employeeId, from, tx);
  }

  /** Moves the work state of an employee the caller holds `FOR UPDATE`; the database refuses a step off the graph. */
  setEmployeeWorkState(tx: DbTx, employeeId: string, workState: EmployeeWorkState): Promise<void> {
    return this.employees.setWorkState(tx, employeeId, workState);
  }

  /**
   * Ends the open placement of a person who leaves on `endsOn`, the first day they are no longer a member (their last working day
   * plus one), written ahead like a transfer: every read by day is right from midnight of it. The head of the department is handed
   * over before this is called, never after. Moving the day or cancelling is `cancelDepartureEnd` and a new `scheduleDepartureEnd`.
   */
  scheduleDepartureEnd(
    tx: DbTx,
    employeeId: string,
    endsOn: BusinessDate,
  ): Promise<{ closedPlacementId: string; departmentId: string; validFrom: BusinessDate }> {
    return this.employees.scheduleDepartureEnd(tx, employeeId, endsOn);
  }

  /** Takes back the end of a placement written for a handover that has not taken effect: it is open again. */
  cancelDepartureEnd(tx: DbTx, placementId: string): Promise<void> {
    return this.employees.cancelDepartureEnd(tx, placementId);
  }

  /**
   * The person has left: `TERMINATED` (the database makes the work state `LEFT` with it, and the sign-in and the guard refuse them
   * from the next action), and the listeners are told once (`EMPLOYEE_LEFT`, `effectiveOn` the day they left). The caller holds the
   * employee `FOR UPDATE`.
   */
  async markEmployeeLeft(tx: DbTx, employeeId: string, leftOn: BusinessDate): Promise<void> {
    await this.employees.markLeft(tx, employeeId);
    await this.changes.emit(tx, { kind: 'EMPLOYEE_LEFT', employeeId, effectiveOn: leftOn });
  }

  /** One pass of the sweep for today (or `today`): tells the listeners of the changes that took effect and were not told. */
  async announceDueChanges(today?: BusinessDate): Promise<AnnounceDueResult> {
    return this.changes.announceDue(today ?? (await this.organizationReads.businessToday()));
  }
}
