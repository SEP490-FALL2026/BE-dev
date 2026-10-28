import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { IdentityAccessService } from '../../identity-access/identity-access.service';
import { AssignmentNotOpenError, RevocationRefusedError } from '../../licensing/licensing.errors';
import { LicensingService } from '../../licensing/licensing.service';
import type { RequestOutcomeEvent, RequestOutcomeListener } from '../../requests/requests.types';
import { RequestsService } from '../../requests/requests.service';
import { personnelSystemAuditEvent } from '../mappers/personnel-audit-event';
import { TransferReviewRepo } from './transfer-review.repo';
import type { StillNeededLine } from './transfer-review.types';

/**
 * What becomes of the old seat of a tool the new head said is still needed (`STILL_NEEDED`, T-6, F43). It waits for a new Request of
 * the department the person is in now, and goes when that Request ends: when its grant task completes (the seat the person now has is
 * the one of the new department, so the old one is released and becomes a free seat of the old department when the vendor has not
 * reduced it) or when it ends without a grant (nothing came to replace it). Until then, and for a tool nobody decided about, nothing
 * is revoked (`US-03-07`). The listener is told in the transaction in which the Request ended, and the revocation opens in the same
 * one through the one gate of `licensing`, in the name of the head who decided, with the review as its reference: asked twice for
 * the same review it changes nothing. The head may also change their mind to "no longer needed" (the decision service opens the
 * same revocation with the same reference): a line that was changed is no longer `STILL_NEEDED`, so it is not read here, and one
 * that meets this listener at the same moment finds the revocation of the review there, so the old seat is taken back once. A seat that is no longer open, or has no revocation, is left and said so in the Audit Trail.
 */
@Injectable()
export class TransferReviewReplacementService implements RequestOutcomeListener, OnModuleInit {
  constructor(
    private readonly requests: RequestsService,
    private readonly reviews: TransferReviewRepo,
    private readonly licensing: LicensingService,
    private readonly identity: IdentityAccessService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    this.requests.registerOutcomeListener(this);
  }

  async requestOutcome(tx: DbTx, event: RequestOutcomeEvent): Promise<void> {
    for (const employeeId of event.beneficiaryEmployeeIds) {
      const lines = await this.reviews.stillNeededFor(tx, {
        employeeId,
        departmentId: event.departmentId,
        planId: event.planId,
      });
      for (const line of lines) await this.revokeOldSeat(tx, event, line);
    }
  }

  private async revokeOldSeat(tx: DbTx, event: RequestOutcomeEvent, line: StillNeededLine): Promise<void> {
    const head = await this.deciderPrincipal(tx, line);
    if (!head) {
      await this.say(tx, event, line, 'OLD_SEAT_REVOCATION_NOT_OPENED', { problem: 'DECIDER_HAS_NO_ACCOUNT' });

      return;
    }
    const source = line.transferId === null ? 'POST_SETUP_REVIEW' : 'TRANSFER_REVIEW';
    try {
      const opened = await this.licensing.openRevocation(tx, head, {
        assignmentId: line.assignmentId,
        source,
        decision: {
          decidedByEmployeeId: line.decidedByEmployeeId,
          decidedRole: 'DEPARTMENT_HEAD',
          referenceKind: source,
          referenceId: line.reviewId,
        },
        context: { departmentId: line.departmentId },
      });
      await this.say(tx, event, line, 'OLD_SEAT_REVOCATION_OPENED', {
        taskId: opened.taskId,
        created: opened.created,
      });
    } catch (error) {
      if (error instanceof AssignmentNotOpenError) {
        await this.say(tx, event, line, 'OLD_SEAT_REVOCATION_NOT_OPENED', { problem: 'SEAT_NOT_OPEN' });

        return;
      }
      if (error instanceof RevocationRefusedError) {
        await this.say(tx, event, line, 'OLD_SEAT_REVOCATION_NOT_OPENED', { problem: error.problem });

        return;
      }
      throw error;
    }
  }

  /** The head who decided, as the principal the gate wants: their account, no role of the IT Admin, the review as the session. */
  private async deciderPrincipal(tx: DbTx, line: StillNeededLine): Promise<AuthenticatedPrincipal | null> {
    const appUserId = await this.identity.findAccountIdOfEmployee(tx, line.decidedByEmployeeId);
    if (!appUserId) return null;

    return {
      subject: appUserId,
      appUserId,
      sessionId: line.reviewId,
      employeeId: line.decidedByEmployeeId,
      directRoles: [],
      derivedRoles: ['MANAGER'],
      roles: ['MANAGER'],
    };
  }

  private say(
    tx: DbTx,
    event: RequestOutcomeEvent,
    line: StillNeededLine,
    action: string,
    facts: { [key: string]: string | boolean },
  ): Promise<void> {
    return this.audit.record(
      tx,
      personnelSystemAuditEvent(
        line.organizationId,
        `TRANSFER_REVIEW.${action}`,
        'TransferReview',
        line.reviewId,
        event.requestId,
        null,
        {
          employeeId: line.employeeId,
          assignmentId: line.assignmentId,
          requestId: event.requestId,
          outcome: event.outcome,
          ...facts,
        },
      ),
    );
  }
}
