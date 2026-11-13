import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import type { InAppNotificationCode, InAppParamValue } from '../../notifications/public/notifications.types';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';

/** What happened to a person that the people concerned are told. Codes only: no name, no basis. */
export type PersonnelEventKind =
  | 'TRANSFER_RECORDED'
  | 'TRANSFER_RESCHEDULED'
  | 'TRANSFER_CANCELLED'
  | 'LONG_LEAVE_STARTED'
  | 'LONG_LEAVE_RETURN_DATE_CHANGED'
  | 'LONG_LEAVE_RETURNED'
  | 'DEPARTURE_RECORDED'
  | 'DEPARTURE_LAST_DAY_CHANGED'
  | 'DEPARTURE_CANCELLED'
  | 'DEPARTURE_MARKED_LEFT';

/** The events of a departure that the IT Admin in charge is told as well as the person and the heads: the block and the revocations follow them. */
const IT_ADMIN_TOLD_OF: ReadonlySet<PersonnelEventKind> = new Set([
  'DEPARTURE_RECORDED',
  'DEPARTURE_LAST_DAY_CHANGED',
  'DEPARTURE_CANCELLED',
]);

interface Common {
  organizationId: string;
  employeeId: string;
  departmentId: string | null;
}

/**
 * Writes the in-app notices that the personnel context owes, always in the transaction of the event so a notice exists
 * exactly when the event commits. Who is told is decided here and nowhere else: the person the event is about and the heads
 * concerned for a recorded or changed event, the Super Admin for a notice of a head that is new or late and for a departure that
 * leaves a role with nobody to take it, the Super Admin and the IT Admin in charge for an abrupt departure, and the head of the
 * department the person came to for the deadline of the review. Parameters are ids, codes and days only, as the closed table of
 * `inbox.policy.ts` says. A person who would be told twice for one thing is told once.
 */
@Injectable()
export class PersonnelNotifier {
  constructor(
    private readonly notifications: NotificationsApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
  ) {}

  /** The person and the heads of `departmentIds` are told an event about the person was recorded, moved, cancelled or finished. */
  async eventRecorded(
    tx: DbTx,
    input: Common & {
      eventKind: PersonnelEventKind;
      eventId: string;
      subjectType: string;
      /** The other departments whose head is concerned (the one a person leaves or comes to). */
      alsoDepartmentIds?: readonly string[];
      effectiveOn: BusinessDate;
    },
  ): Promise<void> {
    const today = await this.organizationReads.businessToday(new Date(), tx);
    const departments = [
      ...new Set([input.departmentId, ...(input.alsoDepartmentIds ?? [])].filter((d): d is string => d !== null)),
    ];
    const heads = await this.organizationReads.getDepartmentHeads(departments, today, tx);
    const recipients = new Set<string>([input.employeeId, ...[...heads.values()].map((head) => head.employeeId)]);
    // The IT Admin who answers for the department is told a departure was recorded, moved or cancelled, since the block and the revocations follow it.
    if (IT_ADMIN_TOLD_OF.has(input.eventKind)) {
      const itAdmin = await this.itAdminOfDeparture(tx, input);
      if (itAdmin) recipients.add(itAdmin);
    }
    const occurrence = randomUUID();
    for (const recipient of recipients) {
      await this.tell(tx, input.organizationId, recipient, 'PERSONNEL_EVENT_RECORDED', {
        subject: { type: input.subjectType, id: input.eventId },
        params: {
          employeeId: input.employeeId,
          departmentId: input.departmentId,
          eventKind: input.eventKind,
          effectiveOn: input.effectiveOn,
        },
        eventKey: `PERSONNEL_EVENT_RECORDED:${input.eventKind}:${input.eventId}:${occurrence}`,
      });
    }
  }

  /** The person and the head of their department are told a departure under way moved or was cancelled (the case is the subject). */
  departureChanged(
    tx: DbTx,
    record: { id: string; organizationId: string; employeeId: string; departmentId: string | null },
    eventKind: 'DEPARTURE_LAST_DAY_CHANGED' | 'DEPARTURE_CANCELLED',
    effectiveOn: BusinessDate,
  ): Promise<void> {
    return this.eventRecorded(tx, {
      organizationId: record.organizationId,
      employeeId: record.employeeId,
      departmentId: record.departmentId,
      eventKind,
      eventId: record.id,
      subjectType: 'OFFBOARDING_CASE',
      effectiveOn,
    });
  }

