import { Injectable } from '@nestjs/common';
import { pageOf, type Page } from '../../../core/application/pagination';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { monthBoundsOf } from '../../../core/business-date';
import { BudgetFactsService, type MoneyView } from '../budget/budget-facts.service';
import { heldKey } from '../budget/commitment.repo';
import { InvoiceRepo } from '../budget/invoice.repo';
import { explanationViewOf } from './budget-review-explanation.mapper';
import { BudgetReviewNotFoundError } from './budget-review.errors';
import type { ReviewLineWire, ReviewPeriodWire } from './budget-review.dto';
import {
  BudgetReviewRepo,
  type ReviewLightCounts,
  type ReviewLineRecord,
  type ReviewPeriodRecord,
} from './budget-review.repo';
import { sharedPoolOverReserve } from './budget-review.policy';

/** What `GET /budget-review-periods/{id}` answers: the period and a page of its lines. */
export interface ReviewPeriodDetailView extends Page<ReviewLineWire> {
  period: ReviewPeriodWire;
}

/**
 * Reads the review periods for Finance and the spending approver, who read all of them, and for a manager, who reads the lines of the Cost Center of their own
 * department (`D8`: a manager with no Cost Center of the year reads nothing, and an id outside their scope is a 404). The picture is read as it was written;
 * nothing is worked out here.
 */
@Injectable()
export class BudgetReviewQueryService {
  constructor(
    private readonly repo: BudgetReviewRepo,
    private readonly facts: BudgetFactsService,
    private readonly invoices: InvoiceRepo,
  ) {}

