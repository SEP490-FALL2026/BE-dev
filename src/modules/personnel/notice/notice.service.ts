import { Injectable } from '@nestjs/common';
import { addDays, type BusinessDate } from '../../../core/business-date';
import { addWorkingDays } from '../../../core/working-days';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import { isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import { PersonnelNotifier } from '../event-notice/personnel-notifier.service';
import { personnelAuditEvent } from '../mappers/personnel-audit-event.mapper';
import { userActor } from '../public/personnel.types';
import { NoticeRefusedError } from './notice.errors';
import { isPriorityKind, pendingRefusal, sendRefusal } from './notice.policy';
import { NoticeRepo } from './notice.repo';
import type { NoticeRecord, SendNoticeInput } from './notice.types';

const REVIEW_DAYS = 'PERSONNEL_NOTICE_REVIEW_WORKING_DAYS';
/** The parameter is at most thirty working days: ninety calendar days hold them with the holidays in between. */
const CALENDAR_WINDOW_DAYS = 90;

/**
 * The two writes of the head about a notice (`US-03-10`): sending it and taking it back while it waits. A notice is information
 * with no legal effect: it writes its own row and the audit event, and touches nothing of the person (no state, period, title, request,
 * step, assignment, task or sign-in); a sudden departure is told with a second event of high priority and changes nothing either.
 * Who may send which kind is the policy's; the day the IT Admin has to handle it is fixed here from the parameter when it is sent.
 */
@Injectable()
export class NoticeService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly organization: OrganizationApi,
    private readonly parameters: OperatingParametersApi,
    private readonly notices: NoticeRepo,
    private readonly audit: AuditApi,
    private readonly notifier: PersonnelNotifier,
  ) {}

  /** Throws NoticeRefusedError for everything the policy or the database refuses. */
  async send(actor: AuthenticatedPrincipal, input: SendNoticeInput): Promise<NoticeRecord> {
    try {
      return await this.runner.run((tx) => this.sendInTx(tx, actor, input));
    } catch (error) {
      // Two heads sending at once: the database keeps one waiting notice for each person and kind.
      if (isUniqueViolation(error, 'one_pending_per_employee_kind', 'employee_id')) {
        const pendingCode = await this.waitingCode(input);
        throw new NoticeRefusedError('DUPLICATE_PENDING', pendingCode ? { pendingCode } : undefined);
      }
      throw error;
    }
  }

  /** The head takes the notice back while it waits; it leaves the queue of the IT Admin (`US-03-10` AC-8). */
  withdraw(actor: AuthenticatedPrincipal, id: string): Promise<NoticeRecord> {
    return this.runner.run(async (tx) => {
      const held = await this.notices.lock(tx, id);
      // The notice of another head does not exist for this one.
      if (!held || held.senderEmployeeId !== actor.employeeId) throw new NoticeRefusedError('NOT_FOUND');
      const refused = pendingRefusal(held.status);
      if (refused) throw new NoticeRefusedError(refused.code);

      const withdrawn = await this.notices.markWithdrawn(tx, id, actor.appUserId);
      await this.audit.record(
        tx,
        personnelAuditEvent(
          userActor(actor),
          held.organizationId,
          'PERSONNEL_NOTICE.WITHDRAWN',
          'PersonnelNotice',
          id,
          { code: held.code, status: held.status },
          { code: held.code, status: withdrawn.status },
        ),
      );

      return withdrawn;
    });
  }

  private async sendInTx(tx: DbTx, actor: AuthenticatedPrincipal, input: SendNoticeInput): Promise<NoticeRecord> {
    const organization = await this.organization.getOrganization(tx);
    if (!organization) throw new Error('A notice was sent before installation');
    const today = await this.organization.businessToday(new Date(), tx);

    const employee = await this.organization.getEmployee(input.employeeId, tx);
    const placement = employee ? await this.organization.getEmployeePlacement(employee.id, today, tx) : null;
    const target = input.targetDepartmentId
      ? await this.organization.getDepartmentBrief(input.targetDepartmentId, tx)
      : null;
    const senderHead = await this.organization.getHeadedDepartment(actor.employeeId, today);
    const refusal = sendRefusal({
      kind: input.kind,
      senderEmployeeId: actor.employeeId,
      employeeId: input.employeeId,
      employee: employee && {
        status: employee.status,
        workState: employee.workState,
        departmentId: placement?.departmentId ?? null,
      },
      targetDepartmentId: input.targetDepartmentId,
      targetUsable: Boolean(target?.active),
      senderHeadOf: senderHead?.departmentId ?? null,
      pendingCode: await this.notices.pendingCodeOf(tx, input.employeeId, input.kind),
    });
    if (refusal) throw new NoticeRefusedError(refusal.code, refusal.details);
    if (!employee || !senderHead) throw new Error('A notice passed the rules without a person or a head');

    const inCharge = await this.organization.getItAdminInCharge(employee.id, today, tx);
    const notice = await this.notices.insert(tx, await this.notices.nextCode(tx, today.slice(0, 4)), {
      organizationId: organization.id,
      employeeId: employee.id,
      kind: input.kind,
      proposedOn: input.proposedOn,
      targetDepartmentId: input.targetDepartmentId ?? null,
      note: input.note?.trim() ? input.note.trim() : null,
      senderEmployeeId: actor.employeeId,
      senderDepartmentId: senderHead.departmentId,
      defaultItAdminEmployeeId: inCharge?.itAdminEmployeeId ?? null,
      dueOn: await this.dueOn(today),
    });

    const after = {
      code: notice.code,
      employeeCode: employee.employeeCode,
      kind: notice.kind,
      proposedOn: notice.proposedOn,
      targetDepartmentId: notice.targetDepartmentId,
      dueOn: notice.dueOn,
      defaultItAdmin: notice.defaultItAdminEmployeeId,
    };
    await this.audit.record(
      tx,
      personnelAuditEvent(
        userActor(actor),
        organization.id,
        'PERSONNEL_NOTICE.SENT',
        'PersonnelNotice',
        notice.id,
        null,
        after,
      ),
    );
    // The Super Admin handles the notices (`QĐ-87a`): a new one is told to them in the transaction that sends it (F17).
    await this.notifier.noticeReceived(tx, {
      organizationId: organization.id,
      employeeId: employee.id,
      departmentId: senderHead.departmentId,
      noticeId: notice.id,
      kind: notice.kind,
    });
    if (isPriorityKind(notice.kind)) {
      // The point the high-priority warning to the IT Admin and the Super Admin is taken from; the person is not changed by it.
      await this.audit.record(
        tx,
        personnelAuditEvent(
          userActor(actor),
          organization.id,
          'PERSONNEL_NOTICE.ABRUPT_SENT',
          'PersonnelNotice',
          notice.id,
          null,
          after,
        ),
      );
    }

    return notice;
  }

  /** The day an IT Admin has to handle a notice sent today: the parameter's working days from today. */
  private async dueOn(today: BusinessDate): Promise<BusinessDate> {
    const days = Number(await this.parameters.getValue(REVIEW_DAYS));
    const nonWorking = await this.parameters.getNonWorkingDates(today, addDays(today, CALENDAR_WINDOW_DAYS));

    return addWorkingDays(today, days, nonWorking);
  }

  private async waitingCode(input: SendNoticeInput): Promise<string | null> {
    return this.runner.run((tx) => this.notices.pendingCodeOf(tx, input.employeeId, input.kind));
  }
}
