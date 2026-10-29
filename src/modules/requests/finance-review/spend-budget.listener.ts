import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import {
  BudgetChangeListeners,
  budgetChangeHandler,
  type BudgetChangeListener,
  type BudgetRefusalEvent,
  type BudgetVersionEvent,
  type PlanLineMovedEvent,
} from '../../budgets/public/budgets.extension-points';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { BudgetCheckRepo } from '../spend/budget-check.repo';
import { BUDGET_LACKING_CODES } from './finance-review.policy';
import { FinanceReviewService } from './finance-review.service';
import { SpendRequestRepo } from '../spend/spend-request.repo';
import { SpendRoutingService } from '../spend/spend-routing.service';

/** How a version of the budget a request waited for ended without being approved. */
type VersionEnd = BudgetRefusalEvent['decision'] | 'EXPIRED';

/**
 * What the requests that wait on a budget do when it changes (`US-06-13`, `US-06-09` AC-17), in the transaction of the change.
 * Finance moving a plan line ends the review that waited on it and checks the request again; a version of a budget that is approved
 * checks again every request that waits for one in that year. A version that is refused, sent back or expires before it was ever
 * current changes nothing for those requests: they keep waiting, under control, and Finance is told so, to give the request back to its
 * head or give its opinion when it chooses (J.3, F65, `QĐ-92a`); no review is opened by the change, and no spend step is made from a
 * version that did not become current. Each request is locked and judged on what it is now. It adds itself to the change listeners of
 * the budgets when the module starts, so the budgets never import this module (ADR-0016).
 */
@Injectable()
export class SpendBudgetListener implements BudgetChangeListener, OnModuleInit {
  constructor(
    private readonly requests: AccessRequestRepo,
    private readonly found: SpendRequestRepo,
    private readonly checks: BudgetCheckRepo,
    private readonly reviews: FinanceReviewService,
    private readonly routing: SpendRoutingService,
    private readonly audit: AuditApi,
    private readonly budgetChanges: BudgetChangeListeners,
  ) {}

  onModuleInit(): void {
    this.budgetChanges.add('requests.spend-budget', budgetChangeHandler(this));
  }

  /**
   * The requests that wait for a version of the year are locked by id, and then every budget year they bind (with the year of the
   * version) earliest first, all before the lock the budget takes for itself (F31, F69). The years are taken here, not one by one
   * as each request is checked again: a request that binds an earlier year would otherwise take that lock while the later one is
   * held, against a holder of both in the order the system keeps.
   */
  async lockWaiting(tx: DbTx, scope: { costCenterId: string; year: number }): Promise<void> {
    const waiting = await this.waitingFor(tx, scope.costCenterId, scope.year);
    await this.lockRequestsAndYears(tx, scope.costCenterId, waiting.ids, [scope.year, ...waiting.years]);
  }

  async planLineMoved(tx: DbTx, actor: AuthenticatedPrincipal, event: PlanLineMovedEvent): Promise<void> {
    // Every request is locked, by id, and every year they bind, before the first one is checked again: checking one takes the budget
    // year lock and keeps it, and a request or an earlier year locked after that would be waited for while a holder of it waits for
    // the year (F31, F70).
    const ids = [...(await this.found.awaitingReviewOnLine(tx, event.versionIds, event.position))].sort();
    const latest = await this.checks.latestOf(ids, tx);
    const years = ids.flatMap((id) => latest.get(id)?.years.map((entry) => entry.year) ?? []);
    const locked = await this.lockRequestsAndYears(tx, event.costCenterId, ids, years);
    for (const request of locked) await this.reviews.endBecauseLineMoved(tx, actor, request, event.reason);
  }

  private async lockRequestsAndYears(
    tx: DbTx,
    costCenterId: string,
    ids: readonly string[],
    years: readonly number[],
  ): Promise<AccessRequestRecord[]> {
    const locked: AccessRequestRecord[] = [];
    for (const id of [...ids].sort()) {
      const request = await this.requests.lockById(tx, id);
      if (request) locked.push(request);
    }
    await this.checks.lockBudgetYears(tx, costCenterId, years);

    return locked;
  }

