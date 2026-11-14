import { SpendRoutingService } from '../spend/spend-routing.service';
import { Injectable } from '@nestjs/common';
import type { TermRefusal } from '../../../core/term-limit';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import {
  AccessRequestSuperAdminCannotRequestError,
  AccessRequestTermRefusedError,
} from '../access-request/access-request.errors';
import { hasSpendStep, mayRequest } from '../access-request/access-request.policy';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { RequestSenderService } from '../request-intake/request-sender.service';
import { ProposalDeclarationService, type ShortProposalBasis } from './proposal-declaration.service';
import { RequestFactsService } from '../access-request/request-facts.service';
import type { ProposalBodyDto } from './assessment.dto';
import { RequestLimitsService } from '../request-limits/request-limits.service';

/** Throws AccessRequestTermRefusedError (`QĐ-111i`, `FR-2.8`). */
function assertTermAllowed(assessed: { termRefusal: TermRefusal | null }): void {
  if (assessed.termRefusal !== null) throw new AccessRequestTermRefusedError(assessed.termRefusal);
}

/** What the audit says of a short proposal (`QĐ-111a`): the application it names and the plan it asks for; null for both when the software is new. */
function shortProposalFacts(basis: ShortProposalBasis | null) {
  return {
    existingApplicationId: basis?.existingApplicationId ?? null,
    plannedPlanName: basis?.plannedPlanName ?? null,
  };
}

/**
 * Sending a proposal of software that is not in the catalog (`US-05-06` AC-1, `US-05-02` AC-8): the Employee names it,
 * says what it is for and what company data will go through it, and the request takes the third branch — the need, the
 * assessment of the IT Admin, the spend decision, the grant. The assessment (`BM-02`) is opened empty for the IT Admin,
 * who completes it once the need is approved; the Employee never fills its part. The purpose is the reason of the request.
 * It has no plan, no price and no seat yet, and the need step is given by the same routing table as any other request.
 */
@Injectable()
export class ProposalService {
  constructor(
    private readonly spendRouting: SpendRoutingService,
    private readonly runner: TransactionRunner,
    private readonly repo: AccessRequestRepo,
    private readonly declaration: ProposalDeclarationService,
    private readonly sender: RequestSenderService,
    private readonly assessment: RequestFactsService,
    private readonly audit: AuditApi,
    private readonly limits: RequestLimitsService,
  ) {}

  /** Throws AccessRequestSuperAdminCannotRequestError, AccessRequestNoDepartmentError and FinanceSetupIncompleteError. */
  async submit(actor: AuthenticatedPrincipal, body: ProposalBodyDto): Promise<AccessRequestRecord> {
    if (!mayRequest(actor.roles)) throw new AccessRequestSuperAdminCannotRequestError();
    const settings = await this.assessment.settings();
    const limitSettings = await this.limits.settings();

    return this.runner.run(async (tx) => {
      const employee = await this.sender.lockEligible(tx, actor);
      await this.limits.lock(tx, [actor.employeeId]);

      const now = new Date();
      const assessed = await this.assessment.assessProposal(tx, {
        employeeId: actor.employeeId,
        termMonths: body.termMonths,
        now,
        settings,
        lockDepartment: true,
      });
      assertTermAllowed(assessed);
      // Software the catalog has already is asked for as case A (`QĐ-111b`); a plan it lacks of software it has is a short proposal (`QĐ-111a`).
      const basis = await this.declaration.judge(tx, body);
      // A proposal names no plan: GH-1 has nothing to match, and GH-2 counts it (`BR-MF1-01`).
      await this.limits.requireForOne(tx, { employeeId: actor.employeeId, planId: null, now, settings: limitSettings });
      const { unit, policy, pricing, routing } = assessed;
      const { decision, departmentHeadEmployeeId } = routing;
      const assigned = decision.outcome === 'ASSIGNED';
      const state = assigned ? 'PENDING' : 'WAITING_CONTROLLED';

      const created = await this.repo.insert(tx, {
        organizationId: employee.organizationId,
        branch: policy.branch,
        state,
        planId: null,
        requesterEmployeeId: actor.employeeId,
        beneficiaryEmployeeIds: [actor.employeeId],
        departmentId: unit.departmentId,
        costCenterId: unit.costCenter.id,
        businessReason: body.purpose,
        termMonths: assessed.term.months,
        pricing,
        policy,
        createdByAppUserId: actor.appUserId,
        now,
        needStep: {
          state: decision.outcome === 'NOT_REQUIRED' ? 'NOT_REQUIRED' : assigned ? 'PENDING' : 'WAITING',
          assigneeEmployeeId: assigned ? decision.assigneeEmployeeId : null,
          routingRow: decision.row,
          waitingReason: assigned ? null : decision.reason,
          slaWorkingDays: policy.slaWorkingDays,
        },
      });
      await this.declaration.open(tx, created.id, body, basis);

      await this.audit.record(
        tx,
        accessRequestAuditEvent(
          actor,
          employee.organizationId,
          'ACCESS_REQUEST.SUBMITTED',
          'ACCESS_REQUEST',
          created.id,
          {
            branch: policy.branch,
            state,
            planId: null,
            softwareName: body.softwareName,
            ...shortProposalFacts(basis),
            expectedUsers: body.expectedUsers,
            termMonths: assessed.term.months,
            termCutAt: assessed.term.cutAt,
            requesterEmployeeId: actor.employeeId,
            beneficiaryEmployeeIds: [actor.employeeId],
            departmentId: unit.departmentId,
            costCenterId: unit.costCenter.id,
            policyVersion: policy.version,
            hasSpendStep: hasSpendStep(policy),
            slaWorkingDays: policy.slaWorkingDays,
            pricingStatus: pricing.status,
            budgetYear: pricing.budgetYear,
          },
        ),
      );
      await this.audit.record(
        tx,
        accessRequestAuditEvent(
          actor,
          employee.organizationId,
          'ACCESS_REQUEST.NEED_STEP_ROUTED',
          'ACCESS_REQUEST_STEP',
          created.needStepId,
          {
            requestId: created.id,
            routingRow: decision.row,
            outcome: decision.outcome,
            assigneeEmployeeId: assigned ? decision.assigneeEmployeeId : null,
            role: assigned ? decision.role : null,
            waitingReason: assigned ? null : decision.reason,
            requesterEmployeeId: actor.employeeId,
            departmentId: unit.departmentId,
            departmentHeadEmployeeId,
          },
        ),
      );

      await this.spendRouting.start(tx, actor, created.id, now);
      const record = await this.repo.findById(created.id, tx);
      if (!record) throw new Error(`The request ${created.id} was not found after it was written.`);

      return record;
    });
  }
}
