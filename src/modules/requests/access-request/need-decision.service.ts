import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { OrganizationService } from '../../organization/organization.service';
import { RenewalApplyService } from '../renewal-request/renewal-apply.service';
import { SpendEntryService } from '../spend/spend-entry.service';
import { accessRequestAuditEvent } from './access-request-audit-event';
import {
  AccessRequestDecisionRefusedError,
  AccessRequestGroupUsesLinesError,
  AccessRequestNotFoundError,
} from './access-request.errors';
import { canViewRequest, viewFactsOf, hasSpendStep } from './access-request.policy';
import { AccessRequestRepo } from './access-request.repo';
import type { AccessRequestRecord } from './access-request.types';
import { AssessmentStepRepo } from './assessment-step.repo';
import { checkNeedDecision, deciderRoleOf, nextRequestState, type DecisionInput } from './need-decision.policy';
import { NeedSpendService } from './need-spend.service';
import { RequestAssessmentService } from './request-assessment.service';

/**
 * Deciding the need step (`US-05-04`, `US-01-12` AC-6): the person the routing table gave the step approves or refuses
 * it. The request is locked while it is decided, so two decisions queue and the second finds the step decided. The step,
 * the request, the electronic approval record and the audit event are written together; a refused decision changes nothing.
 * Nobody decides a request they asked or are given, whatever role they hold (`SoD-4`).
 *
 * A head who approves a request that costs money also chooses the line of the plan of the budget it is for, or says it is
 * outside the plan, and may correct the day the money goes out (`US-05-04` AC-12, AC-16); with no choice nothing is saved. A
 * request that nobody can send on in a batch, because the fallback approver or the spending approver decided its need, is
 * checked at once (`US-06-14` AC-8).
 */
@Injectable()
export class NeedDecisionService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly repo: AccessRequestRepo,
    private readonly steps: AssessmentStepRepo,
    private readonly organization: OrganizationService,
    private readonly audit: AuditService,
    private readonly settings: RequestAssessmentService,
    private readonly spendChoice: NeedSpendService,
    private readonly entry: SpendEntryService,
    private readonly renewals: RenewalApplyService,
  ) {}

  async decide(actor: AuthenticatedPrincipal, requestId: string, input: DecisionInput): Promise<AccessRequestRecord> {
    const { fiscalYearStartMonth } = await this.settings.settings();

    return this.runner.run(async (tx) => {
      const request = await this.repo.lockById(tx, requestId);
      if (!request || !canViewRequest(actor, viewFactsOf(request))) {
        throw new AccessRequestNotFoundError();
      }
      // The people of a request for a group are decided one by one, in the routes of its lines (`US-05-17`).
      if (request.type === 'GROUP_GRANT') throw new AccessRequestGroupUsesLinesError();
      const { needStep } = request;

      const refusal = checkNeedDecision(
        {
          actorEmployeeId: actor.employeeId,
          requesterEmployeeId: request.requesterEmployeeId,
          beneficiaryEmployeeIds: request.beneficiaryEmployeeIds,
          assigneeEmployeeId: needStep.assigneeEmployeeId,
          stepState: needStep.state,
          // A renewal is long when the right would run on over twelve months in all, not when its own term is.
          termMonths: request.renewal?.consecutiveMonths ?? request.termMonths,
        },
        input,
      );
      if (refusal) throw new AccessRequestDecisionRefusedError(refusal);

      const approved = input.decision === 'APPROVE';
      const requestState = approved ? nextRequestState(request.branch) : 'REJECTED';
      const decidedAt = new Date();
      const deciderRole = deciderRoleOf(needStep.routingRow);
      const termConfirmationReason = approved ? (input.termConfirmationReason?.trim() ?? null) : null;

      // The head approving a request that costs money chooses its line first; a refusal here undoes the whole decision.
      const headChoosesLine = approved && hasSpendStep(request.policy) && deciderRole === 'MANAGER';
      if (input.spend !== undefined && !headChoosesLine)
        throw new AccessRequestDecisionRefusedError('SPEND_NOT_APPLICABLE');
      if (headChoosesLine) {
        await this.spendChoice.apply(tx, actor, request, input.spend, { decidedAt, fiscalYearStartMonth });
      }

      await this.repo.recordNeedDecision(tx, {
        organizationId: request.organizationId,
        requestId: request.id,
        stepId: needStep.id,
        requestState,
        departmentId: request.departmentId,
        record: {
          decision: approved ? 'APPROVED' : 'REJECTED',
          decidedByEmployeeId: actor.employeeId,
          deciderRole,
          reason: input.reason?.trim() || null,
          termConfirmationReason: termConfirmationReason || null,
          decidedAt,
        },
      });
      await this.audit.record(
        tx,
        accessRequestAuditEvent(
          actor,
          request.organizationId,
          approved ? 'ACCESS_REQUEST.NEED_APPROVED' : 'ACCESS_REQUEST.NEED_REJECTED',
          'ACCESS_REQUEST_STEP',
          needStep.id,
          {
            requestId: request.id,
            decision: approved ? 'APPROVED' : 'REJECTED',
            assigneeEmployeeId: needStep.assigneeEmployeeId,
            decidedByEmployeeId: actor.employeeId,
            deciderRole,
            departmentId: request.departmentId,
            requestState,
            termConfirmed: Boolean(termConfirmationReason),
          },
        ),
      );

      // A renewal needs nobody to carry it out: approved in full, it is applied here, in the transaction of the decision.
      if (approved && request.type === 'RENEWAL' && requestState === 'AWAITING_EXECUTION') {
        await this.renewals.apply(tx, actor, request, decidedAt);
      }

      if (approved && request.branch === 'NEW_SOFTWARE') {
        // The software is not in the catalog: the IT Admin in charge of the department of the sender assesses it next
        // (`US-05-06` AC-2); with none who still works the step waits and any IT Admin may take it.
        const inCharge = await this.organization.getItAdminInCharge(
          request.requesterEmployeeId,
          await this.organization.businessToday(decidedAt, tx),
        );
        await this.steps.add(tx, {
          requestId: request.id,
          assigneeEmployeeId: inCharge?.itAdminEmployeeId ?? null,
          slaWorkingDays: request.policy.slaWorkingDays,
          now: decidedAt,
        });
        await this.audit.record(
          tx,
          accessRequestAuditEvent(
            actor,
            request.organizationId,
            'ACCESS_REQUEST.ASSESSMENT_REQUESTED',
            'ACCESS_REQUEST',
            request.id,
            { requestId: request.id, itAdminEmployeeId: inCharge?.itAdminEmployeeId ?? null },
          ),
        );
      }

      const decided = await this.repo.findById(request.id, tx);
      if (!decided) throw new Error(`The request ${request.id} was not found after it was decided.`);
      if (approved && decided.state === 'AWAITING_SPEND_SUBMISSION') await this.entry.enter(tx, actor, decided);

      const final = await this.repo.findById(request.id, tx);
      if (!final) throw new Error(`The request ${request.id} was not found after it was decided.`);

      return final;
    });
  }
}
