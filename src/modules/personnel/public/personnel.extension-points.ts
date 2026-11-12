import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { Contributions } from '../../../core/extension/contributions';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { NoticeEventInput, NoticeEventKind, NoticeEventRef, NoticeRecord } from '../personnel-notice.types';
import type { PersonnelActor } from './personnel.types';

/** A file of the personnel context (a transfer now, the leaving of a person later) and the day its effect is due. */
export interface PersonnelFileEvent {
  fileKind: 'TRANSFER' | 'OFFBOARDING';
  fileId: string;
  employeeId: string;
  /** The day the file takes effect: the day of a transfer, the last day of a person who leaves. */
  dueOn: BusinessDate;
}

/**
 * What a flow that hangs on a personnel file does when the file is recorded, when its day moves and when it is cancelled
 * (the role duties of the one who goes). Called in the
 * transaction of the write, after it, as a part of it: a hook that throws — a bug, a failing statement, a refusal it
 * raises — rolls the whole write back and its error is the error of the write, as a refusing entry of `Listeners` does. A hook that
 * is allowed to fail without the write failing catches the error inside itself. What a hook writes belongs to the transaction too, so
 * a statement of a hook that fails in the database leaves the transaction aborted for whatever comes after it.
 */
export interface PersonnelFileHook {
  onRecorded?(tx: DbTx, event: PersonnelFileEvent): Promise<void>;
  onDueChanged?(tx: DbTx, event: PersonnelFileEvent & { previousDueOn: BusinessDate }): Promise<void>;
  onCancelled?(tx: DbTx, event: PersonnelFileEvent): Promise<void>;
  /** The person became `LEFT` (a departure only): the day it took effect is `dueOn`. */
  onLeft?(tx: DbTx, event: PersonnelFileEvent): Promise<void>;
}

/**
 * The hooks of the flows that follow a personnel file, added when their module starts; none at the start. The transfer and the
 * departure call each in the order it was added (`event-notice/personnel-file-hooks.service.ts`), in the transaction of the write. A
 * hook that throws stops the ones after it and rolls the write back, as an entry of `Listeners` would; it is a `Contributions`
 * because a hook is an object with up to four optional steps, not one handler of one event.
 */
@Injectable()
export class PersonnelFileHookContributions extends Contributions<PersonnelFileHook> {
  constructor() {
    super('personnel.file-hook');
  }
}

/**
 * What a flow that comes after the record of a departure tells it: how many things of its own still wait on a person who has left.
 * A blocker keeps the case from closing (the workspaces whose owner has not been changed); a warning only shows beside the case and never stops anything (the roles the person holds that someone must take over).
 * The count is read when the case is shown or closed, in the caller's transaction when there is one.
 */
export interface OffboardingSource {
  /** A finite code the wire names; it is the key of the count in `blockers` or `warnings.registered`. */
  readonly code: string;
  countFor(employeeId: string, tx?: DbTx): Promise<number>;
}

/** What keeps the record of a departure from closing, one source per code (the code is the name it is added under). */
@Injectable()
export class OffboardingBlockerContributions extends Contributions<OffboardingSource> {
  constructor() {
    super('personnel.offboarding-blocker');
  }
}

/** What only shows beside the record of a departure, one source per code (the code is the name it is added under). */
@Injectable()
export class OffboardingWarningContributions extends Contributions<OffboardingSource> {
  constructor() {
    super('personnel.offboarding-warning');
  }
}

/**
 * What a recorder is given to write the official event a notice announces. The basis is the sentence the four parts the Super Admin gave
 * make (`QĐ-110a`: an event keeps its basis in one box); the notice only names itself.
 */
export interface NoticeEventRequest {
  actor: PersonnelActor;
  notice: NoticeRecord;
  groundsNote: string;
  event: NoticeEventInput;
}

/**
 * How one kind of official event is written from a notice: the capability that owns the event adds its own recorder, which calls
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

/**
 * The recorders the transfer, the long leave and the departure add when their module starts: one for each kind of official event,
 * added under the name of its kind, so a second one of the same kind is refused when the module starts.
 */
@Injectable()
export class NoticeRecorderContributions extends Contributions<NoticeEventRecorder> {
  constructor() {
    super('personnel.notice-recorder');
  }
}
