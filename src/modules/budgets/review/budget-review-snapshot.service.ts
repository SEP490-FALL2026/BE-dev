import { Injectable } from '@nestjs/common';
import { addDays, type BusinessDate } from '../../../core/business-date';
import { isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { budgetAuditEvent, BudgetFactsService } from '../budget/budget-facts.service';
import { SeatMonthService } from '../seat-month/seat-month.service';
import { explanationDueOn } from './budget-review-explanation.policy';
import { BudgetReviewFiguresService } from './budget-review-figures.service';
import { BudgetReviewPoolWatchService, type SharedPoolFigures } from './budget-review-pool-watch.service';
import { BudgetReviewQueryService } from './budget-review-query.service';
import type { ReviewPeriodWire } from './budget-review.dto';
import {
  BudgetReviewExistsError,
  BudgetReviewMonthNotEndedError,
  BudgetReviewNoBudgetError,
  BudgetReviewSeatMonthsError,
} from './budget-review.errors';
import { reviewKindOf, reviewedMonthHasEnded } from './budget-review.policy';
import { BudgetReviewRepo, type NewReviewLine, type ReviewPeriodRecord } from './budget-review.repo';

/** What the close of one month is made from, read before the transaction opens. */
interface CloseInput {
  organizationId: string;
  year: number;
  month: number;
  currency: string;
  pool: SharedPoolFigures;
  companyMinor: bigint;
  /** The day the heads are asked to explain a quarter by; null for a month. */
  explanationsDueOn: BusinessDate | null;
  now: Date;
}

/**
 * Closes a month that has ended (`RV-1`, `QĐ-111ae`, R-2): the seat-months of the month are worked out first, so the figures of the departments hold what they
 * bore, and then the picture of every Cost Center with an effective budget of the year is written, once, with the company's own figures and the line of the
 * shared pool against its reserve (`QĐ-104i`). A month is closed once: what is recorded after is read in the next one, and the data is never locked (`R-2`).
 */
@Injectable()
export class BudgetReviewSnapshotService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly facts: BudgetFactsService,
    private readonly repo: BudgetReviewRepo,
    private readonly figures: BudgetReviewFiguresService,
    private readonly seatMonths: SeatMonthService,
    private readonly poolWatch: BudgetReviewPoolWatchService,
    private readonly audit: AuditApi,
    private readonly query: BudgetReviewQueryService,
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
    const created = await this.write(actor, {
      organizationId,
      ...body,
      currency,
      pool,
      companyMinor,
      explanationsDueOn,
      now,
    });

    return this.query.wireOf(actor, created);
  }

  /** The seat-months of the month are charged again whatever was charged before, so a change after the month ended is in the picture (`QĐ-111ae`). */
  private async chargeSeatMonths(body: { year: number; month: number }, now: Date): Promise<void> {
    try {
      await this.seatMonths.chargeMonth(`${body.year}-${String(body.month).padStart(2, '0')}-01`, now);
    } catch (error) {
      throw new BudgetReviewSeatMonthsError(error);
    }
  }

  private async write(actor: AuthenticatedPrincipal, input: CloseInput): Promise<ReviewPeriodRecord> {
    try {
      return await this.runner.run(async (tx) => {
        if (await this.repo.findByMonth(input.organizationId, input.year, input.month, tx)) {
          throw new BudgetReviewExistsError(input.year, input.month);
        }
        const lines = await this.figures.linesOf(tx, input.year, input.month, input.currency);
        const period = await this.insert(tx, actor, input, lines);
        await this.poolWatch.tellFinance(tx, input.organizationId, input.year, input.month, input.pool);

        return period;
      });
    } catch (error) {
      // Two closings of the same month at the same moment: the database keeps one, the other answers what the check before the write answers.
      if (isUniqueViolation(error, 'BudgetReviewPeriod', '"year"', 'budget_review_periods')) {
        throw new BudgetReviewExistsError(input.year, input.month);
      }
      throw error;
    }
  }

  /** The period with its lines, and the audit event that says who closed what. */
  private async insert(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: CloseInput,
    lines: readonly NewReviewLine[],
  ): Promise<ReviewPeriodRecord> {
    const period = await this.repo.insert(
      tx,
      {
        organizationId: input.organizationId,
        year: input.year,
        month: input.month,
        kind: reviewKindOf(input.month),
        currency: input.currency,
        snapshotByEmployeeId: actor.employeeId,
        snapshotAt: input.now,
        companySpentMinor: input.companyMinor,
        sharedPoolUnallocatedMinor: input.pool.unallocatedMinor,
        sharedPoolReserveMinor: input.pool.reserveMinor,
        annualCeilingMinor: input.pool.annualCeilingMinor,
        explanationsDueOn: input.explanationsDueOn,
      },
      lines,
    );
    await this.audit.record(
      tx,
      budgetAuditEvent(actor, input.organizationId, 'BUDGET_REVIEW.PERIOD_CLOSED', 'BudgetReviewPeriod', period.id, {
        year: input.year,
        month: input.month,
        kind: period.kind,
        lines: lines.length,
        companySpentMinor: input.companyMinor.toString(),
        sharedPoolUnallocatedMinor: input.pool.unallocatedMinor.toString(),
      }),
    );

    return period;
  }
}
