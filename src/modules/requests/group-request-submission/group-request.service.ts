import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import {
  AccessRequestNoDepartmentError,
  AccessRequestNotDraftError,
  AccessRequestNotFoundError,
  AccessRequestSuperAdminCannotRequestError,
} from '../access-request/access-request.errors';
import { mayRequest } from '../access-request/access-request.policy';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import { RequestDraftRepo } from '../request-draft/request-draft.repo';
import type { AccessRequestRecord, PricingRecord } from '../access-request/access-request.types';
import { RequestFactsService, type RequestSettings } from '../access-request/request-facts.service';
import {
  GroupRequestDuplicateLineError,
  GroupRequestLinesRefusedError,
  GroupRequestPlanNotEligibleError,
  GroupRequestTermBeyondLimitError,
  GroupRequestTooFewLinesError,
  GroupRequestTooManyLinesError,
} from '../group-request/group-request.errors';
import { planNeedSteps } from './group-need-routing.policy';
import { GroupRequestWriter } from './group-request-writer.service';
import { type LineReason, type PlanRefusal } from '../group-request/group-request.policy';
import {
  GroupSubmissionFactsService,
  type GroupJudgement,
  type GroupLineInput,
} from './group-submission-facts.service';

export interface GroupBody {
  planId: string;
  lines: readonly GroupLineInput[];
  businessReason: string;
  /** The day the access of every person named ends; absent for no end. */
  expectedEndDate?: string;
}

/** What `POST /group-requests/check` says: every reason at once, and nothing written. */
export interface GroupCheck {
  plan: { eligible: boolean; reason: PlanRefusal | null };
  tooManyLines: { max: number } | null;
  tooFewLines: { min: number } | null;
  maxEndDate: string;
  endDateOutOfRange: boolean;
  lines: { employeeId: string; ok: boolean; reason: LineReason | 'DUPLICATE_LINE' | null }[];
  pricing: PricingRecord;
  lineCount: number;
}

/**
 * Sending a request for a group of people of one department (`US-05-17`, `US-05-03` AC-8, AC-14, `US-05-02` AC-2): one request for
 * the people named, a line for each, one amount, one Cost Center and one spend step. What is judged is the same for the check and the
 * sending (`GroupSubmissionFactsService`), the sending refuses all of it or writes all of it in one transaction, and the people
 * go to the need step that holds them (`planNeedSteps`): the others to the head (a head who sends confirms them by sending), the
 * head's own line to whoever decides a head's own request, so that nobody decides their own line.
 */
