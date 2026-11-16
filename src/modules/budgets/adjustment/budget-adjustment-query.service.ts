import { Injectable } from '@nestjs/common';
import { pageOf, type Page } from '../../../core/application/pagination';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { BudgetFactsService } from '../budget/budget-facts.service';
import type { AdjustmentWire } from './budget-adjustment.dto';
import { BudgetAdjustmentRepo, type AdjustmentRecord } from './budget-adjustment.repo';
import type { AdjustmentState } from './budget-adjustment.types';

/**
 * Reads the adjustments for Finance and the spending approver, who read all of them, and for a manager, who reads the ones that give to or take from the Cost Center of
 * their own department (`D8`): a manager with no Cost Center reads nothing, and an adjustment of the ceiling, which names none, is not theirs. Every figure is written as the
 * adjustment was made; nothing is worked out here.
 */
@Injectable()
export class BudgetAdjustmentQueryService {
  constructor(
    private readonly repo: BudgetAdjustmentRepo,
    private readonly facts: BudgetFactsService,
  ) {}

  async list(
    actor: AuthenticatedPrincipal,
    query: { year?: number; costCenterId?: string; state?: AdjustmentState; page: number; pageSize: number },
  ): Promise<Page<AdjustmentWire>> {
    let costCenterIds = await this.scopeOf(actor, query.year);
    if (query.costCenterId !== undefined) {
      costCenterIds = costCenterIds === null || costCenterIds.includes(query.costCenterId) ? [query.costCenterId] : [];
    }
    if (costCenterIds !== null && costCenterIds.length === 0) return pageOf([], 0, query.page, query.pageSize);
    const { items, total } = await this.repo.page({
      organizationId: await this.facts.organizationId(),
      year: query.year,
      state: query.state,
      costCenterIds: costCenterIds ?? undefined,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return pageOf(await this.wires(items), total, query.page, query.pageSize);
  }

  /** The adjustments as the routes answer them: the Cost Centers and the people named, the amounts in the currency they were made in. */
  async wires(records: readonly AdjustmentRecord[]): Promise<AdjustmentWire[]> {
    const [costCenters, people] = await Promise.all([
      this.facts.costCenters(records.flatMap((one) => [one.fromCostCenterId, one.toCostCenterId]).filter(isId)),
      this.facts.people(records.flatMap((one) => [one.createdByEmployeeId, one.decidedByEmployeeId])),
    ]);
    const money = new Map<string, Awaited<ReturnType<BudgetFactsService['formatter']>>>();
    const wires: AdjustmentWire[] = [];
    for (const one of records) {
      if (!money.has(one.currency)) money.set(one.currency, await this.facts.formatter(one.currency));
      const format = money.get(one.currency) as Awaited<ReturnType<BudgetFactsService['formatter']>>;
      wires.push({
        id: one.id,
        year: one.year,
        kind: one.kind,
        from: one.fromCostCenterId === null ? null : (costCenters.get(one.fromCostCenterId) ?? null),
        to: one.toCostCenterId === null ? null : (costCenters.get(one.toCostCenterId) ?? null),
        amount: format(one.amountMinor),
        reason: one.reason,
        transferReason: one.transferReason,
        state: one.state,
        createdBy: people.get(one.createdByEmployeeId) ?? null,
        createdAt: one.createdAt.toISOString(),
        decidedBy: one.decidedByEmployeeId ? (people.get(one.decidedByEmployeeId) ?? null) : null,
        decidedAt: one.decidedAt?.toISOString() ?? null,
        decisionReason: one.decisionReason,
        createdVersionId: one.createdVersionId,
      });
    }

    return wires;
  }

  /** Null: reads every adjustment (Finance, the spending approver). Else the Cost Centers of the departments the manager heads. */
  private async scopeOf(actor: AuthenticatedPrincipal, year: number | undefined): Promise<string[] | null> {
    if (actor.roles.includes('FINANCE') || actor.roles.includes('SPENDING_APPROVER')) return null;
    const units = await this.facts.headedUnitsFor(actor.employeeId, await this.facts.today(new Date()), year);

    return units.flatMap((unit) => (unit.costCenter ? [unit.costCenter.id] : []));
  }
}

const isId = (value: string | null): value is string => value !== null;