  async list(
    actor: AuthenticatedPrincipal,
    query: { year?: number; page: number; pageSize: number },
  ): Promise<Page<ReviewPeriodWire>> {
    const organizationId = await this.facts.organizationId();
    const scope = await this.scopeOf(actor, query.year);
    if (scope !== null && scope.length === 0) return pageOf([], 0, query.page, query.pageSize);
    const { rows, total } = await this.repo.page({
      organizationId,
      year: query.year,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return pageOf(await this.periodWires(rows, scope), total, query.page, query.pageSize);
  }

  async detail(
    actor: AuthenticatedPrincipal,
    id: string,
    query: { page: number; pageSize: number },
  ): Promise<ReviewPeriodDetailView> {
    const period = await this.repo.findById(id);
    if (!period) throw new BudgetReviewNotFoundError();
    const scope = await this.scopeOf(actor, period.year);
    if (scope !== null && scope.length === 0) throw new BudgetReviewNotFoundError();
    const { rows, total } = await this.repo.linesPage({
      periodId: id,
      costCenterIds: scope ?? undefined,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    const [[wire], lines] = await Promise.all([this.periodWires([period], scope), this.lineWires(period, rows)]);

    return { ...pageOf(lines, total, query.page, query.pageSize), period: wire };
  }

  /** One period as the caller reads it: for the use of the services that write it (the close and the signature). */
  async wireOf(actor: AuthenticatedPrincipal, period: ReviewPeriodRecord): Promise<ReviewPeriodWire> {
    const [wire] = await this.periodWires([period], await this.scopeOf(actor, period.year));

    return wire;
  }

  /** Null: reads every Cost Center (Finance, the spending approver). Else the Cost Centers of the departments the manager heads in the year. */
  private async scopeOf(actor: AuthenticatedPrincipal, year: number | undefined): Promise<string[] | null> {
    if (actor.roles.includes('FINANCE') || actor.roles.includes('SPENDING_APPROVER')) return null;
    const units = await this.facts.headedUnitsFor(actor.employeeId, await this.facts.today(new Date()), year);

    return units.flatMap((unit) => (unit.costCenter ? [unit.costCenter.id] : []));
  }

  private async periodWires(
    periods: readonly ReviewPeriodRecord[],
    scope: readonly string[] | null,
  ): Promise<ReviewPeriodWire[]> {
    const people = await this.facts.people(
      periods.flatMap((one) => [one.snapshotByEmployeeId, one.signedByEmployeeId]),
    );
    const counts = await this.repo.lightCountsOf(
      periods.map((one) => one.id),
      scope ?? undefined,
    );
    const money = new Map<string, (minor: bigint) => MoneyView>();
    const wires: ReviewPeriodWire[] = [];
    for (const period of periods) {
      if (!money.has(period.currency)) money.set(period.currency, await this.facts.formatter(period.currency));
      const format = money.get(period.currency) as (minor: bigint) => MoneyView;
      wires.push({
        id: period.id,
        year: period.year,
        month: period.month,
        kind: period.kind,
        state: period.state,
        currency: period.currency,
        closedBy: people.get(period.snapshotByEmployeeId) ?? null,
        closedAt: period.snapshotAt.toISOString(),
        explanationsDueOn: period.explanationsDueOn,
        signedBy: period.signedByEmployeeId ? (people.get(period.signedByEmployeeId) ?? null) : null,
        signedAt: period.signedAt?.toISOString() ?? null,
        note: period.note,
        lightCounts: counts.get(period.id) as ReviewLightCounts,
        company:
          scope === null
            ? {
                spent: format(period.companySpentMinor),
                sharedPoolUnallocated: format(period.sharedPoolUnallocatedMinor),
                sharedPoolReserve:
                  period.sharedPoolReserveMinor === null ? null : format(period.sharedPoolReserveMinor),
                sharedPoolOverReserve: sharedPoolOverReserve(
                  period.sharedPoolUnallocatedMinor,
                  period.sharedPoolReserveMinor,
                ),
                annualCeiling: period.annualCeilingMinor === null ? null : format(period.annualCeilingMinor),
              }
            : null,
      });
    }

    return wires;
  }

  private async lineWires(period: ReviewPeriodRecord, rows: readonly ReviewLineRecord[]): Promise<ReviewLineWire[]> {
    const [costCenters, money] = await Promise.all([
      this.facts.costCenters(rows.map((row) => row.costCenterId)),
      this.facts.formatter(period.currency),
    ]);
    const now = await this.spentNow(period, rows);
    const people = await this.facts.people(
      rows.flatMap((row) => (row.explanation ? [row.explanation.explainedByEmployeeId] : [])),
    );

    return rows.map((row) => ({
      id: row.id,
      costCenter: costCenters.get(row.costCenterId) ?? null,
      base: money(row.baseMinor),
      reserve: money(row.reserveMinor),
      spent: money(row.spentMinor),
      spentAfterMonth: money(row.spentAfterMonthMinor),
      priorYearReleased: money(row.priorYearReleasedMinor),
      changedAfterSnapshot: money((now.get(heldKey(row.costCenterId, period.year)) ?? 0n) - row.spentMinor),
      committed: money(row.committedMinor),
      pendingSpend: money(row.pendingSpendMinor),
      remaining: money(row.remainingMinor),
      variancePpm: Number(row.variancePpm),
      priceIncrease: money(row.priceIncreaseMinor),
      forecast: money(row.forecastMinor),
      paceBasisPoints: row.paceBasisPoints === null ? null : Number(row.paceBasisPoints),
      light: row.light,
      explanationStatus: row.explanationStatus,
      explanation: explanationViewOf(row.explanation, money, people),
    }));
  }

  /**
   * What each Cost Center of the page spent through the end of the month of the period as it stands now, by the month each invoice or seat-month pays for: what the
   * picture kept is read against it (`QĐ-111ae`: an invoice that comes late for a month is a change after the picture). Worked out when read, never kept, so the
   * picture stays as it was written.
   */
  private async spentNow(period: ReviewPeriodRecord, rows: readonly ReviewLineRecord[]): Promise<Map<string, bigint>> {
    const first = `${period.year}-${String(period.month).padStart(2, '0')}-01`;

    return this.invoices.spentOf(
      rows.map((row) => ({ costCenterId: row.costCenterId, year: period.year })),
      undefined,
      monthBoundsOf(first).nextStart,
    );
  }
}