  async versionApproved(tx: DbTx, actor: AuthenticatedPrincipal, event: BudgetVersionEvent): Promise<void> {
    for (const request of await this.waitingForYear(tx, event)) {
      const outcome = await this.routing.route(tx, actor, request, 'BUDGET_VERSION_APPROVED', new Date());
      if (outcome.status === 'NOT_CHECKABLE') await this.routing.backToSubmission(tx, request);
    }
  }

  async versionRefused(tx: DbTx, actor: AuthenticatedPrincipal, event: BudgetRefusalEvent): Promise<void> {
    for (const request of await this.waitingForYear(tx, event))
      await this.ended(tx, actor, request, event, event.decision);
  }

  async versionExpired(tx: DbTx, event: BudgetVersionEvent): Promise<void> {
    for (const request of await this.waitingForYear(tx, event)) await this.ended(tx, null, request, event, 'EXPIRED');
  }

  /**
   * The request keeps waiting; the Audit Trail says that the version it waited for ended and how, which is where Finance is told from
   * (row 48 of the table of events). Nothing about the request changes: Finance moves it from here (`financeReviewComplete`).
   */
  private async ended(
    tx: DbTx,
    actor: AuthenticatedPrincipal | null,
    request: AccessRequestRecord,
    event: BudgetVersionEvent,
    decision: VersionEnd,
  ): Promise<void> {
    const after = {
      requestId: request.id,
      versionId: event.versionId,
      costCenterId: event.costCenterId,
      year: event.year,
      decision,
    };
    const action = 'ACCESS_REQUEST.BUDGET_VERSION_ENDED';
    await this.audit.record(
      tx,
      actor
        ? accessRequestAuditEvent(actor, request.organizationId, action, 'ACCESS_REQUEST', request.id, after)
        : {
            // The year-end closure ended the version: nobody acted, so the actor is the system.
            organizationId: request.organizationId,
            actorKind: 'SYSTEM',
            actorAppUserId: null,
            actorRoles: [],
            action,
            resourceType: 'ACCESS_REQUEST',
            resourceId: request.id,
            before: null,
            after,
            correlationId: event.versionId,
          },
    );
  }

  /**
   * The requests of the Cost Center that wait, under control, for a version of the budget of this year: the request was moved to wait
   * by the outcome Finance recorded (a budget asked for), and its check had this year with no budget or with too little. A request that
   * waits is never one that waits for a year the check found enough for (F33), whatever the code that put it in front of Finance.
   */
  private async waitingForYear(tx: DbTx, event: BudgetVersionEvent): Promise<AccessRequestRecord[]> {
    const waiting: AccessRequestRecord[] = [];
    for (const id of (await this.waitingFor(tx, event.costCenterId, event.year)).ids) {
      // Already locked by `lockWaiting` before the year lock; locked again here for the one that is read last. A request that began
      // to wait after `lockWaiting` read the set (it holds the year lock while it does, so it is seen only after that lock) is the
      // one case taken here, and its other years were taken with it.
      const request = await this.requests.lockById(tx, id);
      if (request?.state === 'AWAITING_BUDGET') waiting.push(request);
    }

    return waiting;
  }

  /**
   * The requests of the Cost Center that wait for a version of the year, read without a lock, and every year their newest check
   * binds: the ids in order, the years as the checks say them.
   */
  private async waitingFor(tx: DbTx, costCenterId: string, year: number): Promise<{ ids: string[]; years: number[] }> {
    const candidates = await this.found.awaitingBudget(tx, costCenterId);
    const latest = await this.checks.latestOf(candidates, tx);
    const ids = candidates.filter((id) =>
      latest
        .get(id)
        ?.years.some((entry) => entry.year === year && entry.code !== null && BUDGET_LACKING_CODES.has(entry.code)),
    );

    return { ids, years: ids.flatMap((id) => latest.get(id)?.years.map((entry) => entry.year) ?? []) };
  }
}
