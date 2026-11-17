import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { NoticeHandlingService } from '../notice/notice-handling.service';
import type { NoticeEventInput } from '../personnel-notice.types';
import type { PersonnelActor } from '../public/personnel.types';
import { SuperAdminEventRefusedError } from '../public/super-admin-event.errors';
import type { EventBasis, NoticeSource, SuperAdminEventModeName } from '../public/super-admin-event.types';
import { documentBasisOf } from './super-admin-event.policy';
import { noticeKindFitsMode } from './super-admin-event.policy';
import { SuperAdminEventRepo, type RecordKind } from './super-admin-event.repo';

/** The person the ticket is about. */
export interface Subject {
  id: string;
  organizationId: string;
}

/**
 * What every event of the controlled procedure is anchored to before it is written (`BM-09`): the record to change must exist
 * and be about the person the ticket is about, and an event recorded from a notice of a head must come from a notice about that person.
 */
@Injectable()
export class SuperAdminEventAnchor {
  constructor(
    private readonly tickets: SuperAdminEventRepo,
    private readonly notices: NoticeHandlingService,
  ) {}

  /** The record to change must exist and be about the person the ticket is about. */
  async assertAbout(tx: DbTx, kind: RecordKind, id: string, subject: Subject): Promise<void> {
    const employeeId = await this.tickets.employeeOf(tx, kind, id);
    if (employeeId === null) throw new SuperAdminEventRefusedError('RECORD_NOT_FOUND');
    if (employeeId !== subject.id) throw new SuperAdminEventRefusedError('RECORD_NOT_ABOUT_SUBJECT');
  }

  /**
   * The event is recorded from a notice of a head about the person (`BM-09`): the notice becomes `RECORDED` with the record of how it
   * was checked, exactly as the application does when the Super Admin records it. A notice about another person, or of a kind the mode
   * does not record, is refused before anything is written.
   */
  async fromNotice(
    tx: DbTx,
    actor: PersonnelActor,
    subject: Subject,
    mode: SuperAdminEventModeName,
    source: NoticeSource,
    given: EventBasis,
    event: NoticeEventInput,
  ): Promise<string> {
    // The notice is checked against the document in four parts: a basis in one box is refused here (BASIS_INVALID).
    const basis = documentBasisOf(given);
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
