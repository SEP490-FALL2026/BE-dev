import { Injectable } from '@nestjs/common';
import { fiscalYearOf } from '../../../core/fiscal-year';
import { BudgetsReadApi } from '../../budgets/public/budgets-read.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { SpendWireViewService } from '../spend/spend-wire-view.service';
import type { NextYearBudgetWire } from './spend-approval.dto';
import { nextYearBudgetOf } from './next-year-budget.policy';
import { NextYearBudgetRepo } from './next-year-budget.repo';

/** What of a request the budget of the year after is read against: where it is charged and what it kept of that year at its approval. */
export interface NextYearBudgetSubject {
  requestId: string;
  costCenterId: string | null;
  /** The year the amount of the request was worked out for; what it kept is for the year after it. */
  budgetYear: number | null;
  nextYearAmountMinor: bigint | null;
  currency: string | null;
}

/**
 * The budget of the year after as the spending approver reads it on a request that goes into it (`QĐ-111al`, R-15, R-46, S-3): the approved
 * budget (base and reserve) of the Cost Center, what is left of it after the other approved requests, and what is left once this one is
 * approved, with a warning when it takes more than what is left. The warning is soft: nothing here stops an approval. Only the person who
 * holds the spend step reads it (the routes decide that); the sender and the head never see a figure of the budget, only the part of the
 * year after of their own request (`cost.nextYear`). It reads and writes nothing else; one statement for the budgets and one for the
 * sums, whatever the number of requests.
 */
@Injectable()
export class NextYearBudgetService {
  constructor(
    private readonly repo: NextYearBudgetRepo,
    private readonly budgets: BudgetsReadApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly wireView: SpendWireViewService,
  ) {}

  /** The figures of each request, by request id; a request that keeps nothing of the year after has none (null). */
  async of(
    subjects: readonly NextYearBudgetSubject[],
    now: Date = new Date(),
  ): Promise<Map<string, NextYearBudgetWire | null>> {
    const year = fiscalYearOf(await this.organizationReads.businessToday(now)) + 1;
    const keeping = subjects.filter(
      (subject) =>
        subject.costCenterId !== null && subject.budgetYear === year - 1 && (subject.nextYearAmountMinor ?? 0n) > 0n,
    );
    const costCenterIds = keeping.flatMap((subject) => (subject.costCenterId === null ? [] : [subject.costCenterId]));
    const [approved, kept] = await Promise.all([
      this.budgets.approvedBudgetsOfYear(costCenterIds, year),
      this.repo.keptByCostCenter(
        costCenterIds,
        year,
        subjects.map((subject) => subject.requestId),
      ),
    ]);

    const result = new Map<string, NextYearBudgetWire | null>(subjects.map((subject) => [subject.requestId, null]));
    const formatters = new Map<string, Awaited<ReturnType<SpendWireViewService['formatter']>>>();
    for (const subject of keeping) {
      const budget = approved.get(subject.costCenterId as string);
      const figures = nextYearBudgetOf({
        year,
        approvedMinor: budget ? budget.baseMinor + budget.reserveMinor : null,
        keptByOthersMinor: kept.get(subject.costCenterId as string) ?? 0n,
        thisMinor: subject.nextYearAmountMinor ?? 0n,
      });
      if (figures === null) continue;
      const currency = budget?.currency ?? subject.currency ?? 'VND';
      const money = formatters.get(currency) ?? (await this.wireView.formatter(currency));
      formatters.set(currency, money);
      const optional = (minor: bigint | null) => (minor === null ? null : money(minor));
      result.set(subject.requestId, {
        year: figures.year,
        approved: optional(figures.approvedMinor),
        remaining: optional(figures.remainingMinor),
        remainingAfter: optional(figures.remainingAfterMinor),
        warning: figures.warning,
      });
    }

    return result;
  }
}
