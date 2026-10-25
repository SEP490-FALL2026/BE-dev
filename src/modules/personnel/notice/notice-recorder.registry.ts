import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { Grounds } from '../grounds/grounds.policy';
import type { NoticeEventInput, NoticeEventKind, NoticeEventRef, NoticeRecord } from './notice.types';

/** What a recorder is given to write the official event a notice announces. The basis is whole; the notice only names itself. */
export interface NoticeEventRequest {
  actor: AuthenticatedPrincipal;
  notice: NoticeRecord;
  grounds: Grounds;
  event: NoticeEventInput;
}

/**
 * How one kind of official event is written from a notice: the capability that owns the event registers its own recorder, which calls
 * its `…InTx` write with the notice named, so the rules of the event (the day, the head who goes with a person, the handover, the
 * long leave) live where they always did and are not copied. The notice calls it inside its own transaction: whatever the event
 * refuses comes back as the refusal of the event, with its own code, and the notice stays as it was.
 */
export interface NoticeEventRecorder {
  readonly eventKind: NoticeEventKind;
  /** Writes the event in the transaction of the caller; throws the refusal of the event as an `ApiException`. */
  record(tx: DbTx, request: NoticeEventRequest): Promise<NoticeEventRef>;
  /** The id when `eventId` is an event of this person that is in force and of the kind the notice announces; otherwise null. */
  findLinkable(tx: DbTx, notice: NoticeRecord, eventId: string): Promise<string | null>;
}

/** The recorders the capabilities register when their module starts: one for each kind of official event. */
@Injectable()
export class NoticeRecorderRegistry {
  private readonly recorders = new Map<NoticeEventKind, NoticeEventRecorder>();

  register(recorder: NoticeEventRecorder): void {
    if (this.recorders.has(recorder.eventKind))
      throw new Error(`A notice recorder for ${recorder.eventKind} is already registered`);
    this.recorders.set(recorder.eventKind, recorder);
  }

  recorderFor(kind: NoticeEventKind): NoticeEventRecorder {
    const found = this.recorders.get(kind);
    if (!found) throw new Error(`No notice recorder for ${kind}`);

    return found;
  }
}
