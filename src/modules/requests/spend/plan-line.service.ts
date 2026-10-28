import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { BudgetsService } from '../../budgets/budgets.service';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event';
import { AccessRequestPlanLineRefusedError } from '../access-request/access-request.errors';
import { chargedCostCenterId, hasSpendStep } from '../access-request/access-request.policy';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { judgePlanLineChoice, type PlanLineChoice } from './spend-submission.policy';

/**
 * Attaches a request that costs money to a line of the plan of the budget of its Cost Center and of the year the money goes
 * out in, or says it is outside the plan (`US-05-04` AC-12, AC-13). The head chooses, never the system. A line whose window has
 * gone by is kept only when the head confirms it is still needed; with no line there is nothing to keep. Being outside the
 * plan is information for Finance and the approver and never an exception (`QĐ-82m` `INF-05a`). It runs in the transaction of
 * the caller, with the request locked.
 */
@Injectable()
export class PlanLineService {
  constructor(
    private readonly requests: AccessRequestRepo,
    private readonly budgets: BudgetsService,
    private readonly audit: AuditService,
  ) {}

  /** Throws AccessRequestPlanLineRefusedError. */
  async choose(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    choice: PlanLineChoice,
    today: BusinessDate,
  ): Promise<void> {
    const year = request.pricing.budgetYear;
    if (year === null || !hasSpendStep(request.policy)) throw new AccessRequestPlanLineRefusedError('NO_SPEND');

    const line =
      choice.kind === 'LINE'
        ? await this.budgets.currentLine(chargedCostCenterId(request), year, choice.position, tx)
        : null;
    const verdict = judgePlanLineChoice(choice, { line, today });
    if (!verdict.ok) throw new AccessRequestPlanLineRefusedError(verdict.reason);

    await this.requests.setSpendPlan(
      tx,
      request.id,
      choice.kind === 'LINE' && line
        ? {
            line: { versionId: line.versionId, position: choice.position, confirmed: verdict.confirmed },
            offPlan: false,
          }
        : { line: null, offPlan: true },
    );
    await this.audit.record(
      tx,
      accessRequestAuditEvent(
        actor,
        request.organizationId,
        'ACCESS_REQUEST.PLAN_LINE_CHOSEN',
        'ACCESS_REQUEST',
        request.id,
        {
          requestId: request.id,
          choice: choice.kind,
          budgetYear: year,
          position: choice.kind === 'LINE' ? choice.position : null,
          stillNeeded: choice.kind === 'LINE' ? choice.stillNeeded : false,
          previousPosition: request.planLine?.position ?? null,
          previousOffPlan: request.offPlan,
        },
      ),
    );
  }
}
