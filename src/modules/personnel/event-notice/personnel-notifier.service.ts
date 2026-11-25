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
  | 'DEPARTURE_CANCELLED';

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
    // The acting IT Admins of the department (or Super Admin fallback) are told when a departure is recorded, moved, or cancelled.
    if (IT_ADMIN_TOLD_OF.has(input.eventKind)) {
      for (const itAdmin of await this.itAdminsOrSuperAdminOfDeparture(tx, input)) {
        recipients.add(itAdmin);
      }
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

  /** A person left suddenly: notifies the Super Admin and the acting IT Admins of the person's work department. */
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
    const deptId =
      input.departmentId ??
      (await this.organizationReads.workDepartmentsOf([input.employeeId], input.lastDayInOffice, tx)).get(
        input.employeeId,
      ) ??
      null;
    if (deptId === null) return;
    const acting = (
      await this.organizationReads.itAdminsActingFor(
        [deptId],
        (ids) => this.identity.findUsableItAdminEmployeeIds(ids, tx),
        tx,
      )
    ).get(deptId);
    for (const itAdmin of (acting?.actors ?? []).filter((id) => id !== input.employeeId)) {
      await this.tell(tx, input.organizationId, itAdmin, 'ABRUPT_DEPARTURE_RECORDED', { ...parameters, eventKey });
    }
  }

  /** Usable acting IT Admins (in-charge and active substitute) for the department, excluding the employee. */
  async actingItAdminsOfDepartment(
    tx: DbTx,
    input: { departmentId: string | null; employeeId: string },
  ): Promise<string[]> {
    if (input.departmentId === null) return [];
    const acting = (
      await this.organizationReads.itAdminsActingFor(
        [input.departmentId],
        (ids) => this.identity.findUsableItAdminEmployeeIds(ids, tx),
        tx,
      )
    ).get(input.departmentId);

    return (acting?.actors ?? []).filter((id) => id !== input.employeeId);
  }

  /** Acting IT Admins of the department, or the usable Super Admin fallback when none can act. */
  async itAdminsOrSuperAdminOfDeparture(
    tx: DbTx,
    input: { departmentId: string | null; employeeId: string },
  ): Promise<string[]> {
    const actors = await this.actingItAdminsOfDepartment(tx, input);
    if (actors.length > 0) return actors;
    const superAdmin = await this.identity.findUsableSuperAdminEmployeeId(tx);

    return superAdmin !== null && superAdmin !== input.employeeId ? [superAdmin] : [];
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
   * mailbox itself is not locked yet) and to open the revocation by `revocationDueOn`. One notice for each person, once for the case: the
   * Super Admin who is also the IT Admin who must block the account (the department has no usable IT Admin, so the Super Admin answers for it)
   * gets one notice with both tasks (`audience` `SUPER_ADMIN_AND_IT_ADMIN`), never two. The IT Admin is not asked to block an account they
   * already blocked (`accountLocked`: a case that was already blocked when this release started), and the person who left is never told as
   * the Super Admin: their account is blocked.
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
    const notice = (audience: 'SUPER_ADMIN' | 'IT_ADMIN' | 'SUPER_ADMIN_AND_IT_ADMIN'): NoticeParts => ({
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
    const itAdmins = input.accountLocked ? [] : await this.itAdminsOrSuperAdminOfDeparture(tx, input);
    const notifiedSuperAdmin = input.markLeft
      ? await this.toSuperAdmin(
          tx,
          input.organizationId,
          'DEPARTURE_ACCESS_BLOCKED',
          (superAdmin) => notice(itAdmins.includes(superAdmin) ? 'SUPER_ADMIN_AND_IT_ADMIN' : 'SUPER_ADMIN'),
          input.employeeId,
        )
      : null;
    for (const itAdmin of itAdmins) {
      if (itAdmin === notifiedSuperAdmin) continue;
      await this.tell(tx, input.organizationId, itAdmin, 'DEPARTURE_ACCESS_BLOCKED', notice('IT_ADMIN'));
    }
  }

  /**
   * The grace of the old rights of a person who moved has begun (`QĐ-110p`, `US-03-01` AC-26): the person is told the last day they keep
   * them, and the head of each of the two departments and the IT Admin who answers for each know the rights will be taken back. One notice for
   * each person, once for the transfer; a person who is more than one of these is told as the first of mover, head, IT Admin.
   */
  async transferGraceStarted(
    tx: DbTx,
    input: {
      organizationId: string;
      transferId: string;
      employeeId: string;
      fromDepartmentId: string;
      toDepartmentId: string;
      graceEndsOn: BusinessDate;
      today: BusinessDate;
    },
  ): Promise<void> {
    const audiences = new Map<string, 'MOVER' | 'HEAD' | 'IT_ADMIN'>([[input.employeeId, 'MOVER']]);
    const departments = [input.fromDepartmentId, input.toDepartmentId];
    for (const head of (await this.organizationReads.getDepartmentHeads(departments, input.today, tx)).values())
      if (!audiences.has(head.employeeId)) audiences.set(head.employeeId, 'HEAD');
    for (const departmentId of departments) {
      for (const itAdmin of await this.itAdminsOrSuperAdminOfDeparture(tx, {
        departmentId,
        employeeId: input.employeeId,
      })) {
        if (!audiences.has(itAdmin)) audiences.set(itAdmin, 'IT_ADMIN');
      }
    }
    for (const [recipient, audience] of audiences)
      await this.tell(tx, input.organizationId, recipient, 'TRANSFER_GRACE_STARTED', {
        subject: { type: 'DEPARTMENT_TRANSFER', id: input.transferId },
        params: {
          transferId: input.transferId,
          employeeId: input.employeeId,
          fromDepartmentId: input.fromDepartmentId,
          toDepartmentId: input.toDepartmentId,
          graceEndsOn: input.graceEndsOn,
          audience,
        },
        eventKey: `TRANSFER_GRACE_STARTED:${input.transferId}`,
      });
  }

  /**
   * The person who moved is told once more, `reminder_working_days` before the last day, that the rights of the old department are about to be
   * taken back (`QĐ-110p`, `US-03-01`): once for the transfer. Returns whether a notice was written.
   */
  transferGraceEnding(
    tx: DbTx,
    input: { organizationId: string; transferId: string; employeeId: string; graceEndsOn: BusinessDate },
  ): Promise<boolean> {
    return this.tell(tx, input.organizationId, input.employeeId, 'TRANSFER_GRACE_ENDING', {
      subject: { type: 'DEPARTMENT_TRANSFER', id: input.transferId },
      params: { transferId: input.transferId, employeeId: input.employeeId, graceEndsOn: input.graceEndsOn },
      eventKey: `TRANSFER_GRACE_ENDING:${input.transferId}`,
    });
  }

  /**
   * The grace is over and the system opened the revocation of the old rights (`QĐ-110p`): the person who moved and the IT Admin who answers for
   * the new department, whose queue the tasks are in, are told how many there are. Once for the transfer, a person who is both once.
   */
  async transferRightsRevoking(
    tx: DbTx,
    input: {
      organizationId: string;
      transferId: string;
      employeeId: string;
      toDepartmentId: string;
      rightCount: number;
    },
  ): Promise<void> {
    const itAdmins = await this.itAdminsOrSuperAdminOfDeparture(tx, {
      departmentId: input.toDepartmentId,
      employeeId: input.employeeId,
    });
    const recipients = new Set<string>([input.employeeId, ...itAdmins]);
    for (const recipient of recipients)
      await this.tell(tx, input.organizationId, recipient, 'TRANSFER_RIGHTS_REVOKING', {
        subject: { type: 'DEPARTMENT_TRANSFER', id: input.transferId },
        params: {
          transferId: input.transferId,
          employeeId: input.employeeId,
          toDepartmentId: input.toDepartmentId,
          rightCount: input.rightCount,
        },
        eventKey: `TRANSFER_RIGHTS_REVOKING:${input.transferId}`,
      });
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

  /** Notifies the usable Super Admin when a leaving IT Admin still holds catalog responsibilities. */
  async itHandoverPending(
    tx: DbTx,
    input: { organizationId: string; source: { kind: string; id: string }; employeeId: string; dueOn: BusinessDate },
  ): Promise<number> {
    const superAdmin = await this.identity.findUsableSuperAdminEmployeeId(tx);
    if (superAdmin === null || superAdmin === input.employeeId) return 0;
    const written = await this.tell(tx, input.organizationId, superAdmin, 'IT_ADMIN_HANDOVER_PENDING', {
      subject: { type: input.source.kind, id: input.source.id },
      params: {
        sourceKind: input.source.kind,
        sourceId: input.source.id,
        employeeId: input.employeeId,
        dueOn: input.dueOn,
      },
      eventKey: `IT_ADMIN_HANDOVER_PENDING:${input.source.kind}:${input.source.id}`,
    });

    return written ? 1 : 0;
  }

  /**
   * Notifies the usable IT Admin responsible for `workspaceId` (if different from `employeeId`), or the usable Super Admin fallback,
   * once per `(workspace, admin)` when an administrator stops working (W3-12).
   */
  async workspaceAdminNotWorking(
    tx: DbTx,
    input: {
      organizationId: string;
      workspaceId: string;
      employeeId: string;
      responsibleItAdminEmployeeId: string | null;
      workingAdminCount: number;
    },
  ): Promise<number> {
    const notice: NoticeParts = {
      subject: { type: 'WORKSPACE', id: input.workspaceId },
      params: {
        workspaceId: input.workspaceId,
        employeeId: input.employeeId,
        workingAdminCount: input.workingAdminCount,
      },
      eventKey: `WORKSPACE_ADMIN_NOT_WORKING:${input.workspaceId}:${input.employeeId}`,
    };
    const responsible = input.responsibleItAdminEmployeeId;
    if (responsible !== null && responsible !== input.employeeId) {
      const usable = await this.identity.findUsableItAdminEmployeeIds([responsible], tx);
      if (usable.has(responsible)) {
        return (await this.tell(tx, input.organizationId, responsible, 'WORKSPACE_ADMIN_NOT_WORKING', notice)) ? 1 : 0;
      }
    }
    const superAdmin = await this.identity.findUsableSuperAdminEmployeeId(tx);
    if (superAdmin === null || superAdmin === input.employeeId) return 0;

    return (await this.tell(tx, input.organizationId, superAdmin, 'WORKSPACE_ADMIN_NOT_WORKING', notice)) ? 1 : 0;
  }

  /** The IT Admin who took everything a leaving IT Admin answered for is told how many of each are theirs now (SPEC P5). */
  async itHandoverReceived(
    tx: DbTx,
    input: {
      organizationId: string;
      source: { kind: string; id: string };
      fromEmployeeId: string;
      toEmployeeId: string;
      subscriptions: number;
      applications: number;
    },
  ): Promise<void> {
    await this.tell(tx, input.organizationId, input.toEmployeeId, 'IT_ADMIN_HANDOVER_RECEIVED', {
      subject: { type: input.source.kind, id: input.source.id },
      params: {
        sourceKind: input.source.kind,
        sourceId: input.source.id,
        fromEmployeeId: input.fromEmployeeId,
        subscriptions: input.subscriptions,
        applications: input.applications,
      },
      eventKey: `IT_ADMIN_HANDOVER_RECEIVED:${input.source.kind}:${input.source.id}:${randomUUID()}`,
    });
  }

  /** Notifies the usable Super Admin when an offboarding case opens for a never-placed employee. */
  async unplacedOffboardingWaiting(
    tx: DbTx,
    input: { organizationId: string; caseId: string; employeeId: string },
  ): Promise<void> {
    const unplaced = await this.organizationReads.unplacedAmong([input.employeeId], tx);
    if (!unplaced.has(input.employeeId)) return;
    const superAdmin = await this.identity.findUsableSuperAdminEmployeeId(tx);
    if (superAdmin === null || superAdmin === input.employeeId) return;

    await this.notifications.notifyInApp(tx, {
      organizationId: input.organizationId,
      recipientEmployeeId: superAdmin,
      code: 'UNPLACED_WORK_WAITING',
      subject: null,
      params: { workKind: 'OFFBOARDING_CASE', workId: input.caseId, employeeId: input.employeeId },
      eventKey: `unplacedWork:OFFBOARDING_CASE:${input.caseId}`,
    });
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

  /** Acting IT Admins of the department and the Super Admin, deduplicated and excluding the employee. */
  private async toItAdminAndSuperAdmin(
    tx: DbTx,
    input: Common,
    code: InAppNotificationCode,
    notice: NoticeParts,
  ): Promise<boolean> {
    const itAdmins = await this.actingItAdminsOfDepartment(tx, input);
    const superAdmin = (await this.identity.getSuperAdminHolder(tx))?.employeeId ?? null;
    const recipients = new Set(
      [...itAdmins, superAdmin].filter((id): id is string => id !== null && id !== input.employeeId),
    );
    let written = false;
    for (const recipient of recipients) {
      written = (await this.tell(tx, input.organizationId, recipient, code, notice)) || written;
    }

    return written;
  }

  /**
   * The Super Admin, unless they are `exceptEmployeeId` (the person a departure is about: their account is blocked). The notice may depend on
   * who the Super Admin is.
   */
  private async toSuperAdmin(
    tx: DbTx,
    organizationId: string,
    code: InAppNotificationCode,
    notice: NoticeParts | ((superAdminEmployeeId: string) => NoticeParts),
    exceptEmployeeId?: string,
  ): Promise<string | null> {
    const holder = await this.identity.getSuperAdminHolder(tx);
    if (!holder || holder.employeeId === exceptEmployeeId) return null;
    await this.tell(
      tx,
      organizationId,
      holder.employeeId,
      code,
      typeof notice === 'function' ? notice(holder.employeeId) : notice,
    );

    return holder.employeeId;
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
