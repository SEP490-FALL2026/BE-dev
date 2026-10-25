import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { NoticeRefusedError } from '../notice/notice.errors';
import type { NoticeEventRef, NoticeRecord } from '../notice/notice.types';
import {
  NoticeRecorderRegistry,
  type NoticeEventRecorder,
  type NoticeEventRequest,
} from '../notice/notice-recorder.registry';
import { LeaveRefusedError } from './leave.errors';
import { toLeaveApiException } from './leave.http-errors';
import { LeaveRepo } from './leave.repo';
import { LeaveService } from './leave.service';

/**
 * Writes the long leave a notice of a head announces (`US-03-11` AC-1, AC-6): the rules of the leave judge its days and the person,
 * exactly as they do for a leave recorded from a document, and what they refuse comes back with their own codes. A person who is on
 * leave already answers as a duplicate event.
 */
@Injectable()
export class LeaveNoticeRecorder implements OnModuleInit, NoticeEventRecorder {
  readonly eventKind = 'LONG_LEAVE' as const;

  constructor(
    private readonly registry: NoticeRecorderRegistry,
    private readonly leaves: LeaveService,
    private readonly repo: LeaveRepo,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async record(tx: DbTx, request: NoticeEventRequest): Promise<NoticeEventRef> {
    const { notice, event } = request;
    if (event.startedOn === undefined || event.approvedReturnOn === undefined)
      throw new Error('A long leave notice was recorded without its days');
    try {
      const leave = await this.leaves.startInTx(tx, request.actor, {
        employeeId: notice.employeeId,
        startedOn: event.startedOn,
        approvedReturnOn: event.approvedReturnOn,
        grounds: request.grounds,
        noticeId: notice.id,
      });

      return { kind: this.eventKind, id: leave.id };
    } catch (error) {
      if (error instanceof LeaveRefusedError && error.code === 'ALREADY_ON_LEAVE')
        throw new NoticeRefusedError('DUPLICATE_EVENT');
      throw toLeaveApiException(error);
    }
  }

  /** The leave of the person that runs: the one a notice is tied to, and no second is made. */
  async findLinkable(tx: DbTx, notice: NoticeRecord, eventId: string): Promise<string | null> {
    const leave = await this.repo.find(eventId, tx);

    return leave && leave.employeeId === notice.employeeId && leave.status === 'ACTIVE' ? leave.id : null;
  }
}
