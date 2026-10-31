import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { NoticeRefusedError } from '../notice/notice.errors';
import type { NoticeEventRef, NoticeRecord } from '../personnel-notice.types';
import {
  NoticeRecorderContributions,
  type NoticeEventRecorder,
  type NoticeEventRequest,
} from '../public/personnel.extension-points';
import { OffboardingRefusedError } from './offboarding.errors';
import { toOffboardingApiException } from './offboarding.http-errors';
import { OffboardingFrame } from './offboarding-frame.service';
import { OffboardingRepo } from './offboarding.repo';
import { OffboardingService } from './offboarding.service';

/**
 * Writes the departure a notice of a head announces (`US-03-11` AC-1, AC-4, AC-6): a planned handover with the last working day, or
 * a sudden departure that is `LEFT` at once. The rules of the departure judge the day, the head who goes, the transfer that waits and
 * the handover, exactly as they do for a departure recorded from a document, and what they refuse comes back with their own codes.
 * A person already handing over answers as a duplicate event. A race the database refuses answers `CONCURRENT_CHANGE` (409), never a
 * 500.
 */
@Injectable()
export class OffboardingNoticeRecorder implements OnModuleInit, NoticeEventRecorder {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [NoticeRecorderContributions] as const;

  readonly eventKind = 'OFFBOARDING_CASE' as const;

  constructor(
    private readonly recorders: NoticeRecorderContributions,
    private readonly offboarding: OffboardingService,
    private readonly repo: OffboardingRepo,
    private readonly frame: OffboardingFrame,
  ) {}

  onModuleInit(): void {
    this.recorders.add(this.eventKind, this);
  }

  async record(tx: DbTx, request: NoticeEventRequest): Promise<NoticeEventRef> {
    const { notice, event } = request;
    try {
      const record = await this.frame.guarded(() =>
        this.offboarding.recordInTx(tx, request.actor, {
          employeeId: notice.employeeId,
          lastWorkingDay: event.lastWorkingDay,
          abrupt: notice.kind === 'ABRUPT_DEPARTURE',
          grounds: request.grounds,
          successor: event.successor,
          pendingTransferCancellation: event.pendingTransferCancellation,
          noticeId: notice.id,
        }),
      );

      return { kind: this.eventKind, id: record.id };
    } catch (error) {
      if (error instanceof OffboardingRefusedError && error.code === 'ALREADY_HANDING_OVER')
        throw new NoticeRefusedError('DUPLICATE_EVENT');
      throw toOffboardingApiException(error);
    }
  }

  /** The departure of the person that is in force (handing over or left, not cancelled): the one a notice is tied to. */
  async findLinkable(tx: DbTx, notice: NoticeRecord, eventId: string): Promise<string | null> {
    const found = await this.repo.find(eventId, tx);

    return found && found.employeeId === notice.employeeId && found.state !== 'CANCELLED' ? found.id : null;
  }
}
