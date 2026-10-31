import { Injectable } from '@nestjs/common';
import { pageOf, type Page } from '../../../core/application/pagination';
import { formatAmount } from '../../../core/money/money';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { SubscriptionPeriodApi } from '../../catalog/public/subscription-period.api';
import type { RenewalPeriodFacts } from '../../catalog/public/subscription-period.types';
import { FinanceApi } from '../../finance/public/finance.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import type {
  DeadlineEventWire,
  RankedSeatWire,
  RenewalDetailWire,
  RenewalSummaryWire,
} from './subscription-renewal.dto';
import { RenewalError } from './subscription-renewal.errors';
import { toDeadlineEvent, toRenewalDetail, toRenewalSummary } from './subscription-renewal.mapper';
import { RenewalPartiesService } from './subscription-renewal-parties.service';
import { RenewalRankingService } from './subscription-renewal-ranking.service';
import { SubscriptionRenewalRepo } from './subscription-renewal.repo';
import type { DeadlineOutcome, RenewalRecord, RenewalState } from './subscription-renewal.types';

type PageQuery = { page: number; pageSize: number };

/**
 * The reads of the renewals (`US-11-02`, `US-11-05`): the queue of the cases and their pages, the ranked seats a reduction is
 * chosen from, and the events of milestones passed with no decision. Only the IT Admin, Finance, the decider and the substitute
 * read them; a head of department and an employee never do (`SoD-2`). A fixed number of statements per page.
 */
@Injectable()
export class RenewalViewService {
  constructor(
    private readonly repo: SubscriptionRenewalRepo,
    private readonly periods: SubscriptionPeriodApi,
    private readonly parties: RenewalPartiesService,
    private readonly ranking: RenewalRankingService,
    private readonly organization: OrganizationApi,
    private readonly finance: FinanceApi,
  ) {}

  /** Throws RenewalError (`READ_FORBIDDEN`). */
  async list(
    actor: AuthenticatedPrincipal,
    query: PageQuery & { state?: RenewalState; subscriptionId?: string; late?: boolean },
  ): Promise<Page<RenewalSummaryWire>> {
    await this.assertReader(actor);
    const { items, total } = await this.repo.page(
      { state: query.state, subscriptionId: query.subscriptionId, late: query.late },
      (query.page - 1) * query.pageSize,
      query.pageSize,
    );
    const periods = await this.periodsOf(items.map((item) => item.subscriptionId));

    return pageOf(
      items.flatMap((item) => {
        const period = periods.get(item.subscriptionId);

        return period ? [toRenewalSummary(item, period)] : [];
      }),
      total,
      query.page,
      query.pageSize,
    );
  }

  /** Throws RenewalError (`READ_FORBIDDEN`, `NOT_FOUND`). */
  async get(actor: AuthenticatedPrincipal, id: string): Promise<RenewalDetailWire> {
    await this.assertReader(actor);
    const record = await this.repo.find(id);
    if (!record) throw new RenewalError('NOT_FOUND');

    return this.detailOf(record);
  }

  /** The page of a case just written, read as its route answers it. */
  async detailOf(record: RenewalRecord): Promise<RenewalDetailWire> {
    const period = (await this.periodsOf([record.subscriptionId])).get(record.subscriptionId);
    if (!period) throw new RenewalError('NOT_FOUND');
    const today = await this.organization.businessToday();
    const seats = await this.ranking.seatsOf(record.subscriptionId, today);

    return toRenewalDetail(record, {
      period,
      seatsInUse: seats.held.length,
      usageAvailable: seats.usageAvailable,
      released: await this.repo.releasedOf(record.id),
      savings: await this.savingsOf(record),
    });
  }

  /**
   * The personal seats in use of the period of the case, in the order a reduction is chosen from (`QĐ-66x`), a page at a time.
   * Throws RenewalError (`READ_FORBIDDEN`, `NOT_FOUND`).
   */
  async seatRanking(
    actor: AuthenticatedPrincipal,
    id: string,
    query: PageQuery,
  ): Promise<Page<RankedSeatWire> & { usage: { status: 'AVAILABLE' | 'NOT_AVAILABLE' }; seatsInUse: number }> {
    await this.assertReader(actor);
    const record = await this.repo.find(id);
    if (!record) throw new RenewalError('NOT_FOUND');
    const seats = await this.ranking.seatsOf(record.subscriptionId, await this.organization.businessToday());
    const slice = seats.ranked.slice((query.page - 1) * query.pageSize, query.page * query.pageSize);
    const people = new Map(
      (await this.organization.getEmployees(slice.map((seat) => seat.employeeId))).map((person) => [person.id, person]),
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
            },
          ]
        : [];
    });

    return {
      ...pageOf(items, seats.ranked.length, query.page, query.pageSize),
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

  private async assertReader(actor: AuthenticatedPrincipal): Promise<void> {
    if (!(await this.parties.canRead(actor))) throw new RenewalError('READ_FORBIDDEN');
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
