import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { NoticeRefusedError } from './notice.errors';
import type { NoticeEventRef, NoticeRecord } from '../personnel-notice.types';
import {
  NoticeRecorderContributions,
  type NoticeEventRecorder,
  type NoticeEventRequest,
} from '../public/personnel.extension-points';
import { TransferRefusedError } from '../transfer/transfer.errors';
import { toTransferApiException } from '../transfer/transfer.http-errors';
import { TransferGuardService } from '../transfer/transfer-guard.service';
import { TransferRepo } from '../transfer/transfer.repo';
import { TransferService } from '../transfer/transfer.service';

/**
 * Writes the transfer a notice of a head announces (`US-03-11` AC-1, AC-7): the rules of the transfer judge the day, the destination,
 * the head who goes with a person and the one event that waits, exactly as they do for a transfer recorded from a document, and what
 * they refuse comes back with their own codes. A transfer already waiting for the person answers as a duplicate event. A race the
 * database refuses answers `CONCURRENT_CHANGE` (409), never a 500.
 */
@Injectable()
export class TransferNoticeRecorder implements OnModuleInit, NoticeEventRecorder {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [NoticeRecorderContributions] as const;

  readonly eventKind = 'DEPARTMENT_TRANSFER' as const;

  constructor(
    private readonly recorders: NoticeRecorderContributions,
    private readonly transfers: TransferService,
    private readonly repo: TransferRepo,
    private readonly guard: TransferGuardService,
  ) {}

  onModuleInit(): void {
    this.recorders.add(this.eventKind, this);
  }

  async record(tx: DbTx, request: NoticeEventRequest): Promise<NoticeEventRef> {
    const { notice, event } = request;
    if (event.effectiveOn === undefined) throw new Error('A transfer notice was recorded without a day');
    try {
      const effectiveOn = event.effectiveOn;
      const transfer = await this.guard.guarded(() =>
        this.transfers.recordInTx(tx, request.actor, {
          employeeId: notice.employeeId,
          toDepartmentId: event.toDepartmentId ?? notice.targetDepartmentId ?? undefined,
          effectiveOn,
          groundsNote: request.groundsNote,
          successor: event.successor,
          noticeId: notice.id,
        }),
      );

      return { kind: this.eventKind, id: transfer.id };
    } catch (error) {
      if (
        error instanceof TransferRefusedError &&
        error.code === 'PENDING_EVENT_EXISTS' &&
        error.details?.kind === 'TRANSFER'
      )
        throw new NoticeRefusedError('DUPLICATE_EVENT');
      throw toTransferApiException(error);
    }
  }

  /** The transfer of the person that waits for its day: the one a notice is tied to, and no second is made. */
  async findLinkable(tx: DbTx, notice: NoticeRecord, eventId: string): Promise<string | null> {
    const transfer = await this.repo.find(eventId, tx);

    return transfer && transfer.employeeId === notice.employeeId && transfer.status === 'PENDING' ? transfer.id : null;
  }
}
