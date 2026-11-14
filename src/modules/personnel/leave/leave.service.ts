import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import { isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationHistoryApi } from '../../organization/public/organization-history.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { PersonnelNotifier, type PersonnelEventKind } from '../event-notice/personnel-notifier.service';
import { groundsSnapshot, normalizedGroundsNote } from '../personnel-grounds.policy';
import { personnelAuditEvent } from '../personnel-audit-event.mapper';
import { actorColumns, type PersonnelActor } from '../public/personnel.types';
import { TransferGuardService } from '../transfer/transfer-guard.service';
import { LeaveRefusedError } from './leave.errors';
import {
  changeReturnDateRefusal,
  confirmReturnRefusal,
  isOnSchedule,
  startLeaveRefusal,
  type LeaveRefusal,
} from './leave.policy';
import { LeaveRepo } from './leave.repo';
import type { ChangeReturnDateInput, ConfirmReturnInput, LeaveRecord, StartLeaveInput } from './leave.types';

/**
 * The three writes a long leave has (`US-03-03` AC-5, AC-7, AC-8): it begins with the day the person is due back and the basis of
 * that day, the day moves on a new basis, and the person is recorded back (on the approved day without a new document, on any other
 * day with one). One transaction for each, under the lock of the employee; the work state of the person moves with it through the
 * organization. Only the Super Admin writes them, never about themselves; the controlled procedure writes them for the Super Admin
 * with a ticket. Everyone concerned is told in the same transaction. Nothing here changes by the calendar: a
 * late return is only told (`LeaveOverdueService`). The reason for a leave is never asked for nor kept.
 */
