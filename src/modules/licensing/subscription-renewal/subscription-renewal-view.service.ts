import { Injectable } from '@nestjs/common';
import { pageOf, type Page } from '../../../core/application/pagination';
import { formatAmount } from '../../../core/money/money';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { SubscriptionPeriodApi } from '../../catalog/public/subscription-period.api';
import type { RenewalPeriodFacts } from '../../catalog/public/subscription-period.types';
import { FinanceApi } from '../../finance/public/finance.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type {
  DeadlineEventWire,
  RankedSeatWire,
  RenewalAdjustmentWire,
  RenewalDetailWire,
  RenewalSummaryWire,
} from './subscription-renewal.dto';
import { RenewalError } from './subscription-renewal.errors';
import { decidedCancelOf, existingCaseOf, lateRenewalOf, pointOf } from './record/renewal-record.policy';
import { RenewalSeatsNeededService } from './seats-needed/renewal-seats-needed.service';
import {
  toAdjustmentWire,
  toDeadlineEvent,
  toRenewalDetail,
  toRenewalSummary,
  type ItAdminWire,
} from './subscription-renewal.mapper';
import { RenewalPartiesService, type RenewalReadScope } from './subscription-renewal-parties.service';
import { RenewalRankingService } from './subscription-renewal-ranking.service';
import { SubscriptionRenewalRepo } from './subscription-renewal.repo';
import type { DeadlineOutcome, RenewalRecord, RenewalState } from './subscription-renewal.types';

type PageQuery = { page: number; pageSize: number };

/**
 * The reads of the renewals (`US-11-02`, `US-11-05`): the queue of the cases and their pages, the ranked seats of a case of before, and the
 * events of renewal days passed with no result recorded. The IT Admin and Finance read every case (Finance only reads), whoever answers for the
 * subscription (a subscription has no owning department, `QĐ-113g`); nobody else reads them, the head of a department and the person who
 * decides spending included (`SoD-2`). A fixed number of statements per page.
 */
@Injectable()
export class RenewalViewService {
  constructor(
    private readonly repo: SubscriptionRenewalRepo,
    private readonly periods: SubscriptionPeriodApi,
    private readonly parties: RenewalPartiesService,
    private readonly ranking: RenewalRankingService,
    private readonly seatsNeeded: RenewalSeatsNeededService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly finance: FinanceApi,
  ) {}

  /** Throws RenewalError (`READ_FORBIDDEN`). */
  async list(
    actor: AuthenticatedPrincipal,
    query: PageQuery & { state?: RenewalState; subscriptionId?: string; late?: boolean; mine?: boolean },
  ): Promise<Page<RenewalSummaryWire>> {
    this.scopeOf(actor);
    // `mine` keeps the subscriptions the caller answers for; Finance has none, so its `mine` is empty.
    const mine = query.mine ? await this.periods.getResponsibleSubscriptionIds(actor.employeeId) : undefined;
    const { items, total } = await this.repo.page(
      {
        state: query.state,
        subscriptionId: query.subscriptionId,
        late: query.late,
        ...(mine ? { subscriptionIds: mine } : {}),
      },
      (query.page - 1) * query.pageSize,
      query.pageSize,
    );
    const periods = await this.periodsOf(items.map((item) => item.subscriptionId));
    const admins = await this.itAdminsOf([...periods.values()]);

    return pageOf(
      items.flatMap((item) => {
        const period = periods.get(item.subscriptionId);

        return period ? [toRenewalSummary(item, period, admins)] : [];
      }),
      total,
      query.page,
      query.pageSize,
    );
  }

  /** Throws RenewalError (`READ_FORBIDDEN`, `NOT_FOUND`). */
  async get(actor: AuthenticatedPrincipal, id: string): Promise<RenewalDetailWire> {
    this.scopeOf(actor);
    const record = await this.repo.find(id);
    if (!record) throw new RenewalError('NOT_FOUND');
    const period = (await this.periodsOf([record.subscriptionId])).get(record.subscriptionId);
    if (!period) throw new RenewalError('NOT_FOUND');

    return this.detailOf(record, actor);
  }

