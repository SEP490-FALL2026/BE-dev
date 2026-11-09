import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import {
  AccessRequestAlreadyHoldsAccessError,
  AccessRequestNotDraftError,
  AccessRequestNotFoundError,
  AccessRequestSuperAdminCannotRequestError,
  AccessRequestTermBeyondLimitError,
} from '../access-request/access-request.errors';
import { mayRequest } from '../access-request/access-request.policy';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { RequestFactsService, type RequestSettings } from '../access-request/request-facts.service';
import { RequestSenderService } from './request-sender.service';
import { RequestDraftRepo } from '../request-draft/request-draft.repo';
import type { SubmitBodyDto } from '../access-request/access-request.dto';
import {
  newRequestOf,
  routedAuditDetail,
  submittedAuditDetail,
  type SubmittedRequest,
} from './access-request-submission.mapper';

/**
 * Sending a request (`US-05-02`, `US-05-03`, `US-01-12` AC-1): the caller asks for access to one plan for themselves. The
 * branch and the chain of steps come from the kind of the application, the department and its Unit Cost Center from the
 * day the request is sent, and the need step is given to the one person the routing table names, or left waiting under
 * control when nobody valid exists. Everything is written in one transaction with its audit events, so a request never
 * exists without them and a refused request leaves nothing behind. What the request is judged by is read by
 * `RequestFactsService`, the same read the preview before sending shows.
 */
/** What a sending that is not the plain one says: the seat that is not held against the sender, and the draft it comes from. */
export interface SubmitOptions {
  /**
   * The seat a request for the renewal of a right that has ended leaves out of the check of the seat the person holds: it is the
   * seat the new request is for, still held because its revocation has not been done (`US-05-14` AC-5).
   */
  toleratedSeatId?: string;
  /** The draft this request is sent from: it is locked first, judged again under the lock, and becomes the request. */
  draftId?: string;
}

@Injectable()
export class AccessRequestService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly repo: AccessRequestRepo,
    private readonly sender: RequestSenderService,
    private readonly assessment: RequestFactsService,
    private readonly audit: AuditApi,
    private readonly drafts: RequestDraftRepo,
  ) {}

  async submit(
    actor: AuthenticatedPrincipal,
    body: SubmitBodyDto,
    options: SubmitOptions = {},
  ): Promise<AccessRequestRecord> {
    if (!mayRequest(actor.roles)) throw new AccessRequestSuperAdminCannotRequestError();
    const settings = await this.assessment.settings();

    return this.runner.run((tx) => this.submitWithin(tx, actor, body, settings, options));
  }

  /**
   * Sends the request in the transaction of the caller, which has read the settings before it opened (the renewal of a right
   * that has ended becomes a request like this one, in the transaction in which it was judged).
   */
  async submitWithin(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    body: SubmitBodyDto,
    settings: RequestSettings,
    options: SubmitOptions = {},
  ): Promise<AccessRequestRecord> {
    // The Super Admin sends no request, on any route that sends one, the renewal that is sent late included.
    if (!mayRequest(actor.roles)) throw new AccessRequestSuperAdminCannotRequestError();
    if (options.draftId) await this.lockDraft(tx, actor, options.draftId);
    // The person sending is relied on until commit (they cannot be removed from the company between the check and the write), and is
    // judged as a party of a Request before any department is read (`D-S21`).
    const employee = await this.sender.lockEligible(tx, actor);

    const now = new Date();
    const assessed = await this.assessment.assess(tx, {
      employeeId: actor.employeeId,
      planId: body.planId,
      termMonths: body.termMonths,
      now,
      settings,
      lockDepartment: true,
    });
    if (assessed.heldAccess && assessed.heldAccess.assignmentId !== options.toleratedSeatId) {
      throw new AccessRequestAlreadyHoldsAccessError(assessed.heldAccess);
    }
    if (assessed.termBeyondLimit) {
      throw new AccessRequestTermBeyondLimitError(assessed.termLimit.maxMonths, assessed.termLimit.endsBy);
    }
    const sent: SubmittedRequest = {
      actor,
      organizationId: employee.organizationId,
      body,
      assessed,
      now,
      draftId: options.draftId,
    };
    const created = await this.repo.insert(tx, newRequestOf(sent));
    await this.auditSubmitted(tx, actor, sent, created);

    const record = await this.repo.findById(created.id, tx);
    if (!record) throw new Error(`The request ${created.id} was not found after it was written.`);

    return record;
  }

  /** A draft is locked before anything is read for the sending, and judged again under the lock: two sendings of one draft leave one. */
  private async lockDraft(tx: DbTx, actor: AuthenticatedPrincipal, draftId: string): Promise<void> {
    const verdict = await this.drafts.lockOwned(tx, draftId, actor.employeeId);
    if (verdict === 'NOT_FOUND') throw new AccessRequestNotFoundError();
    if (verdict === 'NOT_DRAFT') throw new AccessRequestNotDraftError();
  }

  /** The request is sent, and the need step is routed: two entries in the same transaction as the request. */
  private async auditSubmitted(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    sent: SubmittedRequest,
    created: { id: string; needStepId: string },
  ): Promise<void> {
    await this.audit.record(
      tx,
      accessRequestAuditEvent(
        actor,
        sent.organizationId,
        'ACCESS_REQUEST.SUBMITTED',
        'ACCESS_REQUEST',
        created.id,
        submittedAuditDetail(sent),
      ),
    );
    await this.audit.record(
      tx,
      accessRequestAuditEvent(
        actor,
        sent.organizationId,
        'ACCESS_REQUEST.NEED_STEP_ROUTED',
        'ACCESS_REQUEST_STEP',
        created.needStepId,
        routedAuditDetail(sent, created.id),
      ),
    );
  }
}
