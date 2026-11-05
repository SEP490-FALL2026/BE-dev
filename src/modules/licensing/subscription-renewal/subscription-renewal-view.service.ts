import { Injectable } from '@nestjs/common';
import { pageOf, type Page } from '../../../core/application/pagination';
import type { BusinessDate } from '../../../core/business-date';
import { formatAmount } from '../../../core/money/money';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { SubscriptionPeriodApi } from '../../catalog/public/subscription-period.api';
import type { RenewalPeriodFacts } from '../../catalog/public/subscription-period.types';
import { FinanceApi } from '../../finance/public/finance.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type {
  DeadlineEventWire,
  RankedSeatWire,
  RenewalDetailWire,
  RenewalSummaryWire,
} from './subscription-renewal.dto';
import { RenewalError } from './subscription-renewal.errors';
import { renewalWaitingReason } from './decision/renewal-decision.policy';
import { toDeadlineEvent, toRenewalDetail, toRenewalSummary } from './subscription-renewal.mapper';
import { RenewalPartiesService, type RenewalReadScope } from './subscription-renewal-parties.service';
import { RenewalRankingService } from './subscription-renewal-ranking.service';
import { SubscriptionRenewalRepo } from './subscription-renewal.repo';
import type { DeadlineOutcome, RenewalRecord, RenewalState } from './subscription-renewal.types';

type PageQuery = { page: number; pageSize: number };

/**
 * The reads of the renewals (`US-11-02`, `US-11-05`): the queue of the cases and their pages, the ranked seats a reduction is
 * chosen from, and the events of milestones passed with no decision. The IT Admin and Finance read every case (Finance only reads);
 * the head of a department reads the cases of the subscriptions that department owns and no other, a case of another department
 * being as good as absent; an employee and the person who decides spending never read them (`SoD-2`). A fixed number of statements
 * per page.
 */
@Injectable()
export class RenewalViewService {
  constructor(
    private readonly repo: SubscriptionRenewalRepo,
    private readonly periods: SubscriptionPeriodApi,
    private readonly catalog: CatalogApi,
    private readonly parties: RenewalPartiesService,
    private readonly ranking: RenewalRankingService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly finance: FinanceApi,
  ) {}

  /** Throws RenewalError (`READ_FORBIDDEN`). */
  async list(
    actor: AuthenticatedPrincipal,
    query: PageQuery & { state?: RenewalState; subscriptionId?: string; late?: boolean },
  ): Promise<Page<RenewalSummaryWire>> {
    const today = await this.organizationReads.businessToday();
    const scope = await this.scopeOf(actor, today);
    const owned = scope.kind === 'DEPARTMENT' ? await this.catalog.getSubscriptionIdsOwnedBy(scope.departmentId) : null;
    const { items, total } = await this.repo.page(
      {
        state: query.state,
        subscriptionId: query.subscriptionId,
        late: query.late,
        subscriptionIds: owned ?? undefined,
      },
      (query.page - 1) * query.pageSize,
      query.pageSize,
    );
    const periods = await this.periodsOf(items.map((item) => item.subscriptionId));
    // Read once for the page, and only when some case waits to be confirmed.
    const heads = items.some((item) => item.state === 'PROPOSED')
      ? await this.parties.ownerHeadsOf(
          [...periods.values()].map((period) => period.ownerDepartmentId),
          today,
        )
      : new Map<string, string>();

    return pageOf(
      items.flatMap((item) => {
        const period = periods.get(item.subscriptionId);

        return period
          ? [
              toRenewalSummary(
                item,
                period,
                renewalWaitingReason(item.state, heads.get(period.ownerDepartmentId) ?? null),
              ),
            ]
          : [];
      }),
      total,
      query.page,
      query.pageSize,
    );
  }