  /**
   * The seats a subscription needs for its next period, read before a result is recorded (`SBF-20` §4.6, §5): the point of adjustment, the count in
   * its three parts, the target and whether a cancellation is allowed. Read by the IT Admin and Finance (the route checks the role), with no lock:
   * the write counts again under the lock of the period. It is read from any day, before the point has come too. Throws RenewalError
   * (`NOT_FOUND`, `NOT_RENEWABLE`, `CONTRACT_DATA_INCOMPLETE`).
   */
  async adjustmentOf(actor: AuthenticatedPrincipal, subscriptionId: string): Promise<RenewalAdjustmentWire> {
    const period = (await this.periodsOf([subscriptionId])).get(subscriptionId);
    if (!period) throw new RenewalError('NOT_FOUND');
    const cases = (await this.repo.ofSubscriptions([subscriptionId])).get(subscriptionId) ?? [];
    const decidedCancel = decidedCancelOf(cases);
    // A cancellation decided before the one-write rule is answered by its case; CANCELLED is for one recorded as decided (V-3).
    const ending = (await this.repo.endingAmong([subscriptionId])).has(subscriptionId) && decidedCancel === null;
    const found = pointOf(period, ending);
    if ('refusal' in found) throw new RenewalError(found.refusal.problem, found.refusal.details);
    if (decidedCancel) throw new RenewalError('ALREADY_PROPOSED', { renewalId: decidedCancel.id });
    const { adjustment } = found;
    const counts = await this.seatsNeeded.countFor({
      subscriptionId,
      planId: period.planId,
      vendorMinimumSeats: period.vendorMinimumSeats,
      isPrimaryForPlan: period.isPrimaryForPlan,
      renewalOn: adjustment.end,
      today: await this.organizationReads.businessToday(),
    });

    return toAdjustmentWire(period, adjustment, counts, {
      responsibleItAdminEmployeeId: await this.parties.usableResponsibleItAdminOf(period),
      callerEmployeeId: actor.employeeId,
      recordedRenewalId: existingCaseOf(cases, adjustment.deadline)?.id ?? null,
    });
  }

  /** The page of a case just written, read as its route answers it to the caller; the IT Admin does not read the money snapshot. */
  async detailOf(record: RenewalRecord, actor: AuthenticatedPrincipal): Promise<RenewalDetailWire> {
    const period = (await this.periodsOf([record.subscriptionId])).get(record.subscriptionId);
    if (!period) throw new RenewalError('NOT_FOUND');
    const today = await this.organizationReads.businessToday();
    const seats = await this.ranking.seatsOf(record.subscriptionId, today);

    return toRenewalDetail(record, {
      period,
      admins: await this.itAdminsOf([period]),
      seatsInUse: seats.held.length,
      usageAvailable: seats.usageAvailable,
      released: await this.repo.releasedOf(record.id),
      savings: await this.savingsOf(record),
      lateRenewal: record.outcome
        ? lateRenewalOf(record, period, await this.organizationReads.businessToday(record.outcome.recordedAt))
        : false,
      showSnapshot: !actor.roles.includes('IT_ADMIN'),
    });
  }

