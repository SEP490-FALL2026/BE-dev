import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { CatalogService } from '../../catalog/catalog.service';
import { OrganizationService } from '../../organization/organization.service';
import { accessRequestAuditEvent } from './access-request-audit-event';
import { AccessRequestNotFoundError } from './access-request.errors';
import { CURRENT_POLICY_VERSION } from './access-request.policy';
import { AccessRequestRepo } from './access-request.repo';
import type { AccessRequestRecord, PricingRecord } from './access-request.types';
import {
  AssessmentIncompleteError,
  AssessmentRefusedError,
  InternalRegistrationRefusedError,
} from './assessment.errors';
import { checkAssessor } from './assessment.policy';
import { AssessmentRepo } from './assessment.repo';
import { AssessmentStepRepo } from './assessment-step.repo';
import { QuoteService } from './quote.service';
import { RequestAssessmentService } from './request-assessment.service';
import type { InternalRegistrationBodyDto } from './assessment.dto';

const NOT_APPLICABLE: PricingRecord = {
  status: 'NOT_APPLICABLE',
  missingReason: null,
  expectedSpendOn: null,
  budgetYear: null,
  amount: null,
  unitPrice: null,
  billingCycle: null,
  schedule: null,
};

/**
 * Registering internal software for a proposal (`US-05-20` AC-3→AC-5, AC-8→AC-10): when the IT Admin has classified what
 * was proposed as software the company built itself, they register it in the catalog with a Business Owner who still works,
 * and the request goes the way that has no spend: the IT Admin grants it by hand (`US-05-20` AC-1). Nothing financial is
 * made for it — no vendor, contract, subscription, invoice, commitment or seat bought. When the grant itself needs a payment
 * the registration needs no spending approver, but the request keeps its spend step with the amount the quote gives
 * (`AC-10`). A Business Owner who is missing or has left refuses the registration and the request stays with the IT Admin
 * (`AC-4`, `AC-9`): it is never rejected for that.
 */
@Injectable()
export class InternalRegistrationService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly requests: AccessRequestRepo,
    private readonly assessments: AssessmentRepo,
    private readonly steps: AssessmentStepRepo,
    private readonly catalog: CatalogService,
    private readonly organization: OrganizationService,
    private readonly quotes: QuoteService,
    private readonly settings: RequestAssessmentService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Throws AccessRequestNotFoundError, AssessmentRefusedError, InternalRegistrationRefusedError, AssessmentIncompleteError
   * and the errors of the quote.
   */
  async register(
    actor: AuthenticatedPrincipal,
    requestId: string,
    body: InternalRegistrationBodyDto,
  ): Promise<AccessRequestRecord> {
    const { fiscalYearStartMonth } = await this.settings.settings();

    return this.runner.run(async (tx) => {
      const request = await this.requests.lockById(tx, requestId);
      if (!request) throw new AccessRequestNotFoundError();
      const refusal = checkAssessor({
        actorEmployeeId: actor.employeeId,
        requesterEmployeeId: request.requesterEmployeeId,
        beneficiaryEmployeeIds: request.beneficiaryEmployeeIds,
        requestState: request.state,
      });
      if (refusal) throw new AssessmentRefusedError(refusal);

      const assessment = await this.assessments.findAssessment(requestId, tx);
      const proposal = await this.assessments.findProposal(requestId, tx);
      if (!assessment || !proposal) throw new AccessRequestNotFoundError();
      // Only software the company built itself goes this way; whatever else it is stays in the third branch (`AC-8`).
      if (assessment.classification !== 'INTERNAL') throw new InternalRegistrationRefusedError('NOT_INTERNAL');
      const dataSensitivity = body.dataSensitivity ?? assessment.dataSensitivity;
      if (dataSensitivity === null) throw new AssessmentIncompleteError(['dataSensitivity']);

      const now = new Date();
      const today = await this.organization.businessToday(now, tx);
      const quote = body.spend ? await this.quotes.read(body.spend.quote) : null;
      const pricing = quote
        ? this.quotes.price(
            quote,
            {
              termMonths: request.termMonths,
              beneficiaries: request.beneficiaryEmployeeIds.length,
              expectedSpendOn: request.pricing.expectedSpendOn ?? today,
            },
            { today, fiscalYearStartMonth },
          )
        : NOT_APPLICABLE;

      const registered = await this.catalog.registerInternalSoftware(tx, actor, {
        name: body.softwareName ?? proposal.softwareName,
        businessOwnerEmployeeId: body.businessOwnerEmployeeId,
        dataSensitivity,
      });
      if (registered.status === 'REFUSED') throw new InternalRegistrationRefusedError(registered.reason);

      const withSpend = quote !== null;
      await this.requests.setRegistered(tx, requestId, {
        planId: registered.planId,
        branch: withSpend ? 'NEW_SOFTWARE' : 'INTERNAL_FREE',
        // The way that has no spend drops the spend step from the chain; with a payment the chain stays as it was sent.
        policy: withSpend
          ? request.policy
          : {
              version: CURRENT_POLICY_VERSION,
              branch: 'INTERNAL_FREE',
              chain: ['NEED', 'IT_ASSESSMENT', 'IT_EXECUTION'],
              slaWorkingDays: request.policy.slaWorkingDays,
            },
        pricing,
        state: withSpend ? 'AWAITING_SPEND_SUBMISSION' : 'AWAITING_EXECUTION',
      });
      await this.assessments.patch(
        tx,
        requestId,
        {
          dataSensitivity,
          proposedBusinessOwnerEmployeeId: body.businessOwnerEmployeeId,
          ...(quote ? { quote } : {}),
        },
        actor.employeeId,
      );
      const step = await this.steps.find(requestId, tx);
      if (step) await this.steps.finish(tx, step.id, actor.employeeId, now);
      await this.assessments.complete(tx, requestId, actor.employeeId, now);
      await this.audit.record(
        tx,
        accessRequestAuditEvent(
          actor,
          request.organizationId,
          'ACCESS_REQUEST.INTERNAL_SOFTWARE_REGISTERED',
          'ACCESS_REQUEST',
          requestId,
          {
            requestId,
            applicationId: registered.applicationId,
            planId: registered.planId,
            businessOwnerEmployeeId: body.businessOwnerEmployeeId,
            withSpend,
            actingForAssignee: step !== null && step.assigneeEmployeeId !== actor.employeeId,
          },
        ),
      );

      const record = await this.requests.findById(requestId, tx);
      if (!record) throw new Error(`The request ${requestId} was not found after its software was registered.`);

      return record;
    });
  }
}
