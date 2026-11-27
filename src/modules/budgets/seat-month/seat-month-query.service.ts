import { Injectable } from '@nestjs/common';
import { pageOf, type Page } from '../../../core/application/pagination';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { BudgetFactsService } from '../budget/budget-facts.service';
import type { SeatMonthChargeWire, SeatMonthPoolLineWire } from './seat-month.dto';
import { SharedPoolLineFactsService } from '../shared-pool-line/shared-pool-line-facts.service';
import { SeatMonthRepo, type SeatMonthChargeRecord } from './seat-month.repo';

export interface SeatMonthChargesFilter {
  year: number;
  month: number;
  costCenterId?: string;
  subscriptionId?: string;
  page: number;
  pageSize: number;
}

/** What `GET /seat-month-charges` answers: the rows of the month and the line of the pool of each subscription. */
export interface SeatMonthChargesView extends Page<SeatMonthChargeWire> {
  poolLines: SeatMonthPoolLineWire[];
}

const MAX_POOL_LINES = 100;

/**
 * The seat-months of a month for Finance and, for the Cost Center of their own department, a manager (`SM-1`, `D8`: a filter outside the scope gives
 * an empty list, not an error), with the line "not allocated, shared pool" of each subscription: its invoices of the month less the seat-months
 * (`QĐ-104c`), read when asked and never stored. The line is the company's, so a manager does not get it.
 */
@Injectable()
export class SeatMonthQueryService {
  constructor(
    private readonly repo: SeatMonthRepo,
    private readonly facts: BudgetFactsService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly poolFacts: SharedPoolLineFactsService,
  ) {}

  async list(
    actor: AuthenticatedPrincipal,
    filter: SeatMonthChargesFilter,
    isFinance: boolean,
  ): Promise<SeatMonthChargesView> {
    const month = `${filter.year}-${String(filter.month).padStart(2, '0')}-01`;
    const scope = isFinance ? undefined : await this.ownCostCenters(actor, filter);
    const costCenterIds = this.narrowed(scope, filter.costCenterId);
    const empty = costCenterIds !== undefined && costCenterIds.length === 0;
    const { rows, total } = empty
      ? { rows: [], total: 0 }
      : await this.repo.page({
          month,
          costCenterIds,
          subscriptionId: filter.subscriptionId,
          skip: (filter.page - 1) * filter.pageSize,
          take: filter.pageSize,
        });
    const poolLines = isFinance ? await this.poolLines(month, filter.subscriptionId) : [];

    return { ...pageOf(await this.wires(rows), total, filter.page, filter.pageSize), poolLines };
  }

  /** The Cost Centers the manager answers for in the year. */
  private async ownCostCenters(actor: AuthenticatedPrincipal, filter: SeatMonthChargesFilter): Promise<string[]> {
    const units = await this.facts.headedUnitsFor(actor.employeeId, await this.facts.today(new Date()), filter.year);

    return units.flatMap((unit) => (unit.costCenter ? [unit.costCenter.id] : []));
  }

  /** No scope: the Cost Center asked for, if any; a scope: the ones of the scope, narrowed to the one asked for when it is among them. */
  private narrowed(scope: readonly string[] | undefined, asked: string | undefined): string[] | undefined {
    if (scope === undefined) return asked === undefined ? undefined : [asked];

    return asked === undefined ? [...scope] : scope.filter((id) => id === asked);
  }

  private async poolLines(month: string, subscriptionId: string | undefined): Promise<SeatMonthPoolLineWire[]> {
    const money = await this.facts.formatter(await this.facts.reportingCurrency());
    const lines = await this.poolFacts.linesOfMonth(month, subscriptionId, MAX_POOL_LINES);

    return lines.map((line) => ({
      subscriptionId: line.subscriptionId,
      invoiced: money(line.invoicedMinor),
      allocated: money(line.allocatedMinor),
      paid: line.paidMinor === null ? null : money(line.paidMinor),
      idleCost: line.idleCostMinor === null ? null : money(line.idleCostMinor),
      idleCostByLabel: {
        missedAdjustment: money(line.idleCostByLabel.missedAdjustmentMinor),
        reducible: money(line.idleCostByLabel.reducibleMinor),
        lockedUntil: Object.fromEntries(
          Object.entries(line.idleCostByLabel.lockedUntil).map(([date, minor]) => [date, money(minor)]),
        ),
      },
      invoiceVariance: money(line.invoiceVarianceMinor),
      invoiceVarianceInReview: money(line.invoiceVarianceInReviewMinor),
      deviceLotPurchases: money(line.deviceLotPurchasesMinor),
      replacementKeys: money(line.replacementKeysMinor),
      unallocated: money(line.unallocatedMinor),
      withoutCostCenter: money(line.withoutCostCenterMinor),
      flags: {
        NO_PRICE: line.flags.includes('NO_PRICE'),
        NO_QUANTITY: line.flags.includes('NO_QUANTITY'),
      },
    }));
  }

  private async wires(rows: readonly SeatMonthChargeRecord[]): Promise<SeatMonthChargeWire[]> {
    const [people, costCenters, departments, money] = await Promise.all([
      this.facts.people(rows.map((row) => row.employeeId)),
      this.facts.costCenters(rows.flatMap((row) => (row.costCenterId ? [row.costCenterId] : []))),
      this.organizationReads.getDepartmentBriefs([...new Set(rows.map((row) => row.departmentId))]),
      this.facts.formatter(await this.facts.reportingCurrency()),
    ]);
    const departmentOf = new Map(departments.map((department) => [department.id, department]));

    return rows.map((row) => ({
      id: row.id,
      subscriptionId: row.subscriptionId,
      assignmentId: row.assignmentId,
      employee: people.get(row.employeeId) ?? null,
      department: departmentOf.get(row.departmentId)
        ? {
            id: row.departmentId,
            code: departmentOf.get(row.departmentId)?.code ?? '',
            name: departmentOf.get(row.departmentId)?.name ?? '',
          }
        : null,
      costCenter: row.costCenterId ? (costCenters.get(row.costCenterId) ?? null) : null,
      days: row.days,
      daysInMonth: row.daysInMonth,
      monthlyPrice: money(row.monthlyPriceMinor),
      amount: money(row.amountMinor),
      appliedToCommitment: money(row.appliedMinor),
    }));
  }
}
