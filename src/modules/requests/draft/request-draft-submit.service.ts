import { Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { GroupRequestService } from '../group-request-submission/group-request.service';
import { ServiceAccountRequestService } from '../service-account-request/service-account-request.service';
import {
  AccessRequestNotDraftError,
  AccessRequestNotFoundError,
  AccessRequestSuperAdminCannotRequestError,
} from '../access-request/access-request.errors';
import { mayRequest } from '../access-request/access-request.policy';
import { AccessRequestService } from '../request-submission/access-request.service';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { contentOf } from './request-draft-content.mapper';
import type { DraftKind } from './request-draft.policy';
import { draftVerdict } from './request-draft.policy';
import { RequestDraftRepo } from '../access-request/request-draft.repo';

/**
 * Sends a draft (spec L.1, F27): the request that was saved is sent by the operation that sends that kind of request, with every gate it
 * has (the Super Admin, the finance setup of the department of the sender on the day, the plan and its application, the price, the
 * check of the budget, the routing, the locks), on the content that was saved. It is not a copy: the row of the draft becomes the
 * request, so it is the same request from the day it was saved, and `submittedAt` is the moment it is sent. Everything is one
 * transaction of the sending operation: when any gate refuses, the answer is that operation's own and the draft is untouched.
 */
@Injectable()
export class RequestDraftSubmitService {
  constructor(
    private readonly drafts: RequestDraftRepo,
    private readonly requests: AccessRequestService,
    private readonly groups: GroupRequestService,
    private readonly accounts: ServiceAccountRequestService,
  ) {}

  /**
   * Throws AccessRequestSuperAdminCannotRequestError, AccessRequestNotFoundError, AccessRequestNotDraftError and every error of the
   * operation that sends this kind of request.
   */
  async submit(actor: AuthenticatedPrincipal, id: string): Promise<{ kind: DraftKind; record: AccessRequestRecord }> {
    if (!mayRequest(actor.roles)) throw new AccessRequestSuperAdminCannotRequestError();
    const row = await this.drafts.find(id);
    const verdict = draftVerdict(row, actor.employeeId);
    if (verdict === 'NOT_FOUND' || row === null) throw new AccessRequestNotFoundError();
    if (verdict === 'NOT_DRAFT') throw new AccessRequestNotDraftError();

    // The sending operation locks the draft first and judges it again under the lock, so two sendings of one draft leave one.
    const content = contentOf(row);
    const draft = { draftId: id };
    switch (content.kind) {
      case 'INDIVIDUAL':
        return { kind: content.kind, record: await this.requests.submit(actor, content.body, draft) };
      case 'GROUP':
        return { kind: content.kind, record: await this.groups.submit(actor, content.body, draft) };
      case 'SERVICE_ACCOUNT':
        return { kind: content.kind, record: await this.accounts.submit(actor, content.body, draft) };
    }
  }
}
