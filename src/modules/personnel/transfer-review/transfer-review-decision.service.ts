import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { AssignmentNotOpenError, RevocationRefusedError } from '../../licensing/licensing.errors';
import { LicensingService } from '../../licensing/licensing.service';
import { OrganizationService } from '../../organization/organization.service';
import { personnelAuditEvent } from '../mappers/personnel-audit-event';
import { TransferReviewError } from './transfer-review.errors';
import { mayDecide, statusAfterDecision } from './transfer-review.policy';
import { TransferReviewRepo } from './transfer-review.repo';
import type { DecisionInput, ReviewItemRecord, ReviewRecord } from './transfer-review.types';

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
 */
@Injectable()
export class TransferReviewDecisionService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly reviews: TransferReviewRepo,
    private readonly licensing: LicensingService,
    private readonly organization: OrganizationService,
    private readonly audit: AuditService,
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
      if (review.status !== 'OPEN') throw new TransferReviewError('NOT_OPEN');
      const employee = await this.organization.getEmployee(review.employeeId, tx);
      if (!employee || employee.status !== 'ACTIVE' || employee.workState === 'LEFT') {
        throw new TransferReviewError('EMPLOYEE_LEFT');
      }
      const item = await this.reviews.findItem(tx, review.id, input.assignmentId);
      if (!item) throw new TransferReviewError('ITEM_NOT_FOUND');
      if (item.decision !== 'PENDING') throw new TransferReviewError('DECISION_ALREADY_RECORDED');

      const revocationTaskId =
        input.decision === 'NOT_NEEDED' ? await this.openRevocation(tx, actor, review, item, now) : null;
      const written = await this.reviews.decideItem(tx, review.id, item.assignmentId, {
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
          actor,
          review.organizationId,
          'TRANSFER_REVIEW.DECIDED',
          'TransferReview',
          review.id,
          { decision: 'PENDING' },
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
            actor,
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
   * The revocation of the tool, with the decision of the head as its source and the department of the head as the context the
   * handover step is opened for (the head confirms the data of the person who came, `US-03-09`). K3 and K4 have no revocation.
   */
  private async openRevocation(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    review: ReviewRecord,
    item: ReviewItemRecord,
    now: Date,
  ): Promise<string> {
    try {
      const opened = await this.licensing.openRevocation(tx, actor, {
        assignmentId: item.assignmentId,
        source: 'TRANSFER_REVIEW',
        decision: {
          decidedByEmployeeId: actor.employeeId,
          decidedRole: 'DEPARTMENT_HEAD',
          referenceKind: 'TRANSFER_REVIEW',
          referenceId: review.id,
        },
        context: { departmentId: review.departmentId },
        now,
      });

      return opened.taskId;
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
