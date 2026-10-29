import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import { isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import { LeaveService } from '../leave/leave.service';
import { NoticeHandlingService } from '../notice/notice-handling.service';
import type { NoticeEventInput } from '../notice/notice.types';
import { OffboardingChangeService } from '../offboarding/offboarding-change.service';
import { OffboardingService } from '../offboarding/offboarding.service';
import type { PersonnelActor } from './personnel.types';
import { TransferChangeService } from '../transfer/transfer-change.service';
import { TransferService } from '../transfer/transfer.service';
import { ProfileCorrectionService } from '../super-admin-event/profile-correction.service';
import { SuperAdminEventRefusedError } from './super-admin-event.errors';
import {
  assertContext,
  assertSplit,
  noticeKindFitsMode,
  parametersDigest,
} from '../super-admin-event/super-admin-event.policy';
import { refusalOf } from '../super-admin-event/super-admin-event-refusal.mapper';
import { SuperAdminEventRepo, type RecordKind } from '../super-admin-event/super-admin-event.repo';
import type {
  EventBasis,
  NoticeSource,
  SuperAdminEventCommand,
  SuperAdminEventContext,
  SuperAdminEventModeName,
  SuperAdminEventParameters,
  SuperAdminEventResult,
} from './super-admin-event.types';

interface Subject {
  id: string;
  organizationId: string;
}

/**
 * The controlled procedure for an event whose subject is the Super Admin (`pnpm ops:record-super-admin-event`, spec L.2, F19, `QĐ-87c`,
 * `QĐ-88b`). There is no principal: the command is the operator's, and the permission is judged here, closed on any doubt. It checks the
 * ticket, the split of persons and that the person the event is about HOLDS the `SUPER_ADMIN` role, and only then calls the service that
 * writes the event of the capability that owns it, with the actor `OPERATOR` (whose policy accepts it for that person alone). One
 * transaction: the ticket row, the event with the ticket as its "who", the Audit Trail with actor `OPERATOR` and the notices of the event;
 * any refusal, environment fault or stranger error rolls back everything, the ticket included. The same ticket with the same parameters is
 * recorded once: run again it answers `ALREADY_RECORDED`; with other parameters it is refused. It never changes a role, a role holder, a
 * password, a session or the lock of an account, and it is not the way to hand the role on (`ops:recover transfer-role` is).
 */
@Injectable()
export class SuperAdminEventApi {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly organization: OrganizationApi,
    private readonly identity: IdentityAccessApi,
    private readonly tickets: SuperAdminEventRepo,
    private readonly transfers: TransferService,
    private readonly transferChanges: TransferChangeService,
    private readonly leaves: LeaveService,
    private readonly offboarding: OffboardingService,
    private readonly offboardingChanges: OffboardingChangeService,
    private readonly notices: NoticeHandlingService,
    private readonly profile: ProfileCorrectionService,
  ) {}

  /** Throws SuperAdminEventRefusedError (nothing was written) or the error of a failure (nothing was written either). */
  async run(command: SuperAdminEventCommand): Promise<SuperAdminEventResult> {
    assertContext(command.context);
    try {
      return await this.once(command);
    } catch (error) {
      // The same ticket arrived twice at once: the second finds what the first wrote and answers as a repeat.
      if (!isUniqueViolation(error, 'ticket_ref')) throw refusalOf(error) ?? error;
    }
    try {
      return await this.once(command);
    } catch (error) {
      throw refusalOf(error) ?? error;
    }
  }

  private once(command: SuperAdminEventCommand): Promise<SuperAdminEventResult> {
    const { context, parameters } = command;

    return this.runner.run(async (tx) => {
      const organization = await this.organization.getOrganization(tx);
      if (!organization) throw new SuperAdminEventRefusedError('NOT_INSTALLED');
      const subject = await this.organization.getEmployeeByCode(context.subjectCode, tx);
      if (!subject) throw new SuperAdminEventRefusedError('SUBJECT_NOT_FOUND');

      // A ticket that was recorded is the same run again, or another run under a ticket that is not its own.
      const digest = parametersDigest(context, parameters);
      const known = await this.tickets.findTicket(tx, organization.id, context.ticketRef);
      if (known) {
        if (
          known.mode !== this.tickets.modeColumn(parameters.mode) ||
          known.subjectEmployeeId !== subject.id ||
          known.parametersDigest !== digest
        ) {
          throw new SuperAdminEventRefusedError('TICKET_PARAMETERS_DIFFER');
        }
        const recordId = await this.tickets.recordOfTicket(tx, known.id, parameters.mode);
        if (!recordId) throw new SuperAdminEventRefusedError('RECORD_NOT_FOUND');

        return { ticketRef: context.ticketRef, mode: parameters.mode, outcome: 'ALREADY_RECORDED', recordId };
      }

      // Lock order (T-11): the departments by id, then the employee, then the account. The services that write the events take the
      // departments an event needs first, so nothing is locked here: each of them judges, under its own locks, that the subject
      // holds the `SUPER_ADMIN` role (`requireOperatorSubject`), and `profile-correct`, which locks no department, does it below.
      // The split of persons reads without a lock.
      assertSplit(context, {
        employeeCode: subject.employeeCode,
        workEmail: subject.workEmail,
        loginEmail: await this.identity.findLoginEmailOfEmployee(tx, subject.id),
      });

      const ticket = await this.tickets.insertTicket(tx, {
        organizationId: organization.id,
        ticketRef: context.ticketRef,
        mode: parameters.mode,
        subjectEmployeeId: subject.id,
        parametersDigest: digest,
        approverRef: context.approvedBy,
        operatorRef: context.operator,
        environment: context.environment,
      });
      const actor = operatorActor(ticket.id, context, parameters.mode);
      const recordId = await this.write(
        tx,
        actor,
        { id: subject.id, organizationId: organization.id },
        parameters,
        context.basis,
      );

      return { ticketRef: context.ticketRef, mode: parameters.mode, outcome: 'RECORDED', recordId };
    });
  }

  /** Calls the one service that writes the event of the mode, in this transaction, and answers the id of the record it made or changed. */
  private async write(
    tx: DbTx,
    actor: PersonnelActor,
    subject: Subject,
    parameters: SuperAdminEventParameters,
    basis: EventBasis,
  ): Promise<string> {
    switch (parameters.mode) {
      case 'transfer-record': {
        if (parameters.fromNotice) {
          return this.fromNotice(tx, actor, subject, parameters.mode, parameters.fromNotice, basis, {
            effectiveOn: parameters.effectiveOn,
            toDepartmentId: parameters.toDepartmentId,
            successor: parameters.successor,
          });
        }

        return (
          await this.transfers.recordInTx(tx, actor, {
            employeeId: subject.id,
            toDepartmentId: parameters.toDepartmentId,
            effectiveOn: parameters.effectiveOn,
            grounds: basis,
            successor: parameters.successor,
          })
        ).id;
      }
      case 'transfer-reschedule':
        await this.assertAbout(tx, 'TRANSFER', parameters.transferId, subject);

        return (
          await this.transferChanges.reschedule(
            actor,
            parameters.transferId,
            {
              newEffectiveOn: parameters.newEffectiveOn,
              reason: parameters.reason,
              grounds: basis,
              successor: parameters.successor,
            },
            tx,
          )
        ).id;
      case 'transfer-cancel':
        await this.assertAbout(tx, 'TRANSFER', parameters.transferId, subject);

        return (
          await this.transferChanges.cancel(
            actor,
            parameters.transferId,
            { reason: parameters.reason, grounds: basis },
            tx,
          )
        ).id;
      case 'leave-start': {
        if (parameters.fromNotice) {
          return this.fromNotice(tx, actor, subject, parameters.mode, parameters.fromNotice, basis, {
            startedOn: parameters.startedOn,
            approvedReturnOn: parameters.approvedReturnOn,
          });
        }

        return (
          await this.leaves.startInTx(tx, actor, {
            employeeId: subject.id,
            startedOn: parameters.startedOn,
            approvedReturnOn: parameters.approvedReturnOn,
            grounds: basis,
          })
        ).id;
      }
      case 'leave-return':
        await this.assertAbout(tx, 'LEAVE', parameters.leaveId, subject);

        return (
          await this.leaves.confirmReturn(
            actor,
            parameters.leaveId,
            { returnedOn: parameters.returnedOn, grounds: basis },
            tx,
          )
        ).id;
      case 'departure-record':
      case 'abrupt-departure-record': {
        const transferCancellation = parameters.cancelTransferReason
          ? { reason: parameters.cancelTransferReason }
          : undefined;
        if (parameters.fromNotice) {
          return this.fromNotice(tx, actor, subject, parameters.mode, parameters.fromNotice, basis, {
            lastWorkingDay: parameters.lastWorkingDay,
            successor: parameters.successor,
            pendingTransferCancellation: transferCancellation,
          });
        }

        return (
          await this.offboarding.recordInTx(tx, actor, {
            employeeId: subject.id,
            lastWorkingDay: parameters.lastWorkingDay,
            abrupt: parameters.mode === 'abrupt-departure-record',
            grounds: basis,
            successor: parameters.successor,
            pendingTransferCancellation: transferCancellation,
          })
        ).id;
      }
      case 'departure-change':
        await this.assertAbout(tx, 'CASE', parameters.caseId, subject);

        return (
          await this.offboardingChanges.changeLastDay(
            actor,
            parameters.caseId,
            { lastWorkingDay: parameters.lastWorkingDay, reason: parameters.reason, successor: parameters.successor },
            tx,
          )
        ).id;
      case 'departure-cancel':
        await this.assertAbout(tx, 'CASE', parameters.caseId, subject);

        return (await this.offboardingChanges.cancel(actor, parameters.caseId, { reason: parameters.reason }, tx)).id;
      case 'profile-correct':
        // No department is locked by this mode, so the protocol is the employee and then the account, here.
        await this.organization.lockEmployeeForUpdate(tx, subject.id);
        if (!(await this.identity.inspectEmployeeAccount(tx, subject.id)).roles.includes('SUPER_ADMIN'))
          throw new SuperAdminEventRefusedError('SUBJECT_NOT_SUPER_ADMIN');
        await this.profile.correct(tx, actor, subject.organizationId, subject.id, parameters, basis);

        return subject.id;
    }
  }

  /** The record to change must exist and be about the person the ticket is about. */
  private async assertAbout(tx: DbTx, kind: RecordKind, id: string, subject: Subject): Promise<void> {
    const employeeId = await this.tickets.employeeOf(tx, kind, id);
    if (employeeId === null) throw new SuperAdminEventRefusedError('RECORD_NOT_FOUND');
    if (employeeId !== subject.id) throw new SuperAdminEventRefusedError('RECORD_NOT_ABOUT_SUBJECT');
  }

  /**
   * The event is recorded from a notice of a head about the person (`BM-09`): the notice becomes `RECORDED` with the record of how it
   * was checked, exactly as the application does when the Super Admin records it. A notice about another person, or of a kind the mode
   * does not record, is refused before anything is written.
   */
  private async fromNotice(
    tx: DbTx,
    actor: PersonnelActor,
    subject: Subject,
    mode: SuperAdminEventModeName,
    source: NoticeSource,
    basis: EventBasis,
    event: NoticeEventInput,
  ): Promise<string> {
    const notice = await this.tickets.noticeOf(tx, source.noticeId);
    if (!notice || notice.employeeId !== subject.id) throw new SuperAdminEventRefusedError('NOTICE_NOT_ABOUT_SUBJECT');
    if (!noticeKindFitsMode(mode, notice.kind)) throw new SuperAdminEventRefusedError('NOTICE_KIND_MISMATCH');
    const recorded = await this.notices.record(
      actor,
      source.noticeId,
      {
        verification: { method: source.verificationMethod, reference: source.verificationReference ?? basis.reference },
        grounds: basis,
        event,
      },
      tx,
    );
    if (!recorded.recordedEventId) throw new SuperAdminEventRefusedError('RECORD_NOT_FOUND');

    return recorded.recordedEventId;
  }
}

/**
 * The actor of every event this run writes: the ticket row is its "who" (`…_by_ticket_id`), the code of the ticket is the operator
 * reference of the Audit Trail, and what the command added (the ticket, who approved it, who ran it, the environment, the mode and the
 * basis) goes on the `after` of every event. References only: never a password, a token, a hash or a link.
 */
function operatorActor(
  ticketId: string,
  context: SuperAdminEventContext,
  mode: SuperAdminEventModeName,
): PersonnelActor {
  return {
    kind: 'OPERATOR',
    ticketId,
    ticketRef: context.ticketRef,
    context: {
      ticket: context.ticketRef,
      approver: context.approvedBy,
      operator: context.operator,
      environment: context.environment,
      mode,
      basis: { ...context.basis },
    },
  };
}
