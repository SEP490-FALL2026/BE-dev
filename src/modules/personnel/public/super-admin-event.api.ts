import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import { isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { PersonnelActor } from './personnel.types';
import { ProfileCorrectionService } from '../super-admin-event/profile-correction.service';
import { SuperAdminDepartureEvents } from '../super-admin-event/super-admin-departure-events.service';
import { SuperAdminLeaveEvents } from '../super-admin-event/super-admin-leave-events.service';
import { SuperAdminTransferEvents } from '../super-admin-event/super-admin-transfer-events.service';
import type { Subject } from '../super-admin-event/super-admin-event-anchor.service';
import { SuperAdminEventRefusedError } from './super-admin-event.errors';
import { assertContext, assertSplit, parametersDigest } from '../super-admin-event/super-admin-event.policy';
import { refusalOf } from '../super-admin-event/super-admin-event-refusal.mapper';
import { SuperAdminEventRepo } from '../super-admin-event/super-admin-event.repo';
import type {
  EventBasis,
  SuperAdminEventCommand,
  SuperAdminEventContext,
  SuperAdminEventModeName,
  SuperAdminEventParameters,
  SuperAdminEventResult,
} from './super-admin-event.types';

/**
 * The controlled procedure for an event whose subject is the Super Admin (`pnpm ops:record-super-admin-event`, `QĐ-87c`,
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
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
    private readonly tickets: SuperAdminEventRepo,
    private readonly transferEvents: SuperAdminTransferEvents,
    private readonly leaveEvents: SuperAdminLeaveEvents,
    private readonly departureEvents: SuperAdminDepartureEvents,
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
      const organization = await this.organizationReads.getOrganization(tx);
      if (!organization) throw new SuperAdminEventRefusedError('NOT_INSTALLED');
      const subject = await this.organizationReads.getEmployeeByCode(context.subjectCode, tx);
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

      // Lock order: the departments by id, then the employee, then the account. The services that write the events take the
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
      case 'transfer-record':
      case 'transfer-reschedule':
      case 'transfer-cancel':
        return this.transferEvents.write(tx, actor, subject, parameters, basis);
      case 'leave-start':
      case 'leave-return':
        return this.leaveEvents.write(tx, actor, subject, parameters, basis);
      case 'departure-record':
      case 'abrupt-departure-record':
      case 'departure-change':
      case 'departure-cancel':
        return this.departureEvents.write(tx, actor, subject, parameters, basis);
      case 'profile-correct':
        // No department is locked by this mode, so the protocol is the employee and then the account, here.
        await this.profile.lockSubject(tx, subject.id);
        if (!(await this.identity.inspectEmployeeAccount(tx, subject.id)).roles.includes('SUPER_ADMIN'))
          throw new SuperAdminEventRefusedError('SUBJECT_NOT_SUPER_ADMIN');
        await this.profile.correct(tx, actor, subject.organizationId, subject.id, parameters, basis);

        return subject.id;
    }
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
