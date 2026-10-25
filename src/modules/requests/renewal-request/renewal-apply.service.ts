import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { BudgetsService } from '../../budgets/budgets.service';
import { AssignmentNotFoundError, AssignmentRenewalRefusedError } from '../../licensing/licensing.errors';
import { LicensingService } from '../../licensing/licensing.service';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { RenewalRequestRepo } from './renewal-request.repo';

/**
 * What approval does to a request for the renewal of a right (`US-05-14` AC-1): it does not wait for the IT Admin, because there
 * is nothing to carry out. In the transaction of the decision that completed the approval (the need step of a request that costs
 * nothing, the spend step of one that costs money) licensing writes the record that follows the old one, the request is
 * completed and the record is named on it. When the seat can no longer be renewed (it ended, or its end changed, or it is being
 * revoked) the request fails, what was held for it goes back to the budget, and the approval already written stays: nobody
 * decides again. The request is locked by the caller, and its state is `AWAITING_EXECUTION`.
 */
@Injectable()
export class RenewalApplyService {
  constructor(
    private readonly requests: AccessRequestRepo,
    private readonly renewals: RenewalRequestRepo,
    private readonly licensing: LicensingService,
    private readonly budgets: BudgetsService,
    private readonly audit: AuditService,
  ) {}

  async apply(tx: DbTx, actor: AuthenticatedPrincipal, request: AccessRequestRecord, now: Date): Promise<void> {
    const detail = request.renewal;
    if (detail === null) throw new Error(`The request ${request.id} is not a request for a renewal.`);

    try {
      const renewed = await this.licensing.renewAssignment(tx, actor, {
        assignmentId: detail.assignmentId,
        requestId: request.id,
        previousExpectedEndDate: detail.previousExpectedEndDate,
        newExpectedEndDate: detail.newExpectedEndDate,
        now,
      });
      await this.renewals.markApplied(tx, request.id, renewed.successorAssignmentId, now);
      await this.requests.setState(tx, request.id, 'COMPLETED');
      await this.audit.record(
        tx,
        accessRequestAuditEvent(
          actor,
          request.organizationId,
          'ACCESS_REQUEST.RENEWAL_APPLIED',
          'ACCESS_REQUEST',
          request.id,
          {
            requestId: request.id,
            assignmentId: detail.assignmentId,
            successorAssignmentId: renewed.successorAssignmentId,
            previousEndsOn: renewed.endsOn,
            newExpectedEndDate: detail.newExpectedEndDate,
            from: 'AWAITING_EXECUTION',
            to: 'COMPLETED',
          },
        ),
      );
    } catch (error) {
      // Only a refusal that is a fact about the seat is told apart; it is raised before anything is written, so the transaction
      // is whole. Any other error is not a refusal and goes on.
      if (!(error instanceof AssignmentRenewalRefusedError || error instanceof AssignmentNotFoundError)) throw error;
      const problem = error instanceof AssignmentRenewalRefusedError ? error.problem : 'NOT_FOUND';

      await this.requests.setState(tx, request.id, 'FAILED');
      await this.budgets.releaseForRequest(tx, { requestId: request.id, reason: 'REQUEST_CANCELLED', now });
      await this.audit.record(
        tx,
        accessRequestAuditEvent(
          actor,
          request.organizationId,
          'ACCESS_REQUEST.RENEWAL_NOT_APPLIED',
          'ACCESS_REQUEST',
          request.id,
          {
            requestId: request.id,
            assignmentId: detail.assignmentId,
            problem,
            from: 'AWAITING_EXECUTION',
            to: 'FAILED',
          },
        ),
      );
    }
  }
}
