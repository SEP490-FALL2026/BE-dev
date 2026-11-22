import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { BudgetDecisionRefusedError, BudgetReasonRequiredError, BudgetYearEndedError } from '../budget/budget.errors';
import { yearHasEnded } from '../budget/budget.policy';
import { budgetAuditEvent, BudgetFactsService } from '../budget/budget-facts.service';
import type { AdjustmentWire, DecideAdjustmentBodyDto } from './budget-adjustment.dto';
import { BudgetAdjustmentDecidedError, BudgetAdjustmentNotFoundError } from './budget-adjustment.errors';
import { BudgetAdjustmentRepo, type AdjustmentRecord } from './budget-adjustment.repo';
import { BudgetAdjustmentApplyService } from './budget-adjustment-apply.service';
import { BudgetAdjustmentLockService } from './budget-adjustment-lock.service';
import { BudgetAdjustmentNotifierService } from './budget-adjustment-notifier.service';
import { BudgetAdjustmentQueryService } from './budget-adjustment-query.service';
import { auditOf } from './budget-adjustment-create.service';

/**
 * The spending approver approves or refuses an adjustment (`QĐ-111ag`): once, never the one who made it, and with every condition looked at again on the figures of the day of
 * the decision, because what was true when Finance asked may not be true now (another adjustment may have taken what was not allocated, a Cost Center may have spent what it
 * would give). An approval changes the budget: a supplement or a transfer adds to the base of the Cost Center that receives (the approved version of origin `ADJUSTMENT` is made
 * for it when it had none, `R-48`), a return or a transfer takes from the one that gives, a reduction of the ceiling lowers the annual ceiling of the cycle. The reserve is never
 * touched. A refusal changes nothing and needs a reason, and is still possible after the year has ended, when an approval no longer is.
 */
@Injectable()
export class BudgetAdjustmentDecisionService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly facts: BudgetFactsService,
    private readonly locks: BudgetAdjustmentLockService,
    private readonly applier: BudgetAdjustmentApplyService,
    private readonly repo: BudgetAdjustmentRepo,
    private readonly notifier: BudgetAdjustmentNotifierService,
    private readonly queries: BudgetAdjustmentQueryService,
    private readonly audit: AuditApi,
  ) {}

  /**
   * Throws BudgetAdjustmentNotFoundError, BudgetDecisionRefusedError (NOT_SPENDING_APPROVER, CONFLICT_OF_INTEREST), BudgetAdjustmentDecidedError, BudgetYearEndedError,
   * BudgetReasonRequiredError, BudgetCycleNotOpenError, BudgetAdjustmentVersionInFlightError and every refusal of `BudgetAdjustmentJudgeService.require`.
   */
  async decide(actor: AuthenticatedPrincipal, id: string, body: DecideAdjustmentBodyDto): Promise<AdjustmentWire> {
    if (body.decision === 'REJECT' && body.reason === undefined) throw new BudgetReasonRequiredError('ADJUSTMENT');
    const found = await this.repo.findById(id);
    if (!found) throw new BudgetAdjustmentNotFoundError();
    const decided = await this.runner.run(async (tx) => {
      // The order of the module: the grant of the spending approver `FOR SHARE`, the cycle `FOR UPDATE`, the adjustment, then the year of each Cost Center.
      if ((await this.facts.usableSpendingApproverEmployeeId(tx, { forShare: true })) !== actor.employeeId) {
        throw new BudgetDecisionRefusedError('NOT_SPENDING_APPROVER');
      }
      const today = await this.facts.today(new Date(), tx);
      const cycle = await this.locks.lock(
        tx,
        found.organizationId,
        found.year,
        [found.fromCostCenterId, found.toCostCenterId],
        today,
      );
      const adjustment = await this.repo.lockById(tx, id);
      if (!adjustment) throw new BudgetAdjustmentNotFoundError();
      if (adjustment.state !== 'PENDING') throw new BudgetAdjustmentDecidedError();
      if (adjustment.createdByEmployeeId === actor.employeeId)
        throw new BudgetDecisionRefusedError('CONFLICT_OF_INTEREST');
      // A year that has ended is not adjusted any more, but what was left pending is refused with a reason, so that the inbox of the approver empties (AD1-07).
      if (body.decision === 'APPROVE' && yearHasEnded(adjustment.year, today)) {
        throw new BudgetYearEndedError(adjustment.year);
      }
      const now = new Date();
      const baseWatch = body.decision === 'APPROVE' ? await this.applier.watchSourceBase(tx, adjustment) : null;
      const createdVersionId =
        body.decision === 'APPROVE' ? await this.applier.apply(tx, actor, cycle, adjustment, today, now) : null;
      const record = await this.writeDecision(tx, actor, id, body, { createdVersionId, now, today });
      await this.applier.settleSourceBase(tx, baseWatch, now);

      return record;
    });

    return (await this.queries.wires([decided]))[0];
  }

  private async writeDecision(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    id: string,
    body: DecideAdjustmentBodyDto,
    context: {
      createdVersionId: string | null;
      now: Date;
      today: Parameters<BudgetAdjustmentNotifierService['decided']>[2];
    },
  ): Promise<AdjustmentRecord> {
    await this.repo.decide(tx, id, {
      state: body.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      decidedByEmployeeId: actor.employeeId,
      decidedAt: context.now,
      decisionReason: body.reason ?? null,
      createdVersionId: context.createdVersionId,
    });
    const record = (await this.repo.findById(id, tx)) as AdjustmentRecord;
    await this.audit.record(
      tx,
      budgetAuditEvent(
        actor,
        record.organizationId,
        `BUDGET_ADJUSTMENT.${record.state}`,
        'BUDGET_ADJUSTMENT',
        id,
        { ...auditOf(record), decisionReason: record.decisionReason },
        { state: 'PENDING' },
      ),
    );
    await this.notifier.decided(tx, record, context.today);

    return record;
  }
}
