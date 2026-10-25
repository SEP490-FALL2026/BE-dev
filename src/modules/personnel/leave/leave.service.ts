import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import { isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { IdentityAccessService } from '../../identity-access/identity-access.service';
import { OrganizationHistoryService } from '../../organization/organization-history.service';
import { OrganizationService } from '../../organization/organization.service';
import { groundsSnapshot, normalizedGrounds } from '../grounds/grounds.policy';
import { personnelAuditEvent } from '../mappers/personnel-audit-event';
import { selfActionMode, type SelfActionMode } from '../personnel-self-action.policy';
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
 * organization. Nothing here changes by the calendar: a late return is only told (`LeaveOverdueService`). The reason for a leave
 * is never asked for nor kept.
 */
@Injectable()
export class LeaveService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly organization: OrganizationService,
    private readonly history: OrganizationHistoryService,
    private readonly identity: IdentityAccessService,
    private readonly leaves: LeaveRepo,
    private readonly audit: AuditService,
  ) {}

  /** Throws LeaveRefusedError for everything the policy or the database refuses. */
  start(actor: AuthenticatedPrincipal, input: StartLeaveInput): Promise<LeaveRecord> {
    return this.runner.run((tx) => this.startInTx(tx, actor, input));
  }

  /** The same in the transaction of the caller (the write that starts from a notice of the head, later). */
  async startInTx(tx: DbTx, actor: AuthenticatedPrincipal, input: StartLeaveInput): Promise<LeaveRecord> {
    const organization = await this.requireOrganization();
    const today = await this.organization.businessToday(new Date(), tx);
    if (!(await this.organization.getEmployee(input.employeeId, tx))) throw new LeaveRefusedError('EMPLOYEE_NOT_FOUND');
    await this.organization.lockEmployeeForUpdate(tx, input.employeeId);
    const employee = await this.organization.getEmployee(input.employeeId, tx);
    if (!employee) throw new LeaveRefusedError('EMPLOYEE_NOT_FOUND');
    const selfMode = await this.selfMode(actor, input.employeeId);

    refuse(
      startLeaveRefusal({
        today,
        startedOn: input.startedOn,
        approvedReturnOn: input.approvedReturnOn,
        hireDate: employee.hireDate,
        employee: { status: employee.status, workState: employee.workState },
        grounds: input.grounds,
        selfMode,
      }),
    );
    const grounds = normalizedGrounds(input.grounds ?? {});
    const selfExecuted = selfMode === 'ALLOW_SELF_EXECUTED';
    await this.history.setEmployeeWorkState(tx, input.employeeId, 'ON_LONG_LEAVE');
    const leave = await this.insertLeave(tx, {
      organizationId: organization.id,
      employeeId: input.employeeId,
      startedOn: input.startedOn,
      approvedReturnOn: input.approvedReturnOn,
      resumesLeaveId: null,
      grounds,
      startedByAppUserId: actor.appUserId,
      selfExecuted,
      noticeId: input.noticeId ?? null,
    });
    await this.leaves.insertChange(tx, {
      leaveId: leave.id,
      kind: 'STARTED',
      newReturnOn: input.approvedReturnOn,
      grounds,
      recordedByAppUserId: actor.appUserId,
      selfExecuted,
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
          selfExecuted,
        },
      ),
    );
    await this.auditSelfExecuted(tx, actor, leave, employee.employeeCode, 'LONG_LEAVE_STARTED');

    return leave;
  }

  /** The approved day of return moves, on a new basis; the old day and basis stay in the log. */
  changeReturnDate(actor: AuthenticatedPrincipal, leaveId: string, input: ChangeReturnDateInput): Promise<LeaveRecord> {
    return this.runner.run(async (tx) => {
      const { organizationId, leave, employeeCode, today, selfMode } = await this.lockedLeave(tx, actor, leaveId);
      refuse(
        changeReturnDateRefusal({
          today,
          status: leave.status,
          startedOn: leave.startedOn,
          approvedReturnOn: leave.approvedReturnOn,
          newApprovedReturnOn: input.newApprovedReturnOn,
          grounds: input.grounds,
          selfMode,
        }),
      );
      const grounds = normalizedGrounds(input.grounds ?? {});
      const selfExecuted = selfMode === 'ALLOW_SELF_EXECUTED';
      const changed = await this.leaves.changeReturnDate(tx, leave.id, input.newApprovedReturnOn, grounds);
      await this.leaves.insertChange(tx, {
        leaveId: leave.id,
        kind: 'RETURN_DATE_CHANGED',
        oldReturnOn: leave.approvedReturnOn,
        newReturnOn: input.newApprovedReturnOn,
        grounds,
        recordedByAppUserId: actor.appUserId,
        selfExecuted,
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
          { approvedReturnOn: input.newApprovedReturnOn, grounds: groundsSnapshot(grounds), selfExecuted },
        ),
      );
      await this.auditSelfExecuted(tx, actor, changed, employeeCode, 'LONG_LEAVE_RETURN_DATE_CHANGED', selfExecuted);

      return changed;
    });
  }

  /** The person is back from `returnedOn`; on the approved day no document is needed, on any other day a new basis is. */
  confirmReturn(actor: AuthenticatedPrincipal, leaveId: string, input: ConfirmReturnInput): Promise<LeaveRecord> {
    return this.runner.run(async (tx) => {
      const { organizationId, leave, employeeCode, today, selfMode } = await this.lockedLeave(tx, actor, leaveId);
      refuse(
        confirmReturnRefusal({
          today,
          status: leave.status,
          startedOn: leave.startedOn,
          approvedReturnOn: leave.approvedReturnOn,
          returnedOn: input.returnedOn,
          grounds: input.grounds,
          selfMode,
        }),
      );
      const onSchedule = isOnSchedule(input.returnedOn, leave.approvedReturnOn);
      const grounds = onSchedule ? undefined : normalizedGrounds(input.grounds ?? {});
      const selfExecuted = selfMode === 'ALLOW_SELF_EXECUTED';
      const ended = await this.leaves.end(tx, leave.id, input.returnedOn, 'RETURNED');
      await this.history.setEmployeeWorkState(tx, leave.employeeId, 'WORKING');
      await this.leaves.insertChange(tx, {
        leaveId: leave.id,
        kind: 'RETURNED',
        returnedOn: input.returnedOn,
        onSchedule,
        grounds,
        recordedByAppUserId: actor.appUserId,
        selfExecuted,
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
            grounds: grounds ? groundsSnapshot(grounds) : null,
            selfExecuted,
          },
        ),
      );
      await this.auditSelfExecuted(tx, actor, ended, employeeCode, 'LONG_LEAVE_RETURNED', selfExecuted);

      return ended;
    });
  }

  /** The installation's organization; a leave before installation is a programming error. */
  private async requireOrganization(): Promise<{ id: string }> {
    const organization = await this.organization.getOrganization();
    if (!organization) throw new Error('A long leave was recorded before installation');

    return organization;
  }

  /** Whether the actor may act on this person: an IT Admin on themselves needs another IT Admin unless they are the only one. */
  private async selfMode(actor: AuthenticatedPrincipal, employeeId: string): Promise<SelfActionMode> {
    const isSelf = actor.employeeId === employeeId;

    return selfActionMode({
      isSelf,
      otherUsableItAdmins: isSelf ? await this.identity.countUsableItAdminsExcept(actor.employeeId) : 0,
    });
  }

  /** The leave read, then the employee locked, then the leave held and read again (the lock protocol: the employee comes first). */
  private async lockedLeave(tx: DbTx, actor: AuthenticatedPrincipal, leaveId: string) {
    const organization = await this.requireOrganization();
    const today: BusinessDate = await this.organization.businessToday(new Date(), tx);
    const seen = await this.leaves.find(leaveId, tx);
    if (!seen) throw new LeaveRefusedError('NOT_FOUND');
    await this.organization.lockEmployeeForUpdate(tx, seen.employeeId);
    const leave = await this.leaves.lock(tx, leaveId);
    if (!leave) throw new LeaveRefusedError('NOT_FOUND');
    const employee = await this.organization.getEmployee(leave.employeeId, tx);

    return {
      organizationId: organization.id,
      leave,
      employeeCode: employee?.employeeCode ?? '',
      today,
      selfMode: await this.selfMode(actor, leave.employeeId),
    };
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

  /** The event that tells the Super Admin an IT Admin did this for themselves when they were the only one. */
  private async auditSelfExecuted(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    leave: LeaveRecord,
    employeeCode: string,
    event: string,
    selfExecuted: boolean = leave.selfExecuted,
  ): Promise<void> {
    if (!selfExecuted) return;
    await this.audit.record(
      tx,
      personnelAuditEvent(actor, leave.organizationId, 'PERSONNEL.SELF_EXECUTED', 'EmployeeLeave', leave.id, null, {
        employeeCode,
        event,
      }),
    );
  }
}

function refuse(refusal: LeaveRefusal | null): void {
  if (refusal) throw new LeaveRefusedError(refusal.code, refusal.details);
}
