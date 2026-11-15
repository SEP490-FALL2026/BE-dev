import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import { budgetAuditEvent, BudgetFactsService } from '../budget/budget-facts.service';
import { BudgetReviewQueryService } from './budget-review-query.service';
import type { ReviewPeriodWire } from './budget-review.dto';
import { BudgetReviewNotFoundError, BudgetReviewSignedError } from './budget-review.errors';
import { BudgetReviewRepo } from './budget-review.repo';

/**
 * Finance signs a month that was closed (`RV-1`, `QĐ-111ae`): only Finance signs, never the spending approver, and the signature closes the period for good.
 * A month closed on its figures is signed as it stands; a quarter (March, June, September) is signed with the explanations the departments gave, or the
 * note that they gave none (`RV-3`). Signing locks no data (`R-2`): an invoice that comes later is read in the next month. The spending approver is
 * told the summary with the table of lights: how many Cost Centers are green, yellow, red or under, never a figure (`QĐ-99h`), and reads the lines in the period.
 */
@Injectable()
export class BudgetReviewSignatureService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly facts: BudgetFactsService,
    private readonly repo: BudgetReviewRepo,
    private readonly audit: AuditApi,
    private readonly notifications: NotificationsApi,
    private readonly query: BudgetReviewQueryService,
  ) {}

  /** Throws BudgetReviewNotFoundError, BudgetReviewSignedError. */
  async sign(
    actor: AuthenticatedPrincipal,
    id: string,
    body: { note?: string },
    now: Date = new Date(),
  ): Promise<ReviewPeriodWire> {
    this.facts.requireFinance(actor);
    const signed = await this.runner.run(async (tx) => {
      const period = await this.repo.findById(id, tx);
      if (!period) throw new BudgetReviewNotFoundError();
      if (!(await this.repo.sign(tx, id, { employeeId: actor.employeeId, at: now, note: body.note ?? null }))) {
        throw new BudgetReviewSignedError();
      }
      await this.audit.record(
        tx,
        budgetAuditEvent(
          actor,
          period.organizationId,
          'BUDGET_REVIEW.PERIOD_SIGNED',
          'BudgetReviewPeriod',
          id,
          { year: period.year, month: period.month, kind: period.kind, state: 'SIGNED', note: body.note ?? null },
          { state: period.state },
        ),
      );
      await this.tellSpendingApprover(tx, id);

      return (await this.repo.findById(id, tx)) ?? period;
    });

    return this.query.wireOf(actor, signed);
  }

  /** The summary of the month for the spending approver: the period and how many Cost Centers have each light. Nobody is told when nobody holds the role. */
  private async tellSpendingApprover(tx: DbTx, id: string): Promise<void> {
    const period = await this.repo.findById(id, tx);
    const approver = await this.facts.usableSpendingApproverEmployeeId(tx);
    if (!period || approver === null) return;
    const counts = (await this.repo.lightCountsOf([id], undefined, tx)).get(id);
    await this.notifications.notifyInApp(tx, {
      organizationId: period.organizationId,
      recipientEmployeeId: approver,
      code: 'BUDGET_REVIEW_SUMMARY',
      subject: { type: 'BUDGET_REVIEW_PERIOD', id },
      params: {
        periodId: id,
        year: period.year,
        month: period.month,
        kind: period.kind,
        greenCount: counts?.GREEN ?? 0,
        yellowCount: counts?.YELLOW ?? 0,
        redCount: counts?.RED ?? 0,
        underCount: counts?.UNDER ?? 0,
      },
      eventKey: `budgetReviewSummary:${id}`,
    });
  }
}
