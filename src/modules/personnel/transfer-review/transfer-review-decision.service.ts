import { Injectable } from '@nestjs/common';
import { TransactionRunner, readSqlState, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { AssignmentNotOpenError, RevocationRefusedError } from '../../licensing/public/licensing.errors';
import type { OpenedRevocation } from '../../licensing/public/licensing.types';
import { LicensingApi } from '../../licensing/public/licensing.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import { personnelAuditEvent } from '../mappers/personnel-audit-event.mapper';
import { userActor } from '../public/personnel.types';
import { TransferReviewError } from './transfer-review.errors';
import { isChangeOfMind, mayDecide, mayRecordDecision, statusAfterDecision } from './transfer-review.policy';
import { TransferReviewRepo } from './transfer-review.repo';
import type { DecisionInput, ReviewItemRecord, ReviewRecord } from './transfer-review.types';

/** What a revocation this review opens is asked for as: the review after a transfer, or the review after the setup (F21). */
const sourceOf = (review: ReviewRecord): 'TRANSFER_REVIEW' | 'POST_SETUP_REVIEW' =>
  review.transferId === null ? 'POST_SETUP_REVIEW' : 'TRANSFER_REVIEW';

export interface DecisionOutcome {
  review: ReviewRecord;
  item: ReviewItemRecord;
  pendingItems: number;
}

/**
 * The head of the department decides about a tool the person brought (`US-03-07` AC-3 to AC-5, AC-9, AC-11, AC-13, AC-14, `US-07-05`
 * AC-9). One transaction, the review locked: who decides is read from the organization today, the decision is written once, and
 * "no longer needed" opens the revocation through the licensing gate in the same transaction, so there is never a revocation
 * before the head decided and never a decision without the revocation it asks for. A review that is late is decided like any other.
 * One decision may be changed, once, through this same route: a tool the head said is still needed (`STILL_NEEDED`, which waits for a
 * new Request of the department, T-6) may become "no longer needed", and then the revocation opens now exactly as for a first
 * "no longer needed", and the Audit Trail event keeps the earlier decision in `before`. It is refused (`DECISION_ALREADY_RECORDED`)
 * for any other change, and once the old seat is on its way back (the revocation of this review exists: the new Request ended and
 * `TransferReviewReplacementService` asked for it), so the seat is taken back once, whoever comes first. The revocation is asked
 * for with the review as its reference, so licensing answers a second ask with the task that exists and no new reason. The lock
 * order is the one of every decision: the review, then the organization reads, then the seat in licensing. The source of the
 * revocation is the review after the transfer, or the review after the setup for a person who holds a seat of another department
 * (`POST_SETUP_REVIEW`, F21).
 */
@Injectable()
export class TransferReviewDecisionService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly reviews: TransferReviewRepo,
    private readonly licensing: LicensingApi,
    private readonly organization: OrganizationApi,
    private readonly audit: AuditApi,
  ) {}

  /** Throws TransferReviewError (`NOT_FOUND`, `NOT_REVIEWER`, `NOT_OPEN`, `EMPLOYEE_LEFT`, `ITEM_NOT_FOUND`, `DECISION_ALREADY_RECORDED`, ...). */
  decide(actor: AuthenticatedPrincipal, reviewId: string, input: DecisionInput): Promise<DecisionOutcome> {
    return this.runner.run(async (tx) => {
      const now = new Date();
      const review = await this.reviews.lock(tx, reviewId);
      if (!review) throw new TransferReviewError('NOT_FOUND');

      const today = await this.organization.businessToday(now, tx);
      const head = (await this.organization.getDepartmentHeads([review.departmentId], today, tx)).get(
        review.departmentId,
      );
      if (!mayDecide(head?.employeeId ?? null, actor.employeeId)) throw new TransferReviewError('NOT_REVIEWER');
      // A review that was replaced is closed to every decision; one that is complete is closed to all but the change of mind below.
      if (review.status === 'SUPERSEDED') throw new TransferReviewError('NOT_OPEN');
      const employee = await this.organization.getEmployee(review.employeeId, tx);
      if (!employee || employee.status !== 'ACTIVE' || employee.workState === 'LEFT') {
        throw new TransferReviewError('EMPLOYEE_LEFT');
      }
      const item = await this.reviews.findItem(tx, review.id, input.assignmentId);
      if (!item) throw new TransferReviewError('ITEM_NOT_FOUND');
      const changing = isChangeOfMind(item.decision, input.decision);
      if (review.status !== 'OPEN' && !changing) throw new TransferReviewError('NOT_OPEN');
      if (!mayRecordDecision(item.decision, input.decision)) throw new TransferReviewError('DECISION_ALREADY_RECORDED');

      const opened = input.decision === 'NOT_NEEDED' ? await this.openRevocation(tx, actor, review, item, now) : null;
      // The revocation of this review exists already: the old seat is on its way back, so there is nothing to change. Nothing is saved.
      if (changing && opened && !opened.created && !opened.reasonAdded) {
        throw new TransferReviewError('DECISION_ALREADY_RECORDED');
      }
      const revocationTaskId = opened?.taskId ?? null;
      const written =
        changing && revocationTaskId !== null
          ? await this.changeMind(tx, review.id, item.assignmentId, actor.employeeId, now, revocationTaskId)
          : await this.reviews.decideItem(tx, review.id, item.assignmentId, {
              decision: input.decision,
              byEmployeeId: actor.employeeId,
              at: now,
              note: input.newToolNote?.trim() ?? null,
              revocationTaskId,
            });
      if (!written) throw new TransferReviewError('DECISION_ALREADY_RECORDED');
      await this.audit.record(
        tx,
        personnelAuditEvent(
          userActor(actor),
          review.organizationId,
          changing ? 'TRANSFER_REVIEW.DECISION_CHANGED' : 'TRANSFER_REVIEW.DECIDED',
          'TransferReview',
          review.id,
          { decision: item.decision },
          {
            assignmentId: item.assignmentId,
            planId: item.planId,
            employeeId: review.employeeId,
            decision: input.decision,
            decidedByEmployeeId: actor.employeeId,
            revocationTaskId,
            late: today > review.dueOn,
          },
        ),
      );

      const pendingItems = await this.reviews.countPending(tx, review.id);
      let current = review;
      if (statusAfterDecision(pendingItems) === 'COMPLETED' && (await this.reviews.complete(tx, review.id, now))) {
        await this.audit.record(
          tx,
          personnelAuditEvent(
            userActor(actor),
            review.organizationId,
            'TRANSFER_REVIEW.COMPLETED',
            'TransferReview',
            review.id,
            { status: 'OPEN' },
            {
              status: 'COMPLETED',
              employeeId: review.employeeId,
              departmentId: review.departmentId,
            },
          ),
        );
        current = (await this.reviews.find(review.id, tx)) ?? review;
      }
      const decided = (await this.reviews.findItem(tx, review.id, item.assignmentId)) ?? item;

      return { review: current, item: decided, pendingItems };
    });
  }

  /**
   * The one change of a decision: `STILL_NEEDED` to `NOT_NEEDED`. The database refuses every other change of a decided line (the
   * trigger `transfer_review_item_guard` lets this one through while the line has no revocation task), and what it refuses is the
   * answer of a decision written once.
   */
  private async changeMind(
    tx: DbTx,
    reviewId: string,
    assignmentId: string,
    byEmployeeId: string,
    at: Date,
    revocationTaskId: string,
  ): Promise<boolean> {
    try {
      return await this.reviews.changeStillNeededToNotNeeded(tx, reviewId, assignmentId, {
        byEmployeeId,
        at,
        revocationTaskId,
      });
    } catch (error) {
      if (readSqlState(error) === '55000') throw new TransferReviewError('DECISION_ALREADY_RECORDED');
      throw error;
    }
  }

  /**
   * The revocation of the tool, with the decision of the head as its source and the department of the head as the context the
   * handover step is opened for (the head confirms the data of the person who came, `US-03-09`). K3 and K4 have no revocation.
   */
  private async openRevocation(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    review: ReviewRecord,
    item: ReviewItemRecord,
    now: Date,
  ): Promise<OpenedRevocation> {
    try {
      return await this.licensing.openRevocation(tx, actor, {
        assignmentId: item.assignmentId,
        source: sourceOf(review),
        decision: {
          decidedByEmployeeId: actor.employeeId,
          decidedRole: 'DEPARTMENT_HEAD',
          referenceKind: sourceOf(review),
          referenceId: review.id,
        },
        context: { departmentId: review.departmentId },
        now,
      });
    } catch (error) {
      if (error instanceof RevocationRefusedError && error.problem === 'TYPE_NOT_SUPPORTED') {
        throw new TransferReviewError('REVOCATION_NOT_SUPPORTED', {
          ...(error.provisioningType ? { provisioningType: error.provisioningType } : {}),
        });
      }
      if (error instanceof AssignmentNotOpenError) throw new TransferReviewError('SEAT_NOT_OPEN');
      throw error;
    }
  }
}
