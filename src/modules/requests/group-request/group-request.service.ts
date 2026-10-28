import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { OrganizationService } from '../../organization/organization.service';
import { SpendEntryService } from '../spend/spend-entry.service';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event';
import {
  AccessRequestNoDepartmentError,
  AccessRequestNotDraftError,
  AccessRequestNotFoundError,
  AccessRequestSuperAdminCannotRequestError,
} from '../access-request/access-request.errors';
import { mayRequest } from '../access-request/access-request.policy';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import { RequestDraftRepo } from '../access-request/request-draft.repo';
import type { AccessRequestRecord, PricingRecord } from '../access-request/access-request.types';
import { LONG_TERM_MONTHS, nextRequestState } from '../access-request/need-decision.policy';
import { RequestAssessmentService, type RequestSettings } from '../access-request/request-assessment.service';
import {
  GroupRequestDuplicateLineError,
  GroupRequestLinesRefusedError,
  GroupRequestPlanNotEligibleError,
  GroupRequestTermConfirmationRequiredError,
  GroupRequestTooManyLinesError,
} from './group-request.errors';
import { submissionEvents } from './group-request-trail';
import { planNeedSteps, type PlannedNeedStep } from './group-need-routing.policy';
import { needsTermConfirmation, type LineReason, type PlanRefusal } from './group-request.policy';
import {
  GroupSubmissionFactsService,
  type GroupJudgement,
  type GroupLineInput,
} from './group-submission-facts.service';
import { LineDecisionRepo } from './line-decision.repo';
import { RequestLineRepo } from './request-line.repo';

export interface GroupBody {
  planId: string;
  lines: readonly GroupLineInput[];
  businessReason: string;
  termMonths: number;
  projectLabel?: string;
  expectedSpendOn?: string;
  termConfirmation?: { reason: string };
}

