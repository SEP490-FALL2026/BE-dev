import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { RequestPartyEligibilityApi } from '../../identity-access/public/request-party-eligibility.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { AccessRequestNoDepartmentError } from '../access-request/access-request.errors';
import type { PreviewBodyDto, PreviewWire } from './request-preview.dto';
import { buildChain, spendSubmissionOf, termNeedsConfirmation } from './request-preview.policy';
import { PricingViewService } from '../request-view/pricing-view.service';
import { RequestFactsService } from '../access-request/request-facts.service';

/**
 * What a person is shown before they send a request (`US-05-01`): the cost with its estimated tax, the chain of people who
 * will decide it with the time each step may take, and whether they already hold it. It is a read: it takes no lock, writes no request, no audit event and no row of any kind, and it reads
 * the facts through the same assessment that sending uses, so the answer is what sending would fix on the same day.
 */
@Injectable()
export class RequestPreviewService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly assessment: RequestFactsService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly catalog: CatalogApi,
    private readonly pricing: PricingViewService,
    private readonly requestParties: RequestPartyEligibilityApi,
  ) {}

  /** Throws AccessRequestNoDepartmentError, AccessRequestPlanNotFoundError, AccessRequestApplicationRetiredError and AccessRequestSpendDateNotAllowedError. */
  async preview(actor: AuthenticatedPrincipal, body: PreviewBodyDto): Promise<PreviewWire> {
    const { assessed, vendorId, blockedBy } = await this.read(actor, body);
    const { unit, target, policy, pricing, routing } = assessed;
    // A plan of the catalog is always one of the first two branches; only a proposal takes the third.
    if (policy.branch === 'NEW_SOFTWARE') throw new Error('A plan of the catalog cannot be a proposal.');
    const chain = buildChain(policy, routing.decision, routing.facts);
    const peopleIds = [...new Set(chain.flatMap((step) => (step.assigneeEmployeeId ? [step.assigneeEmployeeId] : [])))];

    const [department, costCenters, people, priceView, costEstimate] = await Promise.all([
      this.organizationReads.getDepartmentBrief(unit.departmentId),
      unit.costCenter ? this.organizationReads.costCentersByIds([unit.costCenter.id]) : Promise.resolve([]),
      this.organizationReads.getEmployees(peopleIds),
      this.pricing.view(pricing),
      this.pricing.costEstimate(pricing, vendorId),
    ]);
    const costCenter = costCenters[0] ?? null;
    if (!department || (unit.costCenter && !costCenter)) throw new AccessRequestNoDepartmentError();
    const person = (id: string | null) => {
      const found = id === null ? undefined : people.find((candidate) => candidate.id === id);

      return found ? { employeeId: found.id, employeeCode: found.employeeCode, fullName: found.fullName } : null;
    };
    const paid = policy.branch === 'PAID_IN_CATALOG';

    return {
      plan: {
        planId: target.planId,
        planName: target.planName,
        applicationId: target.applicationId,
        applicationName: target.applicationName,
      },
      branch: policy.branch,
      termMonths: body.termMonths,
      department: { id: department.id, code: department.code, name: department.name },
      costCenter: costCenter && { id: costCenter.id, code: costCenter.code, name: costCenter.name },
      requirements: {
        termConfirmationByHead: termNeedsConfirmation(body.termMonths),
      },
      existingAccess: assessed.heldAccess,
      blockedBy,
      canSubmit: assessed.heldAccess === null && blockedBy === null,
      expectedSpendOn: pricing.expectedSpendOn,
      budgetYear: pricing.budgetYear,
      pricing: priceView,
      costEstimate,
      spendSubmission: spendSubmissionOf(policy, pricing.status),
      chain: chain.map(({ assigneeEmployeeId, ...step }) => ({ ...step, assignee: person(assigneeEmployeeId) })),
      possibleExtraSteps: paid ? [{ kind: 'FINANCE_REVIEW', beforeStep: 'SPEND_APPROVAL' }] : [],
      totalExpectedWorkingDays: chain.reduce((sum, step) => sum + step.expectedWorkingDays, 0),
    };
  }

  /** What the preview is made of, read in one transaction that locks nothing: who is refused (before the department is read), the facts of sending and the vendor. */
  private async read(actor: AuthenticatedPrincipal, body: PreviewBodyDto) {
    const settings = await this.assessment.settings();

    return this.runner.run(async (tx) => ({
      // Who can never be a party of a request is judged before the department is read, and says so without refusing (`D-S21`).
      blockedBy: await this.requestParties.blockOf(
        { requesterEmployeeId: actor.employeeId, beneficiaryEmployeeIds: [actor.employeeId] },
        tx,
      ),
      assessed: await this.assessment.assess(tx, {
        employeeId: actor.employeeId,
        planId: body.planId,
        termMonths: body.termMonths,
        expectedSpendOn: body.expectedSpendOn,
        now: new Date(),
        settings,
        lockDepartment: false,
      }),
      vendorId: await this.catalog.getPlanVendorId(body.planId, tx),
    }));
  }
}
