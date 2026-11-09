import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord, PricingRecord } from '../access-request/access-request.types';
import type { AssessmentRecord, Quote } from '../access-request/assessment-record.types';
import { SpendEntryService } from '../spend/spend-entry.service';
import {
  AssessmentIncompleteError,
  AssessmentInternalByRegistrationError,
  AssessmentUncontrollableError,
} from './assessment.errors';
import { judgeCompletion } from './assessment.policy';
import { AssessmentRepo } from './assessment.repo';
import { AssessmentGate } from './assessment-gate.service';
import { AssessmentPricingService } from './assessment-pricing.service';

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
    private readonly entry: SpendEntryService,
    private readonly pricing: AssessmentPricingService,
  ) {}

  /**
   * Throws AssessmentRefusedError, AssessmentIncompleteError, AssessmentInternalByRegistrationError,
   * AssessmentUncontrollableError, AssessmentQuoteRefusedError and AccessRequestNotFoundError.
   */
  async complete(actor: AuthenticatedPrincipal, requestId: string): Promise<AccessRequestRecord> {
    return this.runner.run(async (tx) => {
      const request = await this.gate.lockProposal(tx, requestId);
      this.gate.requireAssessor(actor, request);
      const assessment = await this.gate.requireAssessment(requestId, tx);
      const quote = this.completableQuote(assessment);

      const now = new Date();
      const pricing = await this.pricing.priceCompleted(tx, request, quote, { now });
      await this.requests.setPriced(tx, requestId, pricing, 'AWAITING_SPEND_SUBMISSION');
      const standsIn = await this.gate.finishStep(tx, requestId, actor, { now });
      await this.assessments.complete(tx, requestId, actor.employeeId, now);
      await this.audit.record(
        tx,
        accessRequestAuditEvent(
          actor,
          request.organizationId,
          'ACCESS_REQUEST.ASSESSMENT_COMPLETED',
          'ACCESS_REQUEST',
          requestId,
          completedAuditDetail(requestId, assessment, pricing, standsIn),
        ),
      );

      return this.enterSpend(tx, actor, requestId);
    });
  }

  /** The quote that prices the request, when the assessment may be completed here; the errors say what stops it. */
  private completableQuote(assessment: AssessmentRecord): Quote {
    const verdict = judgeCompletion(assessment);
    if (verdict.kind === 'INCOMPLETE') throw new AssessmentIncompleteError(verdict.missing);
    if (verdict.kind === 'INTERNAL_BY_REGISTRATION') throw new AssessmentInternalByRegistrationError();
    if (verdict.kind === 'UNCONTROLLABLE') throw new AssessmentUncontrollableError();

    return assessment.quote as Quote;
  }

  /** Nobody sends it on when the fallback approver or the spending approver decided its need (`US-06-14` AC-8). */
  private async enterSpend(tx: DbTx, actor: AuthenticatedPrincipal, requestId: string): Promise<AccessRequestRecord> {
    const priced = await this.requests.findById(requestId, tx);
    if (!priced) throw new Error(`The request ${requestId} was not found after its assessment was completed.`);
    await this.entry.enter(tx, actor, priced);
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
    actingForAssignee,
  };
}
