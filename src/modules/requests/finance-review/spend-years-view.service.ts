import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { YearResult } from '../spend/budget-check.policy';
import { BudgetCheckRepo, type CheckRecord } from '../spend/budget-check.repo';
import { BudgetCheckService } from '../spend/budget-check.service';
import { SpendReviewNotFoundError } from '../spend/spend.errors';
import { SpendStepRepo } from '../spend/spend-step.repo';
import type { YearWire } from './finance-review.dto';
import { SpendViewService, type Money } from './spend-view.service';

/**
 * The years of the check of a request, one page of them (`US-06-01` AC-1, AC-9, AC-18): what Finance reads of the newest check, and what
 * the person whose spend step is open reads of the check as it is now. Nobody else reads it (`QĐ-82m` `INF-06`).
 */
@Injectable()
export class SpendYearsViewService {
  constructor(
    private readonly views: SpendViewService,
    private readonly requests: AccessRequestRepo,
    private readonly steps: SpendStepRepo,
    private readonly checks: BudgetCheckRepo,
    private readonly runner: TransactionRunner,
    private readonly compute: BudgetCheckService,
  ) {}

  /** The years of the newest check, one page of them. Throws SpendReviewNotFoundError. */
  async years(
    actor: AuthenticatedPrincipal,
    requestId: string,
    query: { page: number; pageSize: number },
  ): Promise<Page<YearWire>> {
    await this.views.requireReader(actor, requestId);
    const live = await this.liveYears(actor, requestId);
    const check = live ? null : await this.checks.latest(requestId);
    if (!live && !check) throw new SpendReviewNotFoundError();
    const skip = (query.page - 1) * query.pageSize;
    const { items, total } = live
      ? { items: live.years.slice(skip, skip + query.pageSize), total: live.years.length }
      : await this.checks.pageYears((check as CheckRecord).id, skip, query.pageSize);
    const money = await this.views.formatter(live ? live.currency : (check as CheckRecord).currency);
    const nullable = (value: bigint | null): Money | null => (value === null ? null : money(value));

    return pageOf(
      items.map((year): YearWire => ({
        year: year.year,
        cost: money(year.costMinor),
        code: year.code,
        budget: nullable(year.budgetMinor),
        held: nullable(year.heldMinor),
        spent: nullable(year.spentMinor),
        remaining: nullable(year.remainingMinor),
        shareBasisPoints: year.shareBasisPoints,
        pending: nullable(year.pendingMinor),
      })),
      total,
      query.page,
      query.pageSize,
    );
  }

  /**
   * What the check says now, for the person whose spend step is open: they see what is left and what the others that wait cost
   * as they are at this moment, and what they decide on is made again when they decide (`US-06-01` AC-1, AC-9, AC-18). The
   * years of a request are few, since the term is bounded, so the page is cut from them here. Null for anybody else, and for a
   * request that cannot be checked, which is read as it was kept.
   */
  private async liveYears(
    actor: AuthenticatedPrincipal,
    requestId: string,
  ): Promise<{ currency: string; years: YearResult[] } | null> {
    const step = await this.steps.findOpen(requestId, 'SPEND_APPROVAL');
    const request = await this.requests.findById(requestId);
    if (!step || !request || step.state !== 'PENDING' || step.assigneeEmployeeId !== actor.employeeId) return null;
    const computed = await this.runner.run((tx) => this.compute.compute(tx, request, new Date()));

    return computed.status === 'COMPUTED' ? { currency: computed.currency, years: computed.result.years } : null;
  }
}
