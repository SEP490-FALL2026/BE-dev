import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import { AuditService } from '../../audit/audit.service';
import { groundsSnapshot, normalizedGrounds } from '../grounds/grounds.policy';
import { personnelAuditEvent } from '../mappers/personnel-audit-event';
import { PersonnelAccessRefusedError } from '../personnel.errors';
import { actorColumns, type PersonnelActor } from '../personnel.types';
import { TransferGuardService } from '../transfer/transfer-guard.service';
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
 * What the Super Admin does with a notice that waits (`US-03-11`, F40): rejects it with a reason, or checks it against an
 * authoritative basis outside the notice and records the official event through the capability that owns it, or links it to an event
 * that already exists. One transaction for each, the notice locked first: whatever the event refuses leaves the notice waiting and
 * writes nothing. The notice never changes a person by itself; the event it leads to does, by its own rules. Only the Super Admin
 * handles a notice, and never one about themselves (`PERSONNEL.SELF_CHANGE_FORBIDDEN`); the controlled procedure records the event of
 * such a notice with its ticket (`--from-notice`), which is the one thing it does with a notice. The record of how it was checked
 * exists only on this path (T-7).
 */
@Injectable()
export class NoticeHandlingService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly notices: NoticeRepo,
    private readonly recorders: NoticeRecorderRegistry,
    private readonly audit: AuditService,
    private readonly guard: TransferGuardService,
  ) {}

  /** The reason is required and nothing is kept without it; no event is made (`US-03-11` AC-2). */
  reject(actor: PersonnelActor, id: string, reason: string): Promise<NoticeRecord> {
    return this.runner.run(async (tx) => {
      const held = await this.waiting(tx, id, actor, { inApplicationOnly: true });
      refuse(rejectReasonRefusal(reason));

      const rejected = await this.notices.markRejected(tx, id, actorColumns(actor), reason.trim());
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

  /**
   * Records the event the notice announces, on a basis outside the notice, with the check made (`US-03-11` AC-1). With `outer` it runs
   * in the transaction of the caller (the controlled procedure writes its ticket in the same one).
   */
  record(actor: PersonnelActor, id: string, input: RecordNoticeInput, outer?: DbTx): Promise<NoticeRecord> {
    const body = async (tx: DbTx): Promise<NoticeRecord> => {
      const held = await this.waiting(tx, id, actor);
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
    };

    return outer ? body(outer) : this.runner.run(body);
  }

  /** The event is there already (a handover that began, a leave that runs): the notice is tied to it and no second one is made. */
  link(actor: PersonnelActor, id: string, input: LinkNoticeInput): Promise<NoticeRecord> {
    return this.runner.run(async (tx) => {
      const held = await this.waiting(tx, id, actor, { inApplicationOnly: true });
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

  /**
   * The notice, locked, when it exists and still waits, and the actor judged against the person it is about (F13, F19): only the
   * Super Admin handles it and never about themselves. The controlled procedure may only record (`inApplicationOnly` refuses it for
   * the others); the account of the subject is read by the event it records, after that event locks the employee.
   */
  private async waiting(
    tx: DbTx,
    id: string,
    actor: PersonnelActor,
    options: { inApplicationOnly?: boolean } = {},
  ): Promise<NoticeRecord> {
    const held = await this.notices.lock(tx, id);
    if (!held) throw new NoticeRefusedError('NOT_FOUND');
    if (options.inApplicationOnly && actor.kind !== 'USER') throw new PersonnelAccessRefusedError('FORBIDDEN');
    this.guard.requireWriter(actor, held.employeeId);
    refuse(pendingRefusal(held.status));

    return held;
  }

  private async complete(
    tx: DbTx,
    actor: PersonnelActor,
    held: NoticeRecord,
    event: NoticeEventRef,
    verification: VerificationInput,
  ): Promise<NoticeRecord> {
    const by = actorColumns(actor);
    const recorded = await this.notices.markRecorded(tx, held.id, by, event);
    await this.notices.insertVerification(tx, held.id, verification, by);

    return recorded;
  }

  /** Who sent it, who was in charge when it was sent and who handled it: what the notification of the sender is taken from. */
  private outcomeFacts(actor: PersonnelActor, held: NoticeRecord) {
    return {
      code: held.code,
      kind: held.kind,
      employeeId: held.employeeId,
      senderEmployeeId: held.senderEmployeeId,
      defaultItAdmin: held.defaultItAdminEmployeeId,
      handledByEmployeeId: actor.kind === 'USER' ? actor.principal.employeeId : null,
    };
  }

  /**
   * The person is told an official event was recorded about them (the call point of the notification channel of
   * `g4-notification-delivery`). A departure writes its own event for it; a transfer and a long leave have none, so it is written here.
   */
  private async informEmployee(
    tx: DbTx,
    actor: PersonnelActor,
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
