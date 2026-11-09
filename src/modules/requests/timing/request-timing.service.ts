import { Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AccessRequestNotFoundError } from '../access-request/access-request.errors';
import { RequestReadAccessService } from '../request-view/request-read-access.service';
import { timingsOf, type RequestTimings } from './request-timing.policy';
import { RequestTimingRepo } from './request-timing.repo';

/** The time a request took, for the people who may read the request (`US-05-15`, `canReadRequest`). */
@Injectable()
export class RequestTimingService {
  constructor(
    private readonly repo: RequestTimingRepo,
    private readonly readAccess: RequestReadAccessService,
  ) {}

  /** Throws AccessRequestNotFoundError when the request does not exist or the caller may not read it. */
  async timingsOf(actor: AuthenticatedPrincipal, requestId: string): Promise<RequestTimings & { requestId: string }> {
    const source = await this.repo.sourceOf(requestId);
    if (source === null || !(await this.readAccess.accessOf(actor, source)).read) {
      throw new AccessRequestNotFoundError();
    }

    return { requestId, ...timingsOf(source.facts) };
  }
}
