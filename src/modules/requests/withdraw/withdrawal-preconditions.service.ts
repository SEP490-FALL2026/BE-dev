import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { LicensingApi } from '../../licensing/public/licensing.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import {
  AccessRequestNotFoundError,
  AccessRequestWithdrawalRefusedError,
} from '../access-request/access-request.errors';
import { canViewRequest, viewFactsOf } from '../access-request/access-request.policy';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { checkWithdrawal } from '../access-request/withdrawal.policy';
import { SpendStatusService } from '../spend/spend-status.service';

/**
 * What a withdrawal needs to hold before anything is written (`US-05-08`, `US-06-14` AC-14): the task of the grant locked before the
 * request, as the IT Admin who works the task locks them, the request found for the people who may see it and the head of its department,
 * and what the policy refuses. Throws AccessRequestNotFoundError and AccessRequestWithdrawalRefusedError.
 */
@Injectable()
export class WithdrawalPreconditions {
  constructor(
    private readonly repo: AccessRequestRepo,
    private readonly licensing: LicensingApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly spendStatus: SpendStatusService,
  ) {}

  async require(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    requestId: string,
    reason: string | null,
  ): Promise<{ request: AccessRequestRecord; now: Date }> {
    // The task of the grant is locked before the request, as the IT Admin who works the task locks them.
    await this.licensing.lockGrantOfRequest(tx, requestId);
    const request = await this.repo.lockById(tx, requestId);
    const now = new Date();
    const today = await this.organizationReads.businessToday(now, tx);
    const headed = await this.organizationReads.getHeadedDepartment(actor.employeeId, today);
    const heads = headed?.departmentId === request?.departmentId;
    if (!request || !(heads || canViewRequest(actor, viewFactsOf(request)))) {
      throw new AccessRequestNotFoundError();
    }

    const refusal = checkWithdrawal({
      actorEmployeeId: actor.employeeId,
      requesterEmployeeId: request.requesterEmployeeId,
      actorHeadsDepartment: heads,
      state: request.state,
      spendStage: (await this.spendStatus.of(request))?.stage ?? null,
      reason,
    });
    if (refusal === 'GRANT_COMPLETED') {
      // The seat is real: the way on is the return of the seat the grant made, which the person names by this id (`US-05-13`).
      const assignmentId = await this.licensing.completedGrantOfRequest(tx, request.id);
      throw new AccessRequestWithdrawalRefusedError('GRANT_COMPLETED', assignmentId ? { assignmentId } : null);
    }
    if (refusal) throw new AccessRequestWithdrawalRefusedError(refusal);

    return { request, now };
  }
}
