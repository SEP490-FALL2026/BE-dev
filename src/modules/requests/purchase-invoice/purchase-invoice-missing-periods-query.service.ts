import { Injectable } from '@nestjs/common';
import { pageOf, type Page } from '../../../core/application/pagination';
import { businessDateAt, type BusinessDate } from '../../../core/business-date';
import { addMonths } from '../../../core/fiscal-year';
import { K1_TERM_LIMIT_MONTHS } from '../../../core/term-limit';
import { instantAtWallClock } from '../../../core/working-days';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { SubscriptionPeriodApi } from '../../catalog/public/subscription-period.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { LicensingOpenGrantsApi } from '../../licensing/public/licensing-open-grants.api';
import { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { firstOfMonth, labelOfPurchaseInvoice } from './labels/purchase-invoice-labels.policy';
import {
  coveredMonthsOf,
  invoiceDueDate,
  lacksInvoice,
  lastDayOfSeats,
  requestPaymentPeriods,
  subscriptionPaymentPeriods,
  type PaymentPeriod,
} from './purchase-invoice-missing-periods.policy';
import type { PurchaseInvoiceMissingPeriodWire } from './purchase-invoice.dto';
import { toMissingPeriod } from './purchase-invoice.mapper';
import { PurchaseInvoiceRepo, type OpenServiceMonths, type TermGrantFacts } from './purchase-invoice.repo';
import type { MissingInvoicePeriod, MissingInvoiceScope } from './purchase-invoice.types';

/** A payment of a right whose invoice has not been seen yet, before the due day says whether it is late. */
type Unpaid = Omit<MissingInvoicePeriod, 'dueDate'>;

/**
 * The periods of a right paid by the month or the year that have no invoice past the fifth working day after their payment day (`PI-2`, `QĐ-111x`,
 * `R-30`): the months of a `K1` right a request granted while a seat of it is still held, and the payments of a subscription, a department's
 * or the shared pool's, by the cycle of its plan. An invoice that was returned does not count; one that was submitted or signed does, whatever it says. The mark is
 * read, never kept, so it goes the day an invoice is submitted. Finance reads every period; an IT Admin those of the departments they work and of the shared pool, which every IT Admin works (`D8`, `PI-1c`).
 * The periods are derived from the rights that are still held, a set the grants and subscriptions bound, so they are cut into pages after the
 * count; the number of statements does not grow with them.
 */
@Injectable()
export class PurchaseInvoiceMissingPeriodsQueryService {
  constructor(
    private readonly invoices: PurchaseInvoiceRepo,
    private readonly catalog: CatalogApi,
    private readonly subscriptions: SubscriptionPeriodApi,
    private readonly grants: LicensingOpenGrantsApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
    private readonly parameters: OperatingParametersApi,
  ) {}

  /** One page of the periods without an invoice the caller may read, the oldest due day first. */
  async pageFor(
    actor: AuthenticatedPrincipal,
    query: { page: number; pageSize: number },
  ): Promise<Page<PurchaseInvoiceMissingPeriodWire>> {
    const periods = await this.missing(await this.scopeOf(actor));
    const items = await this.named(periods.slice((query.page - 1) * query.pageSize, query.page * query.pageSize));

    return pageOf(items, periods.length, query.page, query.pageSize);
  }

  /** How many periods have no invoice in the scope: the number the list answers as its total. */
  async countOf(scope: MissingInvoiceScope): Promise<number> {
    return (await this.missing(scope)).length;
  }

  private async scopeOf(actor: AuthenticatedPrincipal): Promise<MissingInvoiceScope> {
    if (actor.roles.includes('FINANCE')) return { kind: 'ALL' };

    return {
      kind: 'DEPARTMENTS',
      departmentIds: await this.organizationReads.getItAdminScope(actor.employeeId, (ids) =>
        this.identity.findUsableItAdminEmployeeIds(ids),
      ),
    };
  }

  private async missing(scope: MissingInvoiceScope): Promise<MissingInvoicePeriod[]> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) return [];
    const today = await this.organizationReads.businessToday();
    const departmentIds = scope.kind === 'ALL' ? null : scope.departmentIds;
    const running = await this.runningGrants(departmentIds, today, organization.timeZone);
    const schedules = await this.subscriptions.listPaymentSchedules(departmentIds);
    const months = await this.invoices.openServiceMonths({
      requestIds: running.map((grant) => grant.id),
      subscriptionIds: schedules.map((schedule) => schedule.subscriptionId),
    });
    const unpaid = [
      ...running.flatMap((grant) => this.unpaidOfGrant(grant, months, organization.timeZone, today)),
      ...schedules.flatMap((schedule) =>
        this.unpaidOfSubscription(schedule, months, businessDateAt(schedule.recordedAt, organization.timeZone), today),
      ),
    ];
    if (unpaid.length === 0) return [];
    const earliest = unpaid.reduce((day, row) => (row.paymentDate < day ? row.paymentDate : day), today);
    const nonWorking = await this.parameters.getNonWorkingDates(earliest, today);

    return unpaid
      .filter((row) => lacksInvoice(row.paymentDate, today, nonWorking))
      .map((row): MissingInvoicePeriod => ({ ...row, dueDate: invoiceDueDate(row.paymentDate, nonWorking) }))
      .sort(byDueDay);
  }

  /** The `K1` grants of the scope that were completed in the last months of use and whose seat is still held: the rights that are paying. */
  private async runningGrants(
    departmentIds: readonly string[] | null,
    today: BusinessDate,
    timeZone: string,
  ): Promise<Array<TermGrantFacts & { lastDay: BusinessDate | null }>> {
    const completed = await this.invoices.completedTermGrants({
      departmentIds,
      maxTermMonths: K1_TERM_LIMIT_MONTHS,
      since: instantAtWallClock({ date: addMonths(today, -K1_TERM_LIMIT_MONTHS), msOfDay: 0 }, timeZone),
    });
    if (completed.length === 0) return [];
    const targets = await this.catalog.findPlanSeatTargets([...new Set(completed.map((grant) => grant.planId))]);
    const k1Plans = new Set(
      targets.filter((target) => target.provisioningType === 'K1').map((target) => target.planId),
    );
    const k1 = completed.filter((grant) => k1Plans.has(grant.planId));
    if (k1.length === 0) return [];
    const seats = await this.grants.listHeldSeatsOfRequests(
      { grantRequestIds: k1.map((grant) => grant.id), namedRoots: [] },
      today,
    );
    const seatsOf = new Map<string, typeof seats>();
    for (const seat of seats) seatsOf.set(seat.requestId, [...(seatsOf.get(seat.requestId) ?? []), seat]);

    return k1.flatMap((grant) => {
      const held = seatsOf.get(grant.id);

      return held ? [{ ...grant, lastDay: lastDayOfSeats(held) }] : [];
    });
  }

  private unpaidOfGrant(
    grant: TermGrantFacts & { lastDay: BusinessDate | null },
    months: OpenServiceMonths,
    timeZone: string,
    today: BusinessDate,
  ): Unpaid[] {
    const grantDay = businessDateAt(grant.grantCompletedAt, timeZone);
    const invoiced = months.byRequest.get(grant.id) ?? new Set<string>();

    return requestPaymentPeriods({ grantDay, termMonths: grant.termMonths, lastDay: grant.lastDay })
      .filter((period) => period.paymentDate <= today && !isInvoiced(period, invoiced))
      .map((period) => {
        const label = labelOfPurchaseInvoice({
          link: 'REQUEST',
          continuation: false,
          hasEarlierInvoice: invoiced.size > 0,
          serviceMonth: period.serviceMonth,
          startMonth: firstOfMonth(grantDay),
          termMonths: grant.termMonths,
        });

        return {
          link: { kind: 'REQUEST', requestId: grant.id },
          planId: grant.planId,
          departmentId: grant.departmentId,
          label: label.label,
          periodIndex: label.periodIndex,
          periodCount: label.periodCount,
          serviceMonth: period.serviceMonth,
          paymentDate: period.paymentDate,
        };
      });
  }

  private unpaidOfSubscription(
    schedule: Awaited<ReturnType<SubscriptionPeriodApi['listPaymentSchedules']>>[number],
    months: OpenServiceMonths,
    knownOn: BusinessDate,
    today: BusinessDate,
  ): Unpaid[] {
    const invoiced = months.bySubscription.get(schedule.subscriptionId) ?? new Set<string>();

    return subscriptionPaymentPeriods({ ...schedule, notBefore: knownOn, until: today })
      .filter((period) => !isInvoiced(period, invoiced))
      .map((period) => ({
        link: { kind: 'SUBSCRIPTION', subscriptionId: schedule.subscriptionId },
        planId: schedule.planId,
        departmentId: schedule.ownerDepartmentId,
        label: 'RENEWAL',
        periodIndex: null,
        periodCount: null,
        serviceMonth: period.serviceMonth,
        paymentDate: period.paymentDate,
      }));
  }

  /** The names of the plan and the department of each row of the page, in one read each whatever the page. */
  private async named(rows: readonly MissingInvoicePeriod[]): Promise<PurchaseInvoiceMissingPeriodWire[]> {
    if (rows.length === 0) return [];
    const plans = new Map(
      (await this.catalog.getPlanSummariesWithLogo([...new Set(rows.map((row) => row.planId))])).map((plan) => [
        plan.planId,
        plan,
      ]),
    );
    const departmentIds = new Set(rows.flatMap((row) => (row.departmentId === null ? [] : [row.departmentId])));
    const departments = new Map(
      (departmentIds.size === 0 ? [] : await this.organizationReads.getDepartmentBriefs([...departmentIds])).map(
        (department) => [department.id, department],
      ),
    );

    return rows.map((row) => {
      const plan = plans.get(row.planId);

      return toMissingPeriod(row, {
        plan: {
          planId: row.planId,
          planName: plan?.planName ?? '',
          applicationName: plan?.applicationName ?? '',
          logoUrl: plan?.applicationLogoUrl ?? null,
        },
        department:
          row.departmentId === null
            ? null
            : { id: row.departmentId, name: departments.get(row.departmentId)?.name ?? '' },
      });
    });
  }
}

/** An invoice that was not returned names one of the months the payment pays for. */
const isInvoiced = (period: PaymentPeriod, invoiced: ReadonlySet<string>): boolean =>
  coveredMonthsOf(period).some((month) => invoiced.has(month));

const linkIdOf = (row: MissingInvoicePeriod): string =>
  row.link.kind === 'REQUEST' ? row.link.requestId : row.link.subscriptionId;

/** The oldest due day first, then the link and the month: no two periods share all three. */
const byDueDay = (a: MissingInvoicePeriod, b: MissingInvoicePeriod): number =>
  a.dueDate.localeCompare(b.dueDate) ||
  linkIdOf(a).localeCompare(linkIdOf(b)) ||
  a.serviceMonth.localeCompare(b.serviceMonth);
