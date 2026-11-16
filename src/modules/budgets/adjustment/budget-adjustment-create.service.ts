import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { BudgetYearEndedError } from '../budget/budget.errors';
import { yearHasEnded } from '../budget/budget.policy';
import { budgetAuditEvent, BudgetFactsService } from '../budget/budget-facts.service';
import type { AdjustmentWire, CreateAdjustmentBodyDto } from './budget-adjustment.dto';
import { BudgetAdjustmentLockService } from './budget-adjustment-lock.service';
import { BudgetAdjustmentJudgeService } from './budget-adjustment-judge.service';
import { BudgetAdjustmentNotifierService } from './budget-adjustment-notifier.service';
import { BudgetAdjustmentQueryService } from './budget-adjustment-query.service';
import { BudgetAdjustmentRepo, type AdjustmentRecord } from './budget-adjustment.repo';
import type { AdjustmentShape } from './budget-adjustment.types';

/** Finance makes an adjustment of the budget of the year: any day, with the reason, checked on the figures of that day; the spending approver is asked to decide it (`QĐ-111ag`). */
@Injectable()
export class BudgetAdjustmentCreateService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly facts: BudgetFactsService,
    private readonly locks: BudgetAdjustmentLockService,
    private readonly judge: BudgetAdjustmentJudgeService,
    private readonly repo: BudgetAdjustmentRepo,
    private readonly notifier: BudgetAdjustmentNotifierService,
    private readonly queries: BudgetAdjustmentQueryService,
    private readonly audit: AuditApi,
  ) {}

  /**
   * Throws BudgetNotFinanceError, BudgetYearEndedError, BudgetCycleNotOpenError, BudgetCostCenterNotFoundError and every refusal of `BudgetAdjustmentJudgeService.require`.
   */
  async create(actor: AuthenticatedPrincipal, body: CreateAdjustmentBodyDto): Promise<AdjustmentWire> {
    this.facts.requireFinance(actor);
    const amountMinor = await this.facts.money(body.amount, await this.facts.reportingCurrency(), 'amount');
    const shape: AdjustmentShape = {
      kind: body.kind,
      amountMinor,
      fromCostCenterId: body.fromCostCenterId ?? null,
      toCostCenterId: body.toCostCenterId ?? null,
      transferReason: body.transferReason ?? null,
    };
    const made = await this.runner.run(async (tx) => {
      const today = await this.facts.today(new Date(), tx);
      if (yearHasEnded(body.year, today)) throw new BudgetYearEndedError(body.year);
      const organizationId = await this.facts.organizationId(tx);
      const cycle = await this.locks.lock(
        tx,
        organizationId,
        body.year,
        [shape.fromCostCenterId, shape.toCostCenterId],
        today,
      );
      for (const id of [shape.fromCostCenterId, shape.toCostCenterId]) {
        if (id !== null) await this.facts.costCenter(id, tx);
      }
      await this.judge.require(tx, cycle, shape, today);
      const record = await this.repo.insert(tx, {
        organizationId,
        year: body.year,
        ...shape,
        currency: cycle.currency,
        reason: body.reason,
        createdByEmployeeId: actor.employeeId,
        createdAt: new Date(),
      });
      await this.audit.record(
        tx,
        budgetAuditEvent(
          actor,
          organizationId,
          'BUDGET_ADJUSTMENT.CREATED',
          'BUDGET_ADJUSTMENT',
          record.id,
          auditOf(record),
        ),
      );
      await this.notifier.requested(tx, record);

      return record;
    });

    return (await this.queries.wires([made]))[0];
  }
}

/** What the audit trail keeps of an adjustment. */
export function auditOf(record: AdjustmentRecord): Record<string, string | number | null> {
  return {
    year: record.year,
    kind: record.kind,
    state: record.state,
    fromCostCenterId: record.fromCostCenterId,
    toCostCenterId: record.toCostCenterId,
    amountMinor: record.amountMinor.toString(),
    currency: record.currency,
    transferReason: record.transferReason,
    createdVersionId: record.createdVersionId,
  };
}
