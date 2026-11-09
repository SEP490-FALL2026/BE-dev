import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { BudgetsApi } from '../../budgets/public/budgets.api';
import { AssignmentNotFoundError, AssignmentRenewalRefusedError } from '../../licensing/public/licensing.errors';
import { LicensingRenewalApi } from '../../licensing/public/licensing-renewal.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { RenewalRequestRepo } from './renewal-request.repo';

/**
 * What approval does to a request for the renewal of a right (`US-05-14` AC-1, `BR-MF1-08d`): approval does not extend the right. In the
 * transaction of the decision that completed the approval (the need step of a request that costs nothing, the spend step of one that costs
 * money) an IT task of the kind EXTEND is opened on the seat (`requestExtension`), and the request waits for it in `AWAITING_EXECUTION`;
 * the right is held as it is meanwhile, even past its end (the renewal is pending). When the IT Admin completes the task, licensing asks
 * this module to apply it (`apply`): the record that follows the old one is written (the old one is not edited), the request is completed
 * and the record is named on it. When the seat can no longer be renewed (it ended, or its end changed, or it is being revoked) the request
 * fails, what was held for it goes back to the budget, and the approval already written stays: nobody decides again. The request is
 * locked by the caller.
 */
@Injectable()
export class RenewalApplyService {
  constructor(
    private readonly requests: AccessRequestRepo,
    private readonly renewals: RenewalRequestRepo,
    private readonly licensingRenewals: LicensingRenewalApi,
    private readonly budgets: BudgetsApi,
    private readonly audit: AuditApi,
  ) {}

  /** At approval: opens the IT task that extends the right; the request stays `AWAITING_EXECUTION` until the task is completed. */
  async requestExtension(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    now: Date,
  ): Promise<void> {
    const detail = request.renewal;
    if (detail === null) throw new Error(`The request ${request.id} is not a request for a renewal.`);
    try {
      const { taskId } = await this.licensingRenewals.openExtension(tx, actor, {
        assignmentId: detail.assignmentId,
        requestId: request.id,
        now,
      });
      await this.audit.record(
        tx,
        accessRequestAuditEvent(
          actor,
          request.organizationId,
          'ACCESS_REQUEST.EXTENSION_REQUESTED',
          'ACCESS_REQUEST',
          request.id,
          {
            requestId: request.id,
            assignmentId: detail.assignmentId,
            taskId,
            newExpectedEndDate: detail.newExpectedEndDate,
          },
        ),
      );
    } catch (error) {
      await this.fail(tx, actor, request, error, now);
    }
  }

  /** When the IT Admin completed the task of the extension: writes the record that follows the old one and completes the request. */
  async apply(tx: DbTx, actor: AuthenticatedPrincipal, request: AccessRequestRecord, now: Date): Promise<void> {
    const detail = request.renewal;
    if (detail === null) throw new Error(`The request ${request.id} is not a request for a renewal.`);

    try {
      const renewed = await this.licensingRenewals.renewAssignment(tx, actor, {
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
      await this.fail(tx, actor, request, error, now);
    }
  }

  /**
   * The seat can no longer be renewed: the request fails and what was held for it goes back. Only a refusal that is a fact about the seat
   * is told apart; it is raised before anything is written, so the transaction is whole. Any other error is not a refusal and goes on.
   */
  private async fail(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    error: unknown,
    now: Date,
  ): Promise<void> {
    const detail = request.renewal;
    if (detail === null) throw error;
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
