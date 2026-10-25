import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { OrganizationService } from '../../organization/organization.service';
import { PlanLineService } from '../spend/plan-line.service';
import { accessRequestAuditEvent } from './access-request-audit-event';
import { AccessRequestDecisionRefusedError } from './access-request.errors';
import { AccessRequestRepo } from './access-request.repo';
import type { AccessRequestRecord } from './access-request.types';
import type { SpendInput } from './need-decision.policy';
import { RepricingService } from './repricing.service';

/**
 * What a head gives with the approval of a request that costs money (`US-05-04` AC-12, AC-16): the line of the plan of the budget
 * it is for, or that it is outside the plan, and the day the money is expected to go out when they correct it. One place for the
 * decision of one person and for the decision of the lines of a group, which give the same thing in the same transaction.
 */
@Injectable()
export class NeedSpendService {
  constructor(
    private readonly repo: AccessRequestRepo,
    private readonly organization: OrganizationService,
    private readonly repricing: RepricingService,
    private readonly planLines: PlanLineService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Corrects the day when the head did, then keeps the line they chose; either refusing undoes the decision. Throws
   * AccessRequestDecisionRefusedError (`PLAN_LINE_REQUIRED`) and the errors of choosing the line.
   */
  async apply(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    spend: SpendInput | undefined,
    context: { decidedAt: Date; fiscalYearStartMonth: number },
  ): Promise<void> {
    if (spend === undefined) throw new AccessRequestDecisionRefusedError('PLAN_LINE_REQUIRED');
    const today = await this.organization.businessToday(context.decidedAt, tx);

    let current = request;
    if (spend.expectedSpendOn !== undefined && spend.expectedSpendOn !== request.pricing.expectedSpendOn) {
      const pricing = await this.repricing.reprice(tx, request, spend.expectedSpendOn, {
        today,
        fiscalYearStartMonth: context.fiscalYearStartMonth,
      });
      await this.repo.setPricing(tx, request.id, pricing);
      await this.audit.record(
        tx,
        accessRequestAuditEvent(
          actor,
          request.organizationId,
          'ACCESS_REQUEST.EXPECTED_SPEND_DATE_CHANGED',
          'ACCESS_REQUEST',
          request.id,
          {
            requestId: request.id,
            before: request.pricing.expectedSpendOn,
            after: pricing.expectedSpendOn,
            beforeBudgetYear: request.pricing.budgetYear,
            afterBudgetYear: pricing.budgetYear,
          },
        ),
      );
      current = { ...request, pricing };
    }
    await this.planLines.choose(
      tx,
      actor,
      current,
      spend.planLine
        ? { kind: 'LINE', position: spend.planLine.position, stillNeeded: spend.planLine.stillNeeded }
        : { kind: 'OFF_PLAN' },
      today,
    );
  }
}