@Injectable()
export class GroupRequestService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly facts: GroupSubmissionFactsService,
    private readonly assessment: RequestFactsService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly requests: AccessRequestRepo,
    private readonly drafts: RequestDraftRepo,
    private readonly writer: GroupRequestWriter,
  ) {}

  /** Every reason the request cannot be sent, and what it would cost, without writing anything. */
  async check(actor: AuthenticatedPrincipal, body: GroupBody): Promise<GroupCheck> {
    const settings = await this.assessment.settings();

    return this.runner.run(async (tx) => {
      await this.requireSender(tx, actor);
      await this.facts.requireEligibleSender(tx, actor.employeeId, { lock: false });
      const judged = await this.facts.judge(tx, this.input(actor, body, settings, false));
      const refused = new Map(judged.refused.map((line) => [line.employeeId, line.reason]));

      return {
        plan: { eligible: judged.planRefusal === null, reason: judged.planRefusal },
        tooManyLines: judged.count.tooMany,
        tooFewLines: judged.count.tooFew,
        maxEndDate: judged.assessed.maxEndDate,
        endDateOutOfRange: judged.assessed.endDateOutOfRange,
        lines: judged.lines.map((line) => {
          const duplicate = judged.count.duplicates.includes(line.employeeId);
          const reason = duplicate ? ('DUPLICATE_LINE' as const) : (refused.get(line.employeeId) ?? null);

          return { employeeId: line.employeeId, ok: reason === null, reason };
        }),
        pricing: judged.pricing,
        lineCount: judged.lines.length,
      };
    });
  }

  /**
   * Throws AccessRequestSuperAdminCannotRequestError, RequestPartyIneligibleError (the sender; a line is a reason of its line),
   * GroupRequestPlanNotEligibleError, GroupRequestTooManyLinesError, GroupRequestTooFewLinesError,
   * GroupRequestDuplicateLineError, GroupRequestLinesRefusedError,
   * AccessRequestNoDepartmentError and the errors of assessing a plan. A draft (draftId) is the request being sent: it is locked first,
   * judged again under the lock, and its row becomes the request; AccessRequestNotFoundError and AccessRequestNotDraftError.
   */
  async submit(
    actor: AuthenticatedPrincipal,
    body: GroupBody,
    options: { draftId?: string } = {},
  ): Promise<AccessRequestRecord> {
    if (!mayRequest(actor.roles)) throw new AccessRequestSuperAdminCannotRequestError();
    const settings = await this.assessment.settings();

    return this.runner.run(async (tx) => {
      if (options.draftId) {
        const verdict = await this.drafts.lockOwned(tx, options.draftId, actor.employeeId);
        if (verdict === 'NOT_FOUND') throw new AccessRequestNotFoundError();
        if (verdict === 'NOT_DRAFT') throw new AccessRequestNotDraftError();
      }
      const organizationId = await this.requireSender(tx, actor);
      await this.facts.requireEligibleSender(tx, actor.employeeId, { lock: true });
      const judged = await this.facts.judge(tx, this.input(actor, body, settings, true));
      this.refuse(judged);

      const planned = planNeedSteps({
        senderEmployeeId: actor.employeeId,
        senderIsHead: judged.senderIsHead,
        headEmployeeId: judged.headEmployeeId,
        lines: judged.lines,
        facts: judged.assessed.routing.facts,
        slaWorkingDays: settings.slaWorkingDays,
      });
      const request = await this.writer.write(tx, actor, {
        organizationId,
        judged,
        planned,
        body,
        draftId: options.draftId ?? null,
      });

      const final = await this.requests.findById(request.id, tx);
      if (!final) throw new Error(`The request ${request.id} was not found after it was written.`);

      return final;
    });
  }

  private input(actor: AuthenticatedPrincipal, body: GroupBody, settings: RequestSettings, lockPeople: boolean) {
    return {
      senderEmployeeId: actor.employeeId,
      planId: body.planId,
      expectedEndDate: body.expectedEndDate ?? null,
      lines: body.lines,
      now: new Date(),
      settings,
      lockPeople,
    };
  }

  /** The sender is relied on until commit: they cannot be removed from the company between the check and the write. */
  private async requireSender(tx: DbTx, actor: AuthenticatedPrincipal): Promise<string> {
    await this.organizationReads.lockEmployeeForShare(tx, actor.employeeId);
    const employee = await this.organizationReads.getEmployee(actor.employeeId, tx);
    if (!employee) throw new AccessRequestNoDepartmentError();

    return employee.organizationId;
  }

  /** The first thing that makes the sending impossible, in the order a caller should learn it. */
  private refuse(judged: GroupJudgement): void {
    if (judged.planRefusal !== null) throw new GroupRequestPlanNotEligibleError(judged.planRefusal);
    if (judged.count.tooMany !== null) throw new GroupRequestTooManyLinesError(judged.count.tooMany.max);
    if (judged.assessed.endDateOutOfRange) throw new GroupRequestTermBeyondLimitError(judged.assessed.maxEndDate);
    if (judged.count.tooFew !== null) throw new GroupRequestTooFewLinesError(judged.count.tooFew.min);
    if (judged.count.duplicates.length > 0) throw new GroupRequestDuplicateLineError(judged.count.duplicates);
    if (judged.refused.length > 0) throw new GroupRequestLinesRefusedError(judged.refused);
  }
}
