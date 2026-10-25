import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { groundsSnapshot, normalizedGrounds } from '../grounds/grounds.policy';
import { personnelAuditEvent } from '../mappers/personnel-audit-event';
import { NoticeRefusedError } from './notice.errors';
import {
  eventKindOf,
  eventShapeRefusal,
  noticeGroundsRefusal,
  pendingRefusal,
  rejectReasonRefusal,
  verificationRefusal,
  type NoticeRefusal,
} from './notice.policy';
import { NoticeRepo } from './notice.repo';
import { NoticeRecorderRegistry } from './notice-recorder.registry';
import type {
  LinkNoticeInput,
  NoticeEventRef,
  NoticeRecord,
  RecordNoticeInput,
  VerificationInput,
} from './notice.types';

function refuse(refusal: NoticeRefusal | null): void {
  if (refusal) throw new NoticeRefusedError(refusal.code, refusal.details);
}

/**
 * What the IT Admin does with a notice that waits (`US-03-11`): rejects it with a reason, or checks it against an authoritative basis
 * outside the notice and records the official event through the capability that owns it, or links it to an event that already exists.
 * One transaction for each, the notice locked first: whatever the event refuses leaves the notice waiting and writes nothing. The
 * notice never changes a person by itself; the event it leads to does, by its own rules.
 */
@Injectable()
export class NoticeHandlingService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly notices: NoticeRepo,
    private readonly recorders: NoticeRecorderRegistry,
    private readonly audit: AuditService,
  ) {}

  /** The reason is required and nothing is kept without it; no event is made (`US-03-11` AC-2). */
  reject(actor: AuthenticatedPrincipal, id: string, reason: string): Promise<NoticeRecord> {
    return this.runner.run(async (tx) => {
      const held = await this.waiting(tx, id);
      refuse(rejectReasonRefusal(reason));

      const rejected = await this.notices.markRejected(tx, id, actor.appUserId, reason.trim());
      await this.audit.record(
        tx,
        personnelAuditEvent(
          actor,
          held.organizationId,
          'PERSONNEL_NOTICE.REJECTED',
          'PersonnelNotice',
          id,
          { code: held.code, status: held.status },
          { ...this.outcomeFacts(actor, held), status: rejected.status, reason: rejected.rejectReason },
        ),
      );

      return rejected;
    });
  }

  /** Records the event the notice announces, on a basis outside the notice, with the check the IT Admin made (`US-03-11` AC-1). */
  record(actor: AuthenticatedPrincipal, id: string, input: RecordNoticeInput): Promise<NoticeRecord> {
    return this.runner.run(async (tx) => {
      const held = await this.waiting(tx, id);
      refuse(verificationRefusal(input.verification));
      refuse(noticeGroundsRefusal(input.grounds));
      refuse(eventShapeRefusal(held.kind, input.event));
      const grounds = normalizedGrounds(input.grounds ?? {});

      const recorder = this.recorders.recorderFor(eventKindOf(held.kind));
      // The refusals of the event come out with their own codes and undo everything, the notice included.
      const event = await recorder.record(tx, { actor, notice: held, grounds, event: input.event });
      const recorded = await this.complete(tx, actor, held, event, input.verification);
      await this.audit.record(
        tx,
        personnelAuditEvent(
          actor,
          held.organizationId,
          'PERSONNEL_NOTICE.RECORDED',
          'PersonnelNotice',
          id,
          { code: held.code, status: held.status },
          {
            ...this.outcomeFacts(actor, held),
            status: recorded.status,
            event: { kind: event.kind, id: event.id },
            verification: { method: input.verification.method, reference: input.verification.reference.trim() },
            grounds: groundsSnapshot(grounds),
          },
        ),
      );
      await this.informEmployee(tx, actor, held, event);

      return recorded;
    });
  }

  /** The event is there already (a handover that began, a leave that runs): the notice is tied to it and no second one is made. */
  link(actor: AuthenticatedPrincipal, id: string, input: LinkNoticeInput): Promise<NoticeRecord> {
    return this.runner.run(async (tx) => {
      const held = await this.waiting(tx, id);
      refuse(verificationRefusal(input.verification));
      const kind = eventKindOf(held.kind);
      const eventId = await this.recorders.recorderFor(kind).findLinkable(tx, held, input.eventId);
      if (!eventId) throw new NoticeRefusedError('NO_MATCHING_EVENT');

      const event: NoticeEventRef = { kind, id: eventId };
      const linked = await this.complete(tx, actor, held, event, input.verification);
      await this.audit.record(
        tx,
        personnelAuditEvent(
          actor,
          held.organizationId,
          'PERSONNEL_NOTICE.LINKED',
          'PersonnelNotice',
          id,
          { code: held.code, status: held.status },
          {
            ...this.outcomeFacts(actor, held),
            status: linked.status,
            event: { kind, id: eventId },
            verification: { method: input.verification.method, reference: input.verification.reference.trim() },
          },
        ),
      );

      return linked;
    });
  }

  /** The notice, locked, when it exists and still waits. */
  private async waiting(tx: DbTx, id: string): Promise<NoticeRecord> {
    const held = await this.notices.lock(tx, id);
    if (!held) throw new NoticeRefusedError('NOT_FOUND');
    refuse(pendingRefusal(held.status));

    return held;
  }

  private async complete(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    held: NoticeRecord,
    event: NoticeEventRef,
    verification: VerificationInput,
  ): Promise<NoticeRecord> {
    const recorded = await this.notices.markRecorded(tx, held.id, actor.appUserId, event);
    await this.notices.insertVerification(tx, held.id, verification, actor.appUserId);

    return recorded;
  }

  /** Who sent it, who was in charge when it was sent and who handled it: what the notification of the sender is taken from. */
  private outcomeFacts(actor: AuthenticatedPrincipal, held: NoticeRecord) {
    return {
      code: held.code,
      kind: held.kind,
      employeeId: held.employeeId,
      senderEmployeeId: held.senderEmployeeId,
      defaultItAdmin: held.defaultItAdminEmployeeId,
      handledByEmployeeId: actor.employeeId,
    };
  }

  /**
   * The person is told an official event was recorded about them (the call point of the notification channel of
   * `g4-notification-delivery`). A departure writes its own event for it; a transfer and a long leave have none, so it is written here.
   */
  private async informEmployee(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    held: NoticeRecord,
    event: NoticeEventRef,
  ): Promise<void> {
    if (event.kind === 'OFFBOARDING_CASE') return;
    await this.audit.record(
      tx,
      personnelAuditEvent(
        actor,
        held.organizationId,
        'PERSONNEL.EMPLOYEE_INFORMED',
        event.kind === 'DEPARTMENT_TRANSFER' ? 'DepartmentTransfer' : 'EmployeeLeave',
        event.id,
        null,
        {
          employeeId: held.employeeId,
          event: event.kind === 'DEPARTMENT_TRANSFER' ? 'TRANSFER_RECORDED' : 'LONG_LEAVE_STARTED',
          notice: held.code,
        },
      ),
    );
  }
}
