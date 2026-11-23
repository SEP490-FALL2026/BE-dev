import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord, PricingRecord } from '../access-request/access-request.types';
import type { AssessmentRecord, Quote } from '../access-request/assessment-record.types';
import type { ChecklistBody } from '../../policies/public/policy-checklist.types';
import { SpendRoutingService } from '../spend/spend-routing.service';
import {
  AssessmentFreePlanError,
  AssessmentIncompleteError,
  AssessmentInternalByRegistrationError,
  AssessmentUncontrollableError,
} from './assessment.errors';
import { assessmentScopeOf, judgeCompletion, type AssessmentScope } from './assessment.policy';
import { AssessmentRepo } from './assessment.repo';
import { AssessmentGate } from './assessment-gate.service';
import { AssessmentPricingService } from './assessment-pricing.service';
import { AssessmentTermFitService, type FittedTerm } from './assessment-term-fit.service';

/**
 * Completing the assessment of a proposal (`US-05-06`, `US-01-12` AC-2): once it says all the minimum asks, the control level and a
 * quote in force, the request is priced and sent on to be submitted for a spend decision. A request that lacks anything stays where
 * it is and nothing is written. Nothing here puts the software into the catalog or decides the spend (`SoD-5`).
 */
@Injectable()
export class AssessmentCompletionService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly gate: AssessmentGate,
    private readonly requests: AccessRequestRepo,
    private readonly assessments: AssessmentRepo,
    private readonly audit: AuditApi,
    private readonly entry: SpendRoutingService,
    private readonly pricing: AssessmentPricingService,
    private readonly termFit: AssessmentTermFitService,
  ) {}

  /**
   * Throws AssessmentRefusedError, AssessmentIncompleteError, AssessmentInternalByRegistrationError, AssessmentFreePlanError (a short proposal
   * for a plan of internal software), AssessmentUncontrollableError, AssessmentTermNotFitError, AssessmentQuoteRefusedError and AccessRequestNotFoundError,
   * and what the checklist of the step refuses (`QĐ-111ap`): a version left behind, answers missing, an answer No, which locks the completion.
   */
  async complete(
    actor: AuthenticatedPrincipal,
    requestId: string,
    input: { checklist: ChecklistBody },
  ): Promise<AccessRequestRecord> {
    return this.runner.run(async (tx) => {
      const request = await this.gate.lockProposal(tx, requestId);
      this.gate.requireAssessor(actor, request);
      const { assessment, proposal } = await this.gate.requireProposalFacts(tx, requestId);
      const scope = assessmentScopeOf(proposal);
      const quote = this.completableQuote(assessment, scope, await this.gate.namesInternalApplication(tx, proposal));
      const { verdict } = await this.gate.judgeChecklist(tx, request, {
        decision: 'COMPLETE',
        checklist: input.checklist,
      });
      // A plan alone is never classified by the IT Admin (the application is in the catalog) and is always paid or licensed: a completed assessment says so.
      const concluded: AssessmentRecord =
        scope === 'PLAN_ONLY' ? { ...assessment, classification: 'PAID_LICENSED' } : assessment;

      const now = new Date();
      const fitted = await this.fitTerm(tx, request, concluded, now);
      const pricing = await this.pricing.priceCompleted(tx, fitted.request, quote, { now });
      await this.requests.setPriced(tx, requestId, pricing, 'AWAITING_SPEND_SUBMISSION');
      const standsIn = await this.gate.finishStep(tx, requestId, actor, { now });
      await this.assessments.complete(tx, requestId, actor.employeeId, now, concluded.classification);
      await this.gate.keepChecklist(tx, actor, request, { verdict, decision: 'COMPLETE', decidedAt: now });
      await this.audit.record(
        tx,
        accessRequestAuditEvent(
          actor,
          request.organizationId,
          'ACCESS_REQUEST.ASSESSMENT_COMPLETED',
          'ACCESS_REQUEST',
          requestId,
          completedAuditDetail(requestId, concluded, pricing, standsIn, fitted),
        ),
      );

      return this.enterSpend(tx, actor, requestId);
    });
  }

  /**
   * The time of use of the proposal judged again by the kind of grant the IT Admin concluded (`QĐ-111i`, `AssessmentTermFitService`).
   * Returns the request as it is priced from now on. Throws AssessmentTermNotFitError.
   */
  private async fitTerm(
    tx: DbTx,
    request: AccessRequestRecord,
    concluded: AssessmentRecord,
    now: Date,
  ): Promise<FittedTerm> {
    const kind = concluded.provisioningType;
    if (kind === null) throw new Error(`The assessment of ${request.id} was completed with no kind of provisioning.`);

    return this.termFit.fit(tx, request, kind, now);
  }

  /** The quote that prices the request, when the assessment may be completed here; the errors say what stops it. */
  private completableQuote(assessment: AssessmentRecord, scope: AssessmentScope, internalApplication: boolean): Quote {
    const verdict = judgeCompletion(assessment, scope, internalApplication);
    if (verdict.kind === 'FREE_PLAN') throw new AssessmentFreePlanError();
    if (verdict.kind === 'INCOMPLETE') throw new AssessmentIncompleteError(verdict.missing);
    if (verdict.kind === 'INTERNAL_BY_REGISTRATION') throw new AssessmentInternalByRegistrationError();
    if (verdict.kind === 'UNCONTROLLABLE') throw new AssessmentUncontrollableError();

    return assessment.quote as Quote;
  }

  /** Nobody sends it on when the fallback approver or the spending approver decided its need (`US-06-14` AC-8). */
  private async enterSpend(tx: DbTx, actor: AuthenticatedPrincipal, requestId: string): Promise<AccessRequestRecord> {
    await this.entry.enterAfterAssessment(tx, actor, requestId, new Date());
    const record = await this.requests.findById(requestId, tx);
    if (!record) throw new Error(`The request ${requestId} was not found after its assessment was completed.`);

    return record;
  }
}

/** What the audit entry of a completion says: what the assessment concluded, and the amount it priced the request at. */
function completedAuditDetail(
  requestId: string,
  assessment: AssessmentRecord,
  pricing: PricingRecord,
  actingForAssignee: boolean,
  fitted: FittedTerm,
) {
  return {
    requestId,
    classification: assessment.classification,
    controlLevel: assessment.controlLevel,
    dataSensitivity: assessment.dataSensitivity,
    opinionStatus: assessment.opinionStatus,
    equivalentPlanId: assessment.equivalentPlanId,
    amountMinor: pricing.amount?.amountMinor.toString() ?? null,
    amountCurrency: pricing.amount?.currency ?? null,
    months: pricing.amountMonths,
    budgetYear: pricing.budgetYear,
    // The time of use the request keeps, and the months a plan bought once cleared from it (`QĐ-111i`).
    termMonths: fitted.request.termMonths,
    termMonthsCleared: fitted.termMonthsCleared,
    actingForAssignee,
  };
}
