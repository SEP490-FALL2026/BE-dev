import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { NoticeRefusedError } from '../notice/notice.errors';
import type { NoticeEventRef, NoticeRecord } from '../notice/notice.types';
import {
  NoticeRecorderRegistry,
  type NoticeEventRecorder,
  type NoticeEventRequest,
} from '../notice/notice-recorder.registry';
import { TransferRefusedError } from './transfer.errors';
import { toTransferApiException } from './transfer.http-errors';
import { TransferRepo } from './transfer.repo';
import { TransferService } from './transfer.service';

/**
 * Writes the transfer a notice of a head announces (`US-03-11` AC-1, AC-7): the rules of the transfer judge the day, the destination,
 * the head who goes with a person and the one event that waits, exactly as they do for a transfer recorded from a document, and what
 * they refuse comes back with their own codes. A transfer already waiting for the person answers as a duplicate event.
 */
@Injectable()
export class TransferNoticeRecorder implements OnModuleInit, NoticeEventRecorder {
  readonly eventKind = 'DEPARTMENT_TRANSFER' as const;

  constructor(
    private readonly registry: NoticeRecorderRegistry,
    private readonly transfers: TransferService,
    private readonly repo: TransferRepo,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async record(tx: DbTx, request: NoticeEventRequest): Promise<NoticeEventRef> {
    const { notice, event } = request;
    if (event.effectiveOn === undefined) throw new Error('A transfer notice was recorded without a day');
    try {
      const transfer = await this.transfers.recordInTx(tx, request.actor, {
        employeeId: notice.employeeId,
        toDepartmentId: event.toDepartmentId ?? notice.targetDepartmentId ?? undefined,
        effectiveOn: event.effectiveOn,
        grounds: request.grounds,
        successor: event.successor,
        noticeId: notice.id,
      });

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
