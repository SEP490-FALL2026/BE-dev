import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import { AccessRequestNotFoundError } from '../access-request/access-request.errors';
import { canViewRequest, viewFactsOf } from '../access-request/access-request.policy';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import {
  AssessmentIncompleteError,
  AssessmentInternalByRegistrationError,
  AssessmentReferenceNotFoundError,
  AssessmentRefusedError,
  AssessmentUncontrollableError,
} from './assessment.errors';
import { SpendEntryService } from '../spend/spend-entry.service';
import { checkAssessor, judgeCompletion } from './assessment.policy';
import { AssessmentRepo, type AssessmentPatch, type AssessmentRecord } from './assessment.repo';
import { AssessmentStepRepo } from '../access-request/assessment-step.repo';
import { AssessmentViewService } from './assessment-view.service';
import type { Quote } from './quote-pricing.policy';
import { QuoteService } from './quote.service';
import { RequestAssessmentService } from '../access-request/request-assessment.service';
import { RequestOutcomeService } from '../outcome/request-outcome.service';
import type { AssessmentPatchDto, AssessmentRejectionBodyDto, AssessmentWire } from './assessment.dto';

/**
 * The assessment of software that is not in the catalog (`US-05-06`, `US-01-12` AC-2): the IT Admin fills the part of
 * `BM-02` the Employee cannot, in saves that can be made one at a time, and completes it once it says all the minimum
 * asks, the control level and a quote in force. Completing it prices the request and sends it on to be submitted for a
 * spend decision. Nothing here puts the software into the catalog or decides the spend (`SoD-5`): a request that lacks
 * anything stays where it is and nothing is written.
 */
