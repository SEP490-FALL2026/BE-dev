import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import { AccessRequestNotFoundError } from '../access-request/access-request.errors';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { RequestFactsService } from '../access-request/request-facts.service';
import type { InternalRegistrationBodyDto } from './assessment.dto';
import { AssessmentIncompleteError, InternalRegistrationRefusedError } from './assessment.errors';
import { internalRegistrationBasis, registeredShapeOf } from './assessment.policy';
import { AssessmentRepo } from './assessment.repo';
import { AssessmentGate } from './assessment-gate.service';
import { AssessmentPricingService } from './assessment-pricing.service';

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
    private readonly gate: AssessmentGate,
    private readonly catalog: CatalogApi,
    private readonly pricing: AssessmentPricingService,
    private readonly settings: RequestFactsService,
    private readonly audit: AuditApi,
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
      this.gate.requireAssessor(actor, request);
      const { assessment, proposal } = await this.gate.requireProposalFacts(tx, requestId);
      const basis = internalRegistrationBasis(assessment, body.dataSensitivity);
      if (basis.kind === 'NOT_INTERNAL') throw new InternalRegistrationRefusedError('NOT_INTERNAL');
      if (basis.kind === 'DATA_SENSITIVITY_MISSING') throw new AssessmentIncompleteError(['dataSensitivity']);

      const now = new Date();
      const { quote, pricing } = await this.pricing.registrationPricing(tx, request, body.spend?.quote, {
        now,
        fiscalYearStartMonth,
      });
      const registered = await this.catalog.registerInternalSoftware(tx, actor, {
        name: body.softwareName ?? proposal.softwareName,
        businessOwnerEmployeeId: body.businessOwnerEmployeeId,
        dataSensitivity: basis.dataSensitivity,
      });
      if (registered.status === 'REFUSED') throw new InternalRegistrationRefusedError(registered.reason);

      const withSpend = quote !== null;
      await this.requests.setRegistered(tx, requestId, {
        planId: registered.planId,
        ...registeredShapeOf(withSpend, request.policy),
        pricing,
      });
      await this.assessments.patch(
        tx,
        requestId,
        {
          dataSensitivity: basis.dataSensitivity,
          proposedBusinessOwnerEmployeeId: body.businessOwnerEmployeeId,
          ...(quote ? { quote } : {}),
        },
        actor.employeeId,
      );
      const standsIn = await this.gate.finishStep(tx, requestId, actor, { now });
      await this.assessments.complete(tx, requestId, actor.employeeId, now);
      await this.auditRegistered(tx, actor, request, { registered, body, withSpend, standsIn });

      const record = await this.requests.findById(requestId, tx);
      if (!record) throw new Error(`The request ${requestId} was not found after its software was registered.`);

      return record;
    });
  }

  private async auditRegistered(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    done: {
      registered: { applicationId: string; planId: string };
      body: InternalRegistrationBodyDto;
      withSpend: boolean;
      standsIn: boolean;
    },
  ): Promise<void> {
    await this.audit.record(
      tx,
      accessRequestAuditEvent(
        actor,
        request.organizationId,
        'ACCESS_REQUEST.INTERNAL_SOFTWARE_REGISTERED',
        'ACCESS_REQUEST',
        request.id,
        {
          requestId: request.id,
          applicationId: done.registered.applicationId,
          planId: done.registered.planId,
          businessOwnerEmployeeId: done.body.businessOwnerEmployeeId,
          withSpend: done.withSpend,
          actingForAssignee: done.standsIn,
        },
      ),
    );
  }
}
