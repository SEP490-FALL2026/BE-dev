import { Injectable } from '@nestjs/common';
import { addDays } from '../../../core/business-date';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { BudgetFactsService } from '../budget/budget-facts.service';
import { SeatMonthService } from '../seat-month/seat-month.service';
import { SeatMonthChargeError } from '../seat-month/seat-month.errors';
import { explanationDueOn } from './budget-review-explanation.policy';
import { BudgetReviewFiguresService } from './budget-review-figures.service';
import { BudgetReviewPoolWatchService } from './budget-review-pool-watch.service';
import { BudgetReviewPeriodWriterService } from './budget-review-period-writer.service';
import { BudgetReviewQueryService } from './budget-review-query.service';
import type { ReviewPeriodWire } from './budget-review.dto';
import {
  BudgetReviewExistsError,
  BudgetReviewMonthNotEndedError,
  BudgetReviewNoBudgetError,
  BudgetReviewSeatMonthsError,
} from './budget-review.errors';
import { reviewKindOf, reviewedMonthHasEnded } from './budget-review.policy';
import { BudgetReviewRepo } from './budget-review.repo';

/**
 * Closes a month that has ended (`RV-1`, `QĐ-111ae`, R-2): the seat-months of the month are worked out first, so the figures of the departments hold what they
 * bore, and then the picture of every Cost Center with an effective budget of the year is written, once, with the company's own figures and the line of the
 * shared pool against its reserve (`QĐ-104i`). A month is closed once: what is recorded after is read in the next one, and the data is never locked (`R-2`).
 */
@Injectable()
export class BudgetReviewSnapshotService {
  constructor(
    private readonly facts: BudgetFactsService,
    private readonly repo: BudgetReviewRepo,
    private readonly figures: BudgetReviewFiguresService,
    private readonly seatMonths: SeatMonthService,
    private readonly poolWatch: BudgetReviewPoolWatchService,
    private readonly query: BudgetReviewQueryService,
    private readonly writer: BudgetReviewPeriodWriterService,
  ) {}

  /** Throws BudgetReviewMonthNotEndedError, BudgetReviewExistsError, BudgetReviewNoBudgetError, BudgetReviewSeatMonthsError. */
  async close(
    actor: AuthenticatedPrincipal,
    body: { year: number; month: number },
    now: Date = new Date(),
  ): Promise<ReviewPeriodWire> {
    this.facts.requireFinance(actor);
    const organizationId = await this.facts.organizationId();
    const today = await this.facts.today(now);
    if (!reviewedMonthHasEnded(body.year, body.month, today)) {
      throw new BudgetReviewMonthNotEndedError(body.year, body.month);
    }
    if (await this.repo.findByMonth(organizationId, body.year, body.month)) {
      throw new BudgetReviewExistsError(body.year, body.month);
    }
    const currency = await this.facts.reportingCurrency();
    if (!(await this.figures.hasBudget(body.year, currency))) throw new BudgetReviewNoBudgetError(body.year);
    await this.chargeSeatMonths(body, now);
    const [pool, companyMinor] = await Promise.all([
      this.poolWatch.figuresOf(organizationId, body.year, body.month),
      this.figures.companySpentMinor(body.year),
    ]);
    const explanationsDueOn =
      reviewKindOf(body.month) === 'QUARTER'
        ? explanationDueOn(today, await this.facts.nonWorkingDates(today, addDays(today, 30)))
        : null;
    const created = await this.writer.write(actor, {
      organizationId,
      ...body,
      currency,
      pool,
      companyMinor,
      explanationsDueOn,
      today,
      now,
    });

    return this.query.wireOf(actor, created);
  }

  /** The seat-months of the month are charged again whatever was charged before, so a change after the month ended is in the picture (`QĐ-111ae`). */
  private async chargeSeatMonths(body: { year: number; month: number }, now: Date): Promise<void> {
    try {
      await this.seatMonths.chargeMonth(`${body.year}-${String(body.month).padStart(2, '0')}-01`, now);
    } catch (error) {
      throw new BudgetReviewSeatMonthsError(error, error instanceof SeatMonthChargeError ? error.subscriptionIds : []);
    }
  }
}