@Injectable()
export class LeaveService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly organization: OrganizationApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly history: OrganizationHistoryApi,
    private readonly guard: TransferGuardService,
    private readonly leaves: LeaveRepo,
    private readonly audit: AuditApi,
    private readonly notifier: PersonnelNotifier,
  ) {}

  /** Throws LeaveRefusedError for everything the policy or the database refuses, and PersonnelAccessRefusedError for the actor. */
  start(actor: PersonnelActor, input: StartLeaveInput): Promise<LeaveRecord> {
    this.guard.requireWriter(actor, input.employeeId);

    return this.runner.run((tx) => this.startInTx(tx, actor, input));
  }

  /** The same in the transaction of the caller (the write that starts from a notice of the head, or from the controlled procedure). */
  async startInTx(tx: DbTx, actor: PersonnelActor, input: StartLeaveInput): Promise<LeaveRecord> {
    this.guard.requireWriter(actor, input.employeeId);
    const organization = await this.requireOrganization();
    const today = await this.organizationReads.businessToday(new Date(), tx);
    if (!(await this.organizationReads.getEmployee(input.employeeId, tx)))
      throw new LeaveRefusedError('EMPLOYEE_NOT_FOUND');
    await this.organization.lockEmployeeForUpdate(tx, input.employeeId);
    await this.guard.requireOperatorSubject(tx, actor, input.employeeId);
    const employee = await this.organizationReads.getEmployee(input.employeeId, tx);
    if (!employee) throw new LeaveRefusedError('EMPLOYEE_NOT_FOUND');

    refuse(
      startLeaveRefusal({
        today,
        startedOn: input.startedOn,
        approvedReturnOn: input.approvedReturnOn,
        hireDate: employee.hireDate,
        employee: { status: employee.status, workState: employee.workState },
        groundsNote: input.groundsNote,
      }),
    );
    const grounds = normalizedGroundsNote(input.groundsNote ?? '');
    const by = actorColumns(actor);
    await this.history.setEmployeeWorkState(tx, input.employeeId, 'ON_LONG_LEAVE');
    const leave = await this.insertLeave(tx, {
      organizationId: organization.id,
      employeeId: input.employeeId,
      startedOn: input.startedOn,
      approvedReturnOn: input.approvedReturnOn,
      resumesLeaveId: null,
      grounds,
      startedByAppUserId: by.appUserId,
      startedByTicketId: by.ticketId,
      noticeId: input.noticeId ?? null,
    });
    await this.leaves.insertChange(tx, {
      leaveId: leave.id,
      kind: 'STARTED',
      newReturnOn: input.approvedReturnOn,
      grounds,
      recordedByAppUserId: by.appUserId,
      recordedByTicketId: by.ticketId,
    });
    await this.audit.record(
      tx,
      personnelAuditEvent(
        actor,
        organization.id,
        'LONG_LEAVE.STARTED',
        'EmployeeLeave',
        leave.id,
        { employeeCode: employee.employeeCode, workState: employee.workState },
        {
          workState: 'ON_LONG_LEAVE',
          startedOn: input.startedOn,
          approvedReturnOn: input.approvedReturnOn,
          grounds: groundsSnapshot(grounds),
        },
      ),
    );
    await this.tell(tx, leave, 'LONG_LEAVE_STARTED', input.startedOn, today);

    return leave;
  }

  /**
   * The approved day of return moves, on a new basis; the old day and basis stay in the log. With `outer` it runs in the
   * transaction of the caller (the controlled procedure).
   */
  changeReturnDate(
    actor: PersonnelActor,
    leaveId: string,
    input: ChangeReturnDateInput,
    outer?: DbTx,
  ): Promise<LeaveRecord> {
    return this.inTransaction(actor, leaveId, outer, async (tx, { organizationId, leave, employeeCode, today }) => {
      refuse(
        changeReturnDateRefusal({
          today,
          status: leave.status,
          startedOn: leave.startedOn,
          approvedReturnOn: leave.approvedReturnOn,
          newApprovedReturnOn: input.newApprovedReturnOn,
          groundsNote: input.groundsNote,
        }),
      );
      const grounds = normalizedGroundsNote(input.groundsNote ?? '');
      const by = actorColumns(actor);
      const changed = await this.leaves.changeReturnDate(tx, leave.id, input.newApprovedReturnOn, grounds);
      await this.leaves.insertChange(tx, {
        leaveId: leave.id,
        kind: 'RETURN_DATE_CHANGED',
        oldReturnOn: leave.approvedReturnOn,
        newReturnOn: input.newApprovedReturnOn,
        grounds,
        recordedByAppUserId: by.appUserId,
        recordedByTicketId: by.ticketId,
      });
      await this.audit.record(
        tx,
        personnelAuditEvent(
          actor,
          organizationId,
          'LONG_LEAVE.RETURN_DATE_CHANGED',
          'EmployeeLeave',
          leave.id,
          { employeeCode, approvedReturnOn: leave.approvedReturnOn, grounds: groundsSnapshot(leave.grounds) },
          { approvedReturnOn: input.newApprovedReturnOn, grounds: groundsSnapshot(grounds) },
        ),
      );
      await this.tell(tx, changed, 'LONG_LEAVE_RETURN_DATE_CHANGED', input.newApprovedReturnOn, today);

      return changed;
    });
  }

  /** The person is back from `returnedOn`, with the basis in its box whatever the day (R-32); it is kept on the change `RETURNED`. */
  confirmReturn(actor: PersonnelActor, leaveId: string, input: ConfirmReturnInput, outer?: DbTx): Promise<LeaveRecord> {
    return this.inTransaction(actor, leaveId, outer, async (tx, { organizationId, leave, employeeCode, today }) => {
      refuse(
        confirmReturnRefusal({
          today,
          status: leave.status,
          startedOn: leave.startedOn,
          approvedReturnOn: leave.approvedReturnOn,
          returnedOn: input.returnedOn,
          groundsNote: input.groundsNote,
        }),
      );
      const onSchedule = isOnSchedule(input.returnedOn, leave.approvedReturnOn);
      const grounds = normalizedGroundsNote(input.groundsNote ?? '');
      const by = actorColumns(actor);
      const ended = await this.leaves.end(tx, leave.id, input.returnedOn, 'RETURNED');
      await this.history.setEmployeeWorkState(tx, leave.employeeId, 'WORKING');
      await this.leaves.insertChange(tx, {
        leaveId: leave.id,
        kind: 'RETURNED',
        returnedOn: input.returnedOn,
        onSchedule,
        grounds,
        recordedByAppUserId: by.appUserId,
        recordedByTicketId: by.ticketId,
      });
      await this.audit.record(
        tx,
        personnelAuditEvent(
          actor,
          organizationId,
          'LONG_LEAVE.RETURNED',
          'EmployeeLeave',
          leave.id,
          { employeeCode, workState: 'ON_LONG_LEAVE', approvedReturnOn: leave.approvedReturnOn },
          {
            workState: 'WORKING',
            returnedOn: input.returnedOn,
            onSchedule,
            grounds: groundsSnapshot(grounds),
          },
        ),
      );
      await this.tell(tx, ended, 'LONG_LEAVE_RETURNED', input.returnedOn, today);

      return ended;
    });
  }

  /** The installation's organization; a leave before installation is a programming error. */
  private async requireOrganization(): Promise<{ id: string }> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('A long leave was recorded before installation');

    return organization;
  }

  /**
   * The frame of the writes on a leave that exists: the leave read, then the employee locked, then the leave held and read again (the
   * lock protocol: the employee comes first), then the rule of the actor. A caller that already holds a transaction passes it.
   */
  private inTransaction<T>(
    actor: PersonnelActor,
    leaveId: string,
    outer: DbTx | undefined,
    work: (
      tx: DbTx,
      context: { organizationId: string; leave: LeaveRecord; employeeCode: string; today: BusinessDate },
    ) => Promise<T>,
  ): Promise<T> {
    const body = async (tx: DbTx): Promise<T> => {
      const organization = await this.requireOrganization();
      const today: BusinessDate = await this.organizationReads.businessToday(new Date(), tx);
      const seen = await this.leaves.find(leaveId, tx);
      if (!seen) throw new LeaveRefusedError('NOT_FOUND');
      this.guard.requireWriter(actor, seen.employeeId);
      await this.organization.lockEmployeeForUpdate(tx, seen.employeeId);
      await this.guard.requireOperatorSubject(tx, actor, seen.employeeId);
      const leave = await this.leaves.lock(tx, leaveId);
      if (!leave) throw new LeaveRefusedError('NOT_FOUND');
      const employee = await this.organizationReads.getEmployee(leave.employeeId, tx);

      return work(tx, { organizationId: organization.id, leave, employeeCode: employee?.employeeCode ?? '', today });
    };

    return outer ? body(outer) : this.runner.run(body);
  }

  private async insertLeave(tx: DbTx, input: Parameters<LeaveRepo['insert']>[1]): Promise<LeaveRecord> {
    try {
      return await this.leaves.insert(tx, input);
    } catch (error) {
      if (isUniqueViolation(error, 'one_active_per_employee', 'employee_id')) {
        throw new LeaveRefusedError('ALREADY_ON_LEAVE');
      }
      throw error;
    }
  }

  /** The person and the head of their department are told, in the transaction of the write. */
  private async tell(
    tx: DbTx,
    leave: LeaveRecord,
    eventKind: PersonnelEventKind,
    effectiveOn: BusinessDate,
    today: BusinessDate,
  ): Promise<void> {
    const placement = await this.organizationReads.getEmployeePlacement(leave.employeeId, today, tx);
    if (!placement) return;
    await this.notifier.eventRecorded(tx, {
      organizationId: leave.organizationId,
      employeeId: leave.employeeId,
      departmentId: placement.departmentId,
      eventKind,
      eventId: leave.id,
      subjectType: 'EMPLOYEE_LEAVE',
      effectiveOn,
    });
  }
}

function refuse(refusal: LeaveRefusal | null): void {
  if (refusal) throw new LeaveRefusedError(refusal.code, refusal.details);
}