  /**
   * The personal seats in use of the period of the case, in the order a reduction is chosen from (`QĐ-66x`), a page at a time, with
   * those the IT Admin proposed to take back marked (and only those with `proposedOnly`). Read by the IT Admin, not by Finance. Throws RenewalError (`READ_FORBIDDEN`, `NOT_FOUND`).
   */
  async seatRanking(
    actor: AuthenticatedPrincipal,
    id: string,
    query: PageQuery & { proposedOnly?: boolean },
  ): Promise<Page<RankedSeatWire> & { usage: { status: 'AVAILABLE' | 'NOT_AVAILABLE' }; seatsInUse: number }> {
    const today = await this.organizationReads.businessToday();
    const scope = this.scopeOf(actor);
    if (!scope.itAdmin) throw new RenewalError('READ_FORBIDDEN');
    const record = await this.repo.find(id);
    if (!record) throw new RenewalError('NOT_FOUND');
    const period = (await this.periodsOf([record.subscriptionId])).get(record.subscriptionId);
    if (!period) throw new RenewalError('NOT_FOUND');
    const seats = await this.ranking.seatsOf(record.subscriptionId, today);
    const proposed = new Set((await this.repo.releasedOf(id)).map((seat) => seat.assignmentId));
    const shown =
      query.proposedOnly === true ? seats.ranked.filter((seat) => proposed.has(seat.assignmentId)) : seats.ranked;
    const slice = shown.slice((query.page - 1) * query.pageSize, query.page * query.pageSize);
    const people = new Map(
      (await this.organizationReads.getEmployees(slice.map((seat) => seat.employeeId))).map((person) => [
        person.id,
        person,
      ]),
    );
    const items = slice.flatMap((seat): RankedSeatWire[] => {
      const person = people.get(seat.employeeId);

      return person
        ? [
            {
              assignmentId: seat.assignmentId,
              employee: { id: person.id, employeeCode: person.employeeCode, fullName: person.fullName },
              group: seat.group,
              position: seat.position,
              validFrom: seat.validFrom,
              lastActivityOn: seat.lastActivityOn,
              inProposal: proposed.has(seat.assignmentId),
            },
          ]
        : [];
    });

    return {
      ...pageOf(items, shown.length, query.page, query.pageSize),
      usage: { status: seats.usageAvailable ? 'AVAILABLE' : 'NOT_AVAILABLE' },
      seatsInUse: seats.held.length,
    };
  }

  /** The events of renewal days passed with no result recorded, newest first: the incidents counted by `KPI-4` and the marks of an end. */
  async deadlineEvents(
    query: PageQuery & { kind?: DeadlineOutcome; from?: string; to?: string },
  ): Promise<Page<DeadlineEventWire>> {
    const { items, total } = await this.repo.pageDeadlineEvents(
      { kind: query.kind, from: query.from, to: query.to },
      (query.page - 1) * query.pageSize,
      query.pageSize,
    );
    const periods = await this.periodsOf(items.map((item) => item.subscriptionId));
    const admins = await this.itAdminsOf([...periods.values()]);

    return pageOf(
      items.flatMap((item) => {
        const period = periods.get(item.subscriptionId);

        return period ? [toDeadlineEvent(item, period, admins)] : [];
      }),
      total,
      query.page,
      query.pageSize,
    );
  }

  private scopeOf(actor: AuthenticatedPrincipal): RenewalReadScope {
    const scope = this.parties.readScopeOf(actor);
    if (!scope) throw new RenewalError('READ_FORBIDDEN');

    return scope;
  }

  /** The IT Admins who answer for these periods, by name, in one read. */
  private async itAdminsOf(periods: readonly RenewalPeriodFacts[]): Promise<Map<string, ItAdminWire>> {
    const ids = [
      ...new Set(
        periods.flatMap((period) => (period.responsibleItAdminEmployeeId ? [period.responsibleItAdminEmployeeId] : [])),
      ),
    ];
    const people = await this.organizationReads.getEmployees(ids);

    return new Map(
      people.map((person) => [
        person.id,
        { employeeId: person.id, employeeCode: person.employeeCode, fullName: person.fullName },
      ]),
    );
  }

  private async periodsOf(ids: readonly string[]): Promise<Map<string, RenewalPeriodFacts>> {
    const periods = await this.periods.getPeriods([...new Set(ids)]);

    return new Map(periods.map((period) => [period.subscriptionId, period]));
  }

  private async savingsOf(record: RenewalRecord): Promise<{ amount: string; currency: string } | null> {
    const savings = record.outcome?.realisedSavings;
    if (!savings) return null;
    const currency = await this.finance.findCurrency(savings.currency);

    return { amount: formatAmount(savings.amountMinor, currency?.minorUnit ?? 0), currency: savings.currency };
  }
}
