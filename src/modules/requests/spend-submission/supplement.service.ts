import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import { accessRequestAuditEvent } from '../access-request/access-request-audit-event.mapper';
import { AccessRequestNotFoundError, AccessRequestNotPriceableError } from '../access-request/access-request.errors';
import { canViewRequest, viewFactsOf, hasSpendStep } from '../access-request/access-request.policy';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import { RepricingService } from '../assessment/repricing.service';
import { RequestAssessmentService } from '../access-request/request-assessment.service';
import { GroupSupplementService } from '../group-request/group-supplement.service';
import { SpendHeadService } from './spend-head.service';
import { SpendReadSupport } from '../spend/spend-read.service';
import { checkSupplement } from '../spend/spend-submission.policy';
import { SpendSupplementRefusedError } from '../spend/spend.errors';
import { SupplementRepo, type SupplementRecord } from './supplement.repo';
import type { SupplementBodyDto, SupplementWire } from '../spend/spend-submission.dto';

/**
 * The supplementary file of the head (`QĐ-82n`, `US-06-14` AC-13, AC-15; `US-05-04` AC-16): once a request is sent, the day the
 * money is expected to go out is changed only in a file of its own, with the reason, on a request that is back in the queue
 * (given back by Finance, or stopped by the data). The request is priced again for the new day and the budget year follows;
 * the file keeps what it was before and after, who and when, and what was first sent is not touched. A line of another year's
 * plan no longer fits, so the head attaches the request again before sending it. Nothing is sent: the head sends it on, and
 * the check runs again as a whole (`US-06-12`).
 */
@Injectable()
export class SupplementService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly requests: AccessRequestRepo,
    private readonly supplements: SupplementRepo,
    private readonly repricing: RepricingService,
    private readonly settings: RequestAssessmentService,
    private readonly head: SpendHeadService,
    private readonly organization: OrganizationApi,
    private readonly support: SpendReadSupport,
    private readonly audit: AuditApi,
    private readonly groups: GroupSupplementService,
  ) {}

  /**
   * Throws SpendNotHeadError, AccessRequestNotFoundError, SpendSupplementRefusedError and AccessRequestNotPriceableError.
   */
  async add(actor: AuthenticatedPrincipal, requestId: string, body: SupplementBodyDto): Promise<SupplementWire> {
    const departmentId = await this.head.departmentOf(actor);
    const { fiscalYearStartMonth } = await this.settings.settings();

    const record = await this.runner.run(async (tx) => {
      const request = await this.requests.lockById(tx, requestId);
      if (!request || request.departmentId !== departmentId || !hasSpendStep(request.policy)) {
        throw new AccessRequestNotFoundError();
      }
      const { pricing } = request;
      // The people of a group the head leaves out are judged first: a request for one person has none to leave out.
      const dropped = this.groups.check(request, body.dropEmployeeIds ?? []);
      const refusal = checkSupplement({
        state: request.state,
        priced: pricing.status === 'PRICED' && pricing.amount !== null,
        currentExpectedSpendOn: pricing.expectedSpendOn,
        newExpectedSpendOn: body.expectedSpendOn,
        leavesPeopleOut: dropped.length > 0,
      });
      if (refusal) throw new SpendSupplementRefusedError(refusal);

      const now = new Date();
      const today = await this.organization.businessToday(now, tx);
      const repriced = await this.repricing.reprice(
        tx,
        this.groups.withoutPeople(request, dropped),
        body.expectedSpendOn ?? (pricing.expectedSpendOn as string),
        { today, fiscalYearStartMonth },
      );
      // A quote may fix the day of the first payment itself: then the day did not change, and neither did anything else.
      if (dropped.length === 0 && repriced.expectedSpendOn === pricing.expectedSpendOn) {
        throw new SpendSupplementRefusedError('NO_CHANGE');
      }
      if (
        repriced.status !== 'PRICED' ||
        repriced.amount === null ||
        repriced.expectedSpendOn === null ||
        repriced.budgetYear === null ||
        pricing.amount === null ||
        pricing.expectedSpendOn === null ||
        pricing.budgetYear === null
      ) {
        throw new AccessRequestNotPriceableError();
      }

      await this.requests.setPricing(tx, requestId, repriced);
      // The line was a line of the plan of another year's budget when the year changed: it is attached again.
      if (repriced.budgetYear !== pricing.budgetYear && (request.planLine !== null || request.offPlan)) {
        await this.requests.setSpendPlan(tx, requestId, { line: null, offPlan: false });
      }
      const saved = await this.supplements.insert(tx, {
        organizationId: request.organizationId,
        requestId,
        reason: body.reason,
        changedByEmployeeId: actor.employeeId,
        beforeExpectedSpendOn: pricing.expectedSpendOn,
        afterExpectedSpendOn: repriced.expectedSpendOn,
        beforeBudgetYear: pricing.budgetYear,
        afterBudgetYear: repriced.budgetYear,
        beforeAmountMinor: pricing.amount.amountMinor,
        afterAmountMinor: repriced.amount.amountMinor,
        currency: pricing.amount.currency,
        now,
      });
      await this.groups.drop(tx, actor, request, dropped, body.reason, saved.number, now);
      await this.audit.record(
        tx,
        accessRequestAuditEvent(
          actor,
          request.organizationId,
          'ACCESS_REQUEST.SUPPLEMENT_ADDED',
          'ACCESS_REQUEST',
          requestId,
          {
            requestId,
            number: saved.number,
            before: saved.beforeExpectedSpendOn,
            after: saved.afterExpectedSpendOn,
            beforeBudgetYear: saved.beforeBudgetYear,
            afterBudgetYear: saved.afterBudgetYear,
            beforeAmountMinor: saved.beforeAmountMinor.toString(),
            afterAmountMinor: saved.afterAmountMinor.toString(),
            droppedEmployeeIds: dropped,
          },
        ),
      );

      return saved;
    });

    return (await this.wires(requestId, [record]))[0];
  }

  /** The supplementary files of the request, oldest first; read by the people who may read the request. */
  async list(
    actor: AuthenticatedPrincipal,
    requestId: string,
    query: { page: number; pageSize: number },
  ): Promise<Page<SupplementWire>> {
    const request = await this.requests.findById(requestId);
    const visible = request !== null && canViewRequest(actor, viewFactsOf(request));
    if (!visible) throw new AccessRequestNotFoundError();

    const { items, total } = await this.supplements.page(requestId, (query.page - 1) * query.pageSize, query.pageSize);

    return pageOf(await this.wires(requestId, items), total, query.page, query.pageSize);
  }

  private async wires(requestId: string, records: readonly SupplementRecord[]): Promise<SupplementWire[]> {
    const dropped = await this.groups.droppedBy(
      requestId,
      records.map((record) => record.number),
    );
    const people = await this.support.people(records.map((record) => record.changedByEmployeeId));

    return Promise.all(
      records.map(async (record): Promise<SupplementWire> => {
        const money = await this.support.formatter(record.currency);
        const changedBy = people.get(record.changedByEmployeeId);
        if (!changedBy) throw new Error('A supplementary file points at a missing person.');

        return {
          number: record.number,
          reason: record.reason,
          changedBy,
          createdAt: record.createdAt.toISOString(),
          expectedSpendOn: { before: record.beforeExpectedSpendOn, after: record.afterExpectedSpendOn },
          budgetYear: { before: record.beforeBudgetYear, after: record.afterBudgetYear },
          amount: { before: money(record.beforeAmountMinor), after: money(record.afterAmountMinor) },
          droppedCount: (dropped.get(record.number) ?? []).length,
        };
      }),
    );
  }
}
