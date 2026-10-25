import { Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AccessRequestNotFoundError } from '../access-request/access-request.errors';
import { canViewRequest } from '../access-request/access-request.policy';
import { timingsOf, type RequestTimings } from './request-timing.policy';
import { RequestTimingRepo } from './request-timing.repo';

/** The time a request took, for the people who may see the request (`US-05-15`). */
@Injectable()
export class RequestTimingService {
  constructor(private readonly repo: RequestTimingRepo) {}

  /** Throws AccessRequestNotFoundError when the request does not exist or the caller may not see it. */
  async timingsOf(actor: AuthenticatedPrincipal, requestId: string): Promise<RequestTimings & { requestId: string }> {
    const source = await this.repo.sourceOf(requestId);
    if (
      source === null ||
      !canViewRequest(actor, {
        requesterEmployeeId: source.requesterEmployeeId,
        beneficiaryEmployeeIds: source.beneficiaryEmployeeIds,
        needStepAssigneeEmployeeId: source.needStepAssigneeEmployeeId,
      })
    ) {
      throw new AccessRequestNotFoundError();
    }

    return { requestId, ...timingsOf(source.facts) };
  }
}