@Injectable()
export class AssessmentService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly requests: AccessRequestRepo,
    private readonly assessments: AssessmentRepo,
    private readonly steps: AssessmentStepRepo,
    private readonly organization: OrganizationApi,
    private readonly catalog: CatalogApi,
    private readonly quotes: QuoteService,
    private readonly identity: IdentityAccessApi,
    private readonly views: AssessmentViewService,
    private readonly settings: RequestAssessmentService,
    private readonly entry: SpendEntryService,
    private readonly audit: AuditApi,
    private readonly outcomes: RequestOutcomeService,
  ) {}

  /** Throws AccessRequestNotFoundError: a request that is not a proposal, or one the caller has no part in. */
  async get(actor: AuthenticatedPrincipal, requestId: string): Promise<AssessmentWire> {
    const request = await this.requests.findById(requestId);
    const assessment = request && (await this.assessments.findAssessment(requestId));
    if (!request || !assessment || !(await this.mayRead(actor, request, assessment))) {
      throw new AccessRequestNotFoundError();
    }

    return this.views.of(request, assessment);
  }

  /** Throws AssessmentRefusedError, AssessmentReferenceNotFoundError, the money errors and AccessRequestNotFoundError. */
  async save(actor: AuthenticatedPrincipal, requestId: string, body: AssessmentPatchDto): Promise<AssessmentWire> {
    return this.runner.run(async (tx) => {
      const request = await this.lockProposal(tx, requestId);
      this.requireAssessor(actor, request);
      const current = await this.requireAssessment(requestId, tx);
      const patch = await this.toPatch(body, current);

      await this.assessments.patch(tx, requestId, patch, actor.employeeId);
      const step = await this.steps.find(requestId, tx);
      await this.audit.record(
        tx,
        accessRequestAuditEvent(
          actor,
          request.organizationId,
          'ACCESS_REQUEST.ASSESSMENT_SAVED',
          'ACCESS_REQUEST',
          requestId,
          {
            requestId,
            fields: Object.keys(body).join(','),
            actingForAssignee: step !== null && step.assigneeEmployeeId !== actor.employeeId,
          },
        ),
      );

      return this.views.of(request, await this.requireAssessment(requestId, tx), tx);
    });
  }

  /**
   * Throws AssessmentRefusedError, AssessmentIncompleteError, AssessmentInternalByRegistrationError,
   * AssessmentUncontrollableError, AssessmentQuoteRefusedError and AccessRequestNotFoundError.
   */
  async complete(actor: AuthenticatedPrincipal, requestId: string): Promise<AccessRequestRecord> {
    const { fiscalYearStartMonth } = await this.settings.settings();

    return this.runner.run(async (tx) => {
      const request = await this.lockProposal(tx, requestId);
      this.requireAssessor(actor, request);
      const assessment = await this.requireAssessment(requestId, tx);

      const verdict = judgeCompletion(assessment);
      if (verdict.kind === 'INCOMPLETE') throw new AssessmentIncompleteError(verdict.missing);
      if (verdict.kind === 'INTERNAL_BY_REGISTRATION') throw new AssessmentInternalByRegistrationError();
      if (verdict.kind === 'UNCONTROLLABLE') throw new AssessmentUncontrollableError();
      const quote = assessment.quote as Quote;

      const now = new Date();
      const today = await this.organization.businessToday(now, tx);
      const pricing = this.quotes.price(
        quote,
        {
          termMonths: request.termMonths,
          beneficiaries: request.beneficiaryEmployeeIds.length,
          expectedSpendOn: request.pricing.expectedSpendOn ?? today,
        },
        { today, fiscalYearStartMonth },
      );

      await this.requests.setPriced(tx, requestId, pricing, 'AWAITING_SPEND_SUBMISSION');
      const step = await this.steps.find(requestId, tx);
      if (step) await this.steps.finish(tx, step.id, actor.employeeId, now);
      await this.assessments.complete(tx, requestId, actor.employeeId, now);
      await this.audit.record(
        tx,
        accessRequestAuditEvent(
          actor,
          request.organizationId,
          'ACCESS_REQUEST.ASSESSMENT_COMPLETED',
          'ACCESS_REQUEST',
          requestId,
          {
            requestId,
            classification: assessment.classification,
            controlLevel: assessment.controlLevel,
            dataSensitivity: assessment.dataSensitivity,
            opinionStatus: assessment.opinionStatus,
            equivalentPlanId: assessment.equivalentPlanId,
            amountMinor: pricing.amount?.amountMinor.toString() ?? null,
            amountCurrency: pricing.amount?.currency ?? null,
            periods: pricing.schedule?.length ?? null,
            bindingPeriods: pricing.schedule?.filter((period) => period.binding).length ?? null,
            budgetYear: pricing.budgetYear,
            actingForAssignee: step !== null && step.assigneeEmployeeId !== actor.employeeId,
          },
        ),
      );

      const priced = await this.requests.findById(requestId, tx);
      if (!priced) throw new Error(`The request ${requestId} was not found after its assessment was completed.`);
      // Nobody sends it on when the fallback approver or the spending approver decided its need (`US-06-14` AC-8).
      await this.entry.enter(tx, actor, priced);
      const record = await this.requests.findById(requestId, tx);
      if (!record) throw new Error(`The request ${requestId} was not found after its assessment was completed.`);

      return record;
    });
  }

  /**
   * The IT Admin refuses at the gate of the assessment (`US-05-18`): a tool that cannot be controlled, or software that is not
   * eligible for the catalog. The reason is required, the alternative is optional (it may be a plan of the catalog, a note, or
   * nothing). The request ends there: no spend step, no snapshot, no commitment, and the spending approver is never asked.
   * Throws AssessmentRefusedError, AssessmentReferenceNotFoundError and AccessRequestNotFoundError.
   */
  async reject(
    actor: AuthenticatedPrincipal,
    requestId: string,
    body: AssessmentRejectionBodyDto,
  ): Promise<AccessRequestRecord> {
    return this.runner.run(async (tx) => {
      const request = await this.lockProposal(tx, requestId);
      this.requireAssessor(actor, request);
      if (
        body.alternativePlanId !== undefined &&
        (await this.catalog.getPlanSummaries([body.alternativePlanId])).length === 0
      ) {
        throw new AssessmentReferenceNotFoundError('alternativePlanId');
      }

      const now = new Date();
      await this.assessments.reject(tx, requestId, {
        kind: body.kind,
        reason: body.reason,
        alternativePlanId: body.alternativePlanId ?? null,
        alternativeNote: body.alternativeNote ?? null,
        employeeId: actor.employeeId,
        now,
      });
      await this.requests.setState(tx, requestId, 'IT_REJECTED');
      const step = await this.steps.find(requestId, tx);
      if (step) await this.steps.finish(tx, step.id, actor.employeeId, now, 'REJECTED');
      await this.audit.record(
        tx,
        accessRequestAuditEvent(
          actor,
          request.organizationId,
          'ACCESS_REQUEST.ASSESSMENT_REJECTED',
          'ACCESS_REQUEST',
          requestId,
          {
            requestId,
            kind: body.kind,
            alternativePlanId: body.alternativePlanId ?? null,
            withAlternative: body.alternativePlanId !== undefined || body.alternativeNote !== undefined,
            actingForAssignee: step !== null && step.assigneeEmployeeId !== actor.employeeId,
          },
        ),
      );
      await this.outcomes.ended(tx, request, request.beneficiaryEmployeeIds, now);

      const record = await this.requests.findById(requestId, tx);
      if (!record) throw new Error(`The request ${requestId} was not found after its assessment was refused.`);

      return record;
    });
  }

  /** The people who see the assessment (`BM-02`): the request's own people, the head, an IT Admin, and the spending approver once it is done. */
  private async mayRead(
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    assessment: AssessmentRecord,
  ): Promise<boolean> {
    if (canViewRequest(actor, viewFactsOf(request))) {
      return true;
    }
    const headed = await this.organization.getHeadedDepartment(actor.employeeId);
    if (headed?.departmentId === request.departmentId) return true;
    if (assessment.status !== 'COMPLETED') return false;

    return (await this.identity.getApprovalRoleHolders()).spendingApproverEmployeeId === actor.employeeId;
  }

  private async lockProposal(tx: Parameters<AccessRequestRepo['lockById']>[0], requestId: string) {
    const request = await this.requests.lockById(tx, requestId);
    // A request has an assessment from the proposal on, whatever branch its registration later gave it.
    if (!request || !(await this.assessments.findAssessment(requestId, tx))) throw new AccessRequestNotFoundError();

    return request;
  }

  private requireAssessor(actor: AuthenticatedPrincipal, request: AccessRequestRecord): void {
    const refusal = checkAssessor({
      actorEmployeeId: actor.employeeId,
      requesterEmployeeId: request.requesterEmployeeId,
      beneficiaryEmployeeIds: request.beneficiaryEmployeeIds,
      requestState: request.state,
    });
    if (refusal) throw new AssessmentRefusedError(refusal);
  }

  private async requireAssessment(requestId: string, tx?: Parameters<AccessRequestRepo['lockById']>[0]) {
    const assessment = await this.assessments.findAssessment(requestId, tx);
    if (!assessment) throw new Error(`The proposal ${requestId} has no assessment.`);

    return assessment;
  }

  /** The fields of the body as the repo keeps them, after the vendor, the plan, the person and the quote have been checked. */
  private async toPatch(body: AssessmentPatchDto, current: AssessmentRecord): Promise<AssessmentPatch> {
    const { opinion, quote, vendorId, equivalentPlanId, proposedBusinessOwnerEmployeeId, ...plain } = body;
    const patch: AssessmentPatch = { ...plain };

    if (vendorId !== undefined) {
      const name = vendorId === null ? null : await this.catalog.getVendorName(vendorId);
      if (vendorId !== null && name === null) throw new AssessmentReferenceNotFoundError('vendorId');
      patch.vendorId = vendorId;
      // A vendor of the catalog names the vendor of the proposal unless the IT Admin writes another name.
      if (name !== null && body.vendorName === undefined && current.vendorName === null) patch.vendorName = name;
    }
    if (equivalentPlanId !== undefined) {
      if (equivalentPlanId !== null && (await this.catalog.getPlanSummaries([equivalentPlanId])).length === 0) {
        throw new AssessmentReferenceNotFoundError('equivalentPlanId');
      }
      patch.equivalentPlanId = equivalentPlanId;
    }
    if (proposedBusinessOwnerEmployeeId !== undefined) {
      if (
        proposedBusinessOwnerEmployeeId !== null &&
        (await this.organization.getEmployees([proposedBusinessOwnerEmployeeId])).length === 0
      ) {
        throw new AssessmentReferenceNotFoundError('proposedBusinessOwnerEmployeeId');
      }
      patch.proposedBusinessOwnerEmployeeId = proposedBusinessOwnerEmployeeId;
    }
    if (opinion !== undefined) {
      patch.opinionStatus = opinion?.status ?? null;
      patch.opinionNote = opinion?.note ?? null;
    }
    if (quote !== undefined) patch.quote = quote === null ? null : await this.quotes.read(quote);

    return patch;
  }
}