/** What `POST /group-requests/check` says: every reason at once, and nothing written. */
export interface GroupCheck {
  plan: { eligible: boolean; reason: PlanRefusal | null };
  tooManyLines: { max: number } | null;
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
    private readonly assessment: RequestAssessmentService,
    private readonly organization: OrganizationService,
    private readonly requests: AccessRequestRepo,
    private readonly lines: RequestLineRepo,
    private readonly decisions: LineDecisionRepo,
    private readonly entry: SpendEntryService,
    private readonly audit: AuditService,
    private readonly drafts: RequestDraftRepo,
  ) {}

  /** Every reason the request cannot be sent, and what it would cost, without writing anything. */
  async check(actor: AuthenticatedPrincipal, body: GroupBody): Promise<GroupCheck> {
    const settings = await this.assessment.settings();

    return this.runner.run(async (tx) => {
      await this.requireSender(tx, actor);
      const judged = await this.facts.judge(tx, this.input(actor, body, settings, false));
      const refused = new Map(judged.refused.map((line) => [line.employeeId, line.reason]));

      return {
        plan: { eligible: judged.planRefusal === null, reason: judged.planRefusal },
        tooManyLines: judged.count.tooMany,
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
   * Throws AccessRequestSuperAdminCannotRequestError, GroupRequestPlanNotEligibleError, GroupRequestTooManyLinesError,
   * GroupRequestDuplicateLineError, GroupRequestLinesRefusedError, GroupRequestTermConfirmationRequiredError,
   * AccessRequestNoDepartmentError and the errors of assessing a plan. A draft (draftId) is the request being sent: it is locked first,
   * judged again under the lock, and its row becomes the request (spec L.1); AccessRequestNotFoundError and AccessRequestNotDraftError.
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
      const judged = await this.facts.judge(tx, this.input(actor, body, settings, true));
      this.refuse(judged, body);

      const planned = planNeedSteps({
        senderEmployeeId: actor.employeeId,
        senderIsHead: judged.senderIsHead,
        headEmployeeId: judged.headEmployeeId,
        lines: judged.lines,
        facts: judged.assessed.routing.facts,
        slaWorkingDays: settings.slaWorkingDays,
      });
      const request = await this.write(tx, actor, organizationId, judged, planned, body, options.draftId ?? null);
      if (request.state === 'AWAITING_SPEND_SUBMISSION') await this.entry.enter(tx, actor, request);

      const final = await this.requests.findById(request.id, tx);
      if (!final) throw new Error(`The request ${request.id} was not found after it was written.`);

      return final;
    });
  }

  private input(actor: AuthenticatedPrincipal, body: GroupBody, settings: RequestSettings, lockPeople: boolean) {
    return {
      senderEmployeeId: actor.employeeId,
      planId: body.planId,
      termMonths: body.termMonths,
      expectedSpendOn: body.expectedSpendOn,
      lines: body.lines,
      now: new Date(),
      settings,
      lockPeople,
    };
  }

  /** The sender is relied on until commit: they cannot be removed from the company between the check and the write. */
  private async requireSender(tx: DbTx, actor: AuthenticatedPrincipal): Promise<string> {
    await this.organization.lockEmployeeForShare(tx, actor.employeeId);
    const employee = await this.organization.getEmployee(actor.employeeId, tx);
    if (!employee) throw new AccessRequestNoDepartmentError();

    return employee.organizationId;
  }

  /** The first thing that makes the sending impossible, in the order a caller should learn it. */
  private refuse(judged: GroupJudgement, body: GroupBody): void {
    if (judged.planRefusal !== null) throw new GroupRequestPlanNotEligibleError(judged.planRefusal);
    if (judged.count.tooMany !== null) throw new GroupRequestTooManyLinesError(judged.count.tooMany.max);
    if (judged.count.duplicates.length > 0) throw new GroupRequestDuplicateLineError(judged.count.duplicates);
    if (judged.refused.length > 0) throw new GroupRequestLinesRefusedError(judged.refused);
    if (
      needsTermConfirmation({
        senderIsHead: judged.senderIsHead,
        termMonths: body.termMonths,
        confirmed: (body.termConfirmation?.reason ?? '').trim() !== '',
        longTermMonths: LONG_TERM_MONTHS,
      })
    ) {
      throw new GroupRequestTermConfirmationRequiredError();
    }
  }

  private async write(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    organizationId: string,
    judged: GroupJudgement,
    planned: readonly PlannedNeedStep<GroupLineInput>[],
    body: GroupBody,
    draftId: string | null,
  ): Promise<AccessRequestRecord> {
    const { assessed } = judged;
    const { policy, unit } = assessed;
    const now = new Date();
    const open = planned.filter((entry) => !entry.confirmedBySending);
    const waiting = open.length > 0 && open.every((entry) => entry.step.state === 'WAITING');
    const state = open.length === 0 ? nextRequestState(policy.branch) : waiting ? 'WAITING_CONTROLLED' : 'PENDING';

    const [first, ...rest] = planned;
    const created = await this.requests.insert(tx, {
      type: 'GROUP_GRANT',
      organizationId,
      branch: policy.branch,
      state: 'PENDING',
      planId: body.planId,
      requesterEmployeeId: actor.employeeId,
      beneficiaryEmployeeIds: judged.lines.map((line) => line.employeeId),
      departmentId: unit.departmentId,
      costCenterId: unit.costCenter?.id ?? null,
      businessReason: body.businessReason,
      termMonths: body.termMonths,
      projectLabel: body.projectLabel ?? null,
      pricing: judged.pricing,
      policy,
      createdByAppUserId: actor.appUserId,
      now,
      needStep: first.step,
      draftId,
    });
    const stepIds = [created.needStepId];
    for (const entry of rest) {
      stepIds.push(await this.requests.addNeedStep(tx, { requestId: created.id, step: entry.step, now }));
    }

    await this.lines.insertMany(
      tx,
      planned.flatMap((entry, index) =>
        entry.lines.map((line) => ({
          requestId: created.id,
          employeeId: line.employeeId,
          state: entry.confirmedBySending ? ('NEED_CONFIRMED' as const) : ('AWAITING_NEED' as const),
          needStepId: stepIds[index],
          expectedEndDate: line.expectedEndDate ?? null,
        })),
      ),
    );

    const confirmed = planned.findIndex((entry) => entry.confirmedBySending);
    if (confirmed >= 0) {
      await this.confirmByHead(tx, actor, {
        organizationId,
        requestId: created.id,
        stepId: stepIds[confirmed],
        state,
        judged,
        body,
        now,
        lines: planned[confirmed].lines,
      });
    }
    for (const event of submissionEvents(actor, {
      organizationId,
      requestId: created.id,
      planId: body.planId,
      termMonths: body.termMonths,
      state,
      judged,
      planned,
      stepIds,
    })) {
      await this.audit.record(tx, event);
    }

    const request = await this.requests.findById(created.id, tx);
    if (!request) throw new Error(`The request ${created.id} was not found after it was written.`);

    return request;
  }

  /** The need step of the people is approved by the head in the moment of sending, one decision for each person (`US-05-17` AC-1, AC-3). */
  private async confirmByHead(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: {
      organizationId: string;
      requestId: string;
      stepId: string;
      state: AccessRequestRecord['state'];
      judged: GroupJudgement;
      body: GroupBody;
      now: Date;
      lines: readonly GroupLineInput[];
    },
  ): Promise<void> {
    await this.requests.recordNeedDecision(tx, {
      organizationId: input.organizationId,
      requestId: input.requestId,
      stepId: input.stepId,
      requestState: input.state,
      departmentId: input.judged.assessed.unit.departmentId,
      record: {
        decision: 'APPROVED',
        decidedByEmployeeId: actor.employeeId,
        deciderRole: 'MANAGER',
        reason: null,
        termConfirmationReason: input.body.termConfirmation?.reason.trim() ?? null,
        decidedAt: input.now,
      },
    });
    await this.decisions.insertMany(
      tx,
      input.lines.map((line) => ({
        requestId: input.requestId,
        employeeId: line.employeeId,
        stage: 'NEED' as const,
        stepId: input.stepId,
        decision: 'APPROVED' as const,
        reason: null,
        decidedByEmployeeId: actor.employeeId,
        deciderRole: 'MANAGER' as const,
        decidedAt: input.now,
      })),
    );
    await this.audit.record(
      tx,
      accessRequestAuditEvent(
        actor,
        input.organizationId,
        'ACCESS_REQUEST.NEED_APPROVED',
        'ACCESS_REQUEST_STEP',
        input.stepId,
        {
          requestId: input.requestId,
          decision: 'APPROVED',
          assigneeEmployeeId: actor.employeeId,
          decidedByEmployeeId: actor.employeeId,
          deciderRole: 'MANAGER',
          departmentId: input.judged.assessed.unit.departmentId,
          requestState: input.state,
          termConfirmed: input.body.termConfirmation !== undefined,
          delegated: true,
          lineCount: input.lines.length,
        },
      ),
    );
  }
}