  /** The Super Admin is told a notice of a head (`BM-09`) arrived, so it is not left waiting in a queue nobody reads. */
  async noticeReceived(tx: DbTx, notice: Common & { noticeId: string; kind: string }): Promise<void> {
    await this.toSuperAdmin(tx, notice.organizationId, 'PERSONNEL_NOTICE_RECEIVED', {
      subject: { type: 'PERSONNEL_NOTICE', id: notice.noticeId },
      params: {
        noticeId: notice.noticeId,
        employeeId: notice.employeeId,
        departmentId: notice.departmentId,
        eventKind: notice.kind,
      },
      eventKey: `PERSONNEL_NOTICE_RECEIVED:${notice.noticeId}`,
    });
  }

  /** The Super Admin is told a notice has stayed past its day without being handled; told once for the notice. */
  async noticeOverdue(tx: DbTx, notice: Common & { noticeId: string; kind: string }): Promise<void> {
    await this.toSuperAdmin(tx, notice.organizationId, 'PERSONNEL_NOTICE_OVERDUE', {
      subject: { type: 'PERSONNEL_NOTICE', id: notice.noticeId },
      params: {
        noticeId: notice.noticeId,
        employeeId: notice.employeeId,
        departmentId: notice.departmentId,
        eventKind: notice.kind,
      },
      eventKey: `PERSONNEL_NOTICE_OVERDUE:${notice.noticeId}`,
    });
  }

  /** A person left suddenly: the Super Admin and the IT Admin in charge of the department are told (the lock cannot wait). */
  async abruptDeparture(
    tx: DbTx,
    input: Common & { caseId: string; effectiveOn: BusinessDate; lastDayInOffice: BusinessDate },
  ): Promise<void> {
    const parameters = {
      subject: { type: 'OFFBOARDING_CASE', id: input.caseId },
      params: { employeeId: input.employeeId, departmentId: input.departmentId, effectiveOn: input.effectiveOn },
    };
    const eventKey = `ABRUPT_DEPARTURE_RECORDED:${input.caseId}`;
    await this.toSuperAdmin(tx, input.organizationId, 'ABRUPT_DEPARTURE_RECORDED', { ...parameters, eventKey });
    const inCharge = await this.organizationReads.getItAdminInCharge(input.employeeId, input.lastDayInOffice, tx);
    const itAdmin = inCharge?.itAdminEmployeeId ?? (await this.identity.findFirstUsableItAdminEmployeeId(tx));
    if (itAdmin)
      await this.tell(tx, input.organizationId, itAdmin, 'ABRUPT_DEPARTURE_RECORDED', { ...parameters, eventKey });
  }

  /**
   * The IT Admin a departure is told through (`QĐ-110c`): the one named for the department the person leaves, unless that is the person
   * themselves (their account is blocked, so the notice would reach nobody who can act), and otherwise the first IT Admin whose account can
   * act. A case without a department goes to the first one. Null when no IT Admin can act.
   */
  async itAdminOfDeparture(
    tx: DbTx,
    input: { departmentId: string | null; employeeId: string },
  ): Promise<string | null> {
    const named = input.departmentId
      ? await this.organizationReads.getItAdminInChargeOfDepartment(input.departmentId, tx)
      : null;
    if (named !== null && named !== input.employeeId) return named;

    return (await this.identity.findAllUsableItAdminEmployeeIds(tx)).find((id) => id !== input.employeeId) ?? null;
  }

  /**
   * The rights of a departure are still not taken away past the day (`QĐ-110c`): the IT Admin in charge and the Super Admin are told, once
   * for the case and the day (`offboarding:<case>:<day>`), so a pass that runs again, or on another instance, writes nothing. Returns whether
   * a notice was written.
   */
  async revocationOverdue(
    tx: DbTx,
    input: Common & { caseId: string; dueOn: BusinessDate; rightCount: number; today: BusinessDate },
  ): Promise<boolean> {
    const notice: NoticeParts = {
      subject: { type: 'OFFBOARDING_CASE', id: input.caseId },
      params: { caseId: input.caseId, employeeId: input.employeeId, dueOn: input.dueOn, rightCount: input.rightCount },
      eventKey: `offboarding:${input.caseId}:${input.today}`,
    };

    return this.toItAdminAndSuperAdmin(tx, input, 'REVOCATION_OVERDUE', notice);
  }

