import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import { PersonnelNotifier } from '../event-notice/personnel-notifier.service';
import { personnelSystemAuditEvent } from '../personnel-audit-event.mapper';
import { overdueDaysOf } from './transfer-review.policy';
import { TransferReviewRepo } from './transfer-review.repo';

/** How many reviews one pass tells about; the next pass takes the rest. */
const BATCH = 200;

/**
 * Tells, once for each review, that the deadline passed without every tool decided (`US-03-07` AC-6, AC-12): the audit event is the
 * point where the reminder to the head and the alert to the IT Admin in charge of the department are taken from. It only tells. It
 * never takes a seat away, gives the review to somebody else or decides in the place of the head, and the review stays open for the
 * head to decide later. A department without a head is not told: the warning that it has no head is the one that already exists, and
 * the review is told once the department has a head and is still late (`OQ-A-17` (a)). The mark and the event are written together, so
 * a review is told once however many instances run the sweep.
 */
@Injectable()
export class TransferReviewOverdueService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly reviews: TransferReviewRepo,
    private readonly organization: OrganizationApi,
    private readonly audit: AuditApi,
    private readonly notifier: PersonnelNotifier,
  ) {}

  /** Returns how many reviews were told in this pass. */
  async noticeOverdue(now: Date = new Date()): Promise<number> {
    const today = await this.organization.businessToday(now);
    const late = await this.reviews.listOverdueUnnoticed(today, BATCH);
    if (late.length === 0) return 0;
    const heads = await this.organization.getDepartmentHeads(
      [...new Set(late.map((review) => review.departmentId))],
      today,
    );
    let told = 0;
    for (const review of late) {
      const head = heads.get(review.departmentId);
      if (!head) continue;
      const marked = await this.runner.run(async (tx) => {
        if (!(await this.reviews.markOverdueNoticed(tx, review.id, now))) return false;
        await this.audit.record(
          tx,
          personnelSystemAuditEvent(
            review.organizationId,
            'TRANSFER_REVIEW.OVERDUE',
            'TransferReview',
            review.id,
            review.id,
            null,
            {
              employeeId: review.employeeId,
              departmentId: review.departmentId,
              headEmployeeId: head.employeeId,
              dueOn: review.dueOn,
              overdueDays: overdueDaysOf('OPEN', review.dueOn, today),
            },
          ),
        );
        await this.notifier.reviewDue(tx, {
          organizationId: review.organizationId,
          employeeId: review.employeeId,
          departmentId: review.departmentId,
          reviewId: review.id,
          dueOn: review.dueOn,
          headEmployeeId: head.employeeId,
          reminder: true,
        });

        return true;
      });
      if (marked) told += 1;
    }

    return told;
  }
}