  /** Throws RenewalError (`READ_FORBIDDEN`, `NOT_FOUND`). */
  async get(actor: AuthenticatedPrincipal, id: string): Promise<RenewalDetailWire> {
    const scope = await this.scopeOf(actor, await this.organizationReads.businessToday());
    const record = await this.repo.find(id);
    if (!record) throw new RenewalError('NOT_FOUND');
    const period = (await this.periodsOf([record.subscriptionId])).get(record.subscriptionId);
    if (!period || !this.inScope(scope, period)) throw new RenewalError('NOT_FOUND');

    return this.detailOf(record, actor);
  }

  /** The page of a case just written, read as its route answers it to the caller; the IT Admin does not read the money snapshot. */
  async detailOf(record: RenewalRecord, actor: AuthenticatedPrincipal): Promise<RenewalDetailWire> {
    const period = (await this.periodsOf([record.subscriptionId])).get(record.subscriptionId);
    if (!period) throw new RenewalError('NOT_FOUND');
    const today = await this.organizationReads.businessToday();
    const seats = await this.ranking.seatsOf(record.subscriptionId, today);

    return toRenewalDetail(record, {
      period,
      seatsInUse: seats.held.length,
      usageAvailable: seats.usageAvailable,
      released: await this.repo.releasedOf(record.id),
      savings: await this.savingsOf(record),
      waitingReason: renewalWaitingReason(
        record.state,
        record.state === 'PROPOSED' ? await this.parties.ownerHeadOf(period.ownerDepartmentId, today) : null,
      ),
      showSnapshot: !actor.roles.includes('IT_ADMIN'),
    });
  }

  /**
   * The personal seats in use of the period of the case, in the order a reduction is chosen from (`QĐ-66x`), a page at a time, with
   * those the IT Admin proposed to take back marked (and only those with `proposedOnly`). Read by the IT Admin and by the head of the
   * owner department, not by Finance. Throws RenewalError (`READ_FORBIDDEN`, `NOT_FOUND`).
   */
  async seatRanking(
    actor: AuthenticatedPrincipal,
    id: string,
    query: PageQuery & { proposedOnly?: boolean },
  ): Promise<Page<RankedSeatWire> & { usage: { status: 'AVAILABLE' | 'NOT_AVAILABLE' }; seatsInUse: number }> {
    const today = await this.organizationReads.businessToday();
    const scope = await this.scopeOf(actor, today);
    if (scope.kind === 'ALL' && !scope.itAdmin) throw new RenewalError('READ_FORBIDDEN');
    const record = await this.repo.find(id);
    if (!record) throw new RenewalError('NOT_FOUND');
    const period = (await this.periodsOf([record.subscriptionId])).get(record.subscriptionId);
    if (!period || !this.inScope(scope, period)) throw new RenewalError('NOT_FOUND');
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

  /** The events of milestones passed with no decision, newest first: the incidents counted by `KPI-4` and the marks of an end. */
  async deadlineEvents(
    query: PageQuery & { kind?: DeadlineOutcome; from?: string; to?: string },
  ): Promise<Page<DeadlineEventWire>> {
    const { items, total } = await this.repo.pageDeadlineEvents(
      { kind: query.kind, from: query.from, to: query.to },
      (query.page - 1) * query.pageSize,
      query.pageSize,
    );
    const periods = await this.periodsOf(items.map((item) => item.subscriptionId));

    return pageOf(
      items.flatMap((item) => {
        const period = periods.get(item.subscriptionId);

        return period ? [toDeadlineEvent(item, period)] : [];
      }),
      total,
      query.page,
      query.pageSize,
    );
  }

  private async scopeOf(actor: AuthenticatedPrincipal, today: BusinessDate): Promise<RenewalReadScope> {
    const scope = await this.parties.readScopeOf(actor, today);
    if (!scope) throw new RenewalError('READ_FORBIDDEN');

    return scope;
  }

  /** A case of another department is as good as absent to the head who asks for it. */
  private inScope(scope: RenewalReadScope, period: RenewalPeriodFacts): boolean {
    return scope.kind === 'ALL' || scope.departmentId === period.ownerDepartmentId;
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