  /**
   * The access of a person who is leaving is blocked from today (`QĐ-110b`, `QĐ-110d`, R-1): the system has ended the machines and closed the
   * open requests. The Super Admin is asked to mark the person as left (only while `markLeft`, a person already marked has nothing to mark),
   * and the IT Admin to **block** the company account (item 1a of `BM-08`: reset the password of the mailbox and sign out every session; the
   * mailbox itself is not locked yet) and to open the revocation by `revocationDueOn`. One notice for each audience, once for the case. The IT
   * Admin is not asked to block an account they already blocked (`accountLocked`: a case that was already blocked when this release started),
   * and the person who left is never told as the Super Admin: their account is blocked.
   */
  async departureAccessBlocked(
    tx: DbTx,
    input: Common & {
      caseId: string;
      blockedOn: BusinessDate;
      revocationDueOn: BusinessDate;
      markLeft: boolean;
      accountLocked: boolean;
    },
  ): Promise<void> {
    const notice = (audience: 'SUPER_ADMIN' | 'IT_ADMIN'): NoticeParts => ({
      subject: { type: 'OFFBOARDING_CASE', id: input.caseId },
      params: {
        caseId: input.caseId,
        employeeId: input.employeeId,
        departmentId: input.departmentId,
        blockedOn: input.blockedOn,
        revocationDueOn: input.revocationDueOn,
        audience,
      },
      eventKey: `DEPARTURE_ACCESS_BLOCKED:${input.caseId}:${audience}`,
    });
    if (input.markLeft)
      await this.toSuperAdmin(
        tx,
        input.organizationId,
        'DEPARTURE_ACCESS_BLOCKED',
        notice('SUPER_ADMIN'),
        input.employeeId,
      );
    if (input.accountLocked) return;
    const itAdmin = await this.itAdminOfDeparture(tx, input);
    if (itAdmin) await this.tell(tx, input.organizationId, itAdmin, 'DEPARTURE_ACCESS_BLOCKED', notice('IT_ADMIN'));
  }

  /**
   * A departure blocked now still has no lock of the company account at the end of the day it was blocked (`QĐ-94m`(12), R-1): the IT Admin
   * and the Super Admin are told once for the case. Returns whether a notice was written.
   */
  async accountLockOverdue(tx: DbTx, input: Common & { caseId: string; blockedOn: BusinessDate }): Promise<boolean> {
    const notice: NoticeParts = {
      subject: { type: 'OFFBOARDING_CASE', id: input.caseId },
      params: { caseId: input.caseId, employeeId: input.employeeId, blockedOn: input.blockedOn },
      eventKey: `ACCOUNT_LOCK_OVERDUE:${input.caseId}`,
    };

    return this.toItAdminAndSuperAdmin(tx, input, 'ACCOUNT_LOCK_OVERDUE', notice);
  }

  /** A person who holds a role that needs someone to take over is leaving: the Super Admin is told, once for each role. */
  async roleHolderLeaving(
    tx: DbTx,
    input: Common & { caseId: string; roleFlag: string; effectiveOn: BusinessDate; stage: string },
  ): Promise<void> {
    await this.toSuperAdmin(tx, input.organizationId, 'ROLE_HOLDER_LEAVING', {
      subject: { type: 'OFFBOARDING_CASE', id: input.caseId },
      params: {
        employeeId: input.employeeId,
        departmentId: input.departmentId,
        roleFlag: input.roleFlag,
        effectiveOn: input.effectiveOn,
      },
      eventKey: `ROLE_HOLDER_LEAVING:${input.caseId}:${input.roleFlag}:${input.stage}`,
    });
  }

  /** The IT Admin of the departure and the Super Admin, a person who is both once and never the person who left; true when a notice was written. */
  private async toItAdminAndSuperAdmin(
    tx: DbTx,
    input: Common,
    code: InAppNotificationCode,
    notice: NoticeParts,
  ): Promise<boolean> {
    const itAdmin = await this.itAdminOfDeparture(tx, input);
    const superAdmin = (await this.identity.getSuperAdminHolder(tx))?.employeeId ?? null;
    const recipients = new Set(
      [itAdmin, superAdmin].filter((id): id is string => id !== null && id !== input.employeeId),
    );
    let written = false;
    for (const recipient of recipients) {
      written = (await this.tell(tx, input.organizationId, recipient, code, notice)) || written;
    }

    return written;
  }

  /** The Super Admin, unless they are `exceptEmployeeId` (the person a departure is about: their account is blocked). */
  private async toSuperAdmin(
    tx: DbTx,
    organizationId: string,
    code: InAppNotificationCode,
    notice: NoticeParts,
    exceptEmployeeId?: string,
  ): Promise<void> {
    const holder = await this.identity.getSuperAdminHolder(tx);
    if (holder && holder.employeeId !== exceptEmployeeId)
      await this.tell(tx, organizationId, holder.employeeId, code, notice);
  }

  /** True when the notice was written, false when the recipient already has one for this event key. */
  private tell(
    tx: DbTx,
    organizationId: string,
    recipientEmployeeId: string,
    code: InAppNotificationCode,
    notice: NoticeParts,
  ): Promise<boolean> {
    return this.notifications.notifyInApp(tx, { organizationId, recipientEmployeeId, code, ...notice });
  }
}

interface NoticeParts {
  subject: { type: string; id: string };
  params: Record<string, InAppParamValue>;
  eventKey: string;
}
