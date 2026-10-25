import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { BudgetsService } from '../../budgets/budgets.service';
import { LicensingService } from '../../licensing/licensing.service';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event';
import { AccessRequestNotFoundError } from '../access-request/access-request.errors';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { ServiceAccountReviewRefusedError } from './service-account-request.errors';
import { reviewRefusal, verdictOf, type ReviewDecision } from './service-account-request.policy';
import { ServiceAccountRequestRepo } from './service-account-request.repo';

/**
 * The IT Admin reads the purpose of a request for a service account and says whether it is a non-human subject
 * (`US-05-21` AC-3): the one thing that keeps a shared mailbox of three people from becoming a seat. It is asked once the
 * request waits to be carried out, so a refusal can come after the money was held; in the same transaction the request ends
 * as refused by the IT Admin, and what was held for it goes back to the budget. No assignment or task exists to undo. An
 * acceptance leaves the request as it is, and only then may it be granted. An IT Admin who answers for the account themselves
 * decides only when no other usable IT Admin can (`QĐ-77m`), and the act is marked as self-executed. A refused decision
 * changes nothing. The audit events carry neither the purpose nor the reason.
 */
@Injectable()
export class ServiceAccountBoundaryService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly requests: AccessRequestRepo,
    private readonly details: ServiceAccountRequestRepo,
    private readonly budgets: BudgetsService,
    private readonly licensing: LicensingService,
    private readonly audit: AuditService,
  ) {}

  /** Throws AccessRequestNotFoundError, ServiceAccountReviewRefusedError and ProvisioningAnotherItAdminNeededError. */
  async review(
    actor: AuthenticatedPrincipal,
    requestId: string,
    decision: ReviewDecision,
  ): Promise<AccessRequestRecord> {
    return this.runner.run(async (tx) => {
      const request = await this.requests.lockById(tx, requestId);
      if (!request) throw new AccessRequestNotFoundError();
      const refusal = reviewRefusal(request);
      if (refusal) throw new ServiceAccountReviewRefusedError(refusal);
      const detail = request.serviceAccount;
      if (!detail) throw new ServiceAccountReviewRefusedError('NOT_REVIEWABLE');

      const verdict = verdictOf(decision);
      if (!verdict) throw new ServiceAccountReviewRefusedError('REASON_REQUIRED');
      const mode = await this.licensing.selfExecutionMode(actor, detail.responsibleEmployeeId);
      const now = new Date();
      await this.details.recordVerdict(tx, request.id, verdict, {
        employeeId: actor.employeeId,
        at: now,
        selfExecuted: mode === 'ALLOW_SELF_EXECUTED',
      });
      let released = false;
      if (verdict.state === 'REJECTED') {
        await this.requests.setState(tx, request.id, 'IT_REJECTED');
        // Nothing is given back for a request that held nothing (the branch of free software has no commitment).
        released =
          (await this.budgets.releaseForRequest(tx, { requestId: request.id, reason: 'REQUEST_CANCELLED', now }))
            .length > 0;
      }

      await this.audit.record(
        tx,
        accessRequestAuditEvent(
          actor,
          request.organizationId,
          verdict.state === 'ACCEPTED'
            ? 'ACCESS_REQUEST.SERVICE_ACCOUNT_BOUNDARY_ACCEPTED'
            : 'ACCESS_REQUEST.SERVICE_ACCOUNT_BOUNDARY_REJECTED',
          'ACCESS_REQUEST',
          request.id,
          {
            requestId: request.id,
            requestState: verdict.state === 'ACCEPTED' ? request.state : 'IT_REJECTED',
            responsibleEmployeeId: detail.responsibleEmployeeId,
            selfExecuted: mode === 'ALLOW_SELF_EXECUTED',
            ...(verdict.state === 'REJECTED' ? { released } : {}),
          },
        ),
      );

      const record = await this.requests.findById(request.id, tx);
      if (!record) throw new Error(`The request ${request.id} was not found after its boundary was decided.`);

      return record;
    });
  }
}
