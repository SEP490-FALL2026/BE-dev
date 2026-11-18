import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { AccessRequestRecord, PricingRecord } from '../access-request/access-request.types';
import { PricingViewService, type CostTerm, type CostView } from './pricing-view.service';

const CYCLE_MONTHS: Readonly<Record<'MONTHLY' | 'QUARTERLY' | 'ANNUAL', bigint>> = {
  MONTHLY: 1n,
  QUARTERLY: 3n,
  ANNUAL: 12n,
};

const ceilDiv = (numerator: bigint, denominator: bigint): bigint => (numerator + denominator - 1n) / denominator;

/**
 * The months an amount of the year after stands for, at a price by a billing cycle: the fewest whose price, rounded up as it was worked out, is
 * that amount.
 */
function monthsOfAmount(amountMinor: bigint, unitMinor: bigint, cycle: bigint): number {
  if (unitMinor <= 0n) return 0;
  let months = (amountMinor * cycle) / unitMinor;
  while (ceilDiv(unitMinor * months, cycle) < amountMinor) months += 1n;
  while (months > 0n && ceilDiv(unitMinor * (months - 1n), cycle) >= amountMinor) months -= 1n;

  return Number(months);
}

/** The months of the year after that the amount kept stands for: none without an amount; null when the price is not one that can be counted. */
function nextMonthsOf(pricing: PricingRecord): number | null {
  if (pricing.nextYearAmount === null) return 0;
  const { billingCycle, unitPrice } = pricing;
  if (unitPrice === null || billingCycle === null || billingCycle === 'OTHER') return null;

  return monthsOfAmount(pricing.nextYearAmount.amountMinor, unitPrice.amountMinor, CYCLE_MONTHS[billingCycle]);
}

/**
 * What a request that was sent costs by the year, for the readers of its detail and of its spend step (`QĐ-111j`, `QĐ-111k`, R-38, R-39). Every
 * number is read from what the request keeps (the months and the amounts of the day it was last worked out), never from the day it is looked at:
 * the months of the year after are what its amount stands for, the months that have begun are those with the months of this year, and the term was
 * cut at the contract of the person when fewer months have begun than were asked. A request for a group, whose people have each their own months,
 * and a request of an older release that carries an end date, show the amounts and no months.
 */
@Injectable()
export class RequestCostViewService {
  constructor(
    private readonly organizationReads: OrganizationReadApi,
    private readonly pricing: PricingViewService,
  ) {}

  async of(
    request: Pick<AccessRequestRecord, 'type' | 'termMonths' | 'expectedEndDate' | 'beneficiaryEmployeeIds'>,
    pricing: PricingRecord,
    tx?: DbTx,
  ): Promise<CostView | null> {
    if (pricing.status !== 'PRICED' || pricing.kind !== 'RECURRING') return this.pricing.costView(pricing, null);
    const none = { currentMonths: null, nextMonths: null, startedMonths: null, cutAt: null };
    if (request.type === 'GROUP_GRANT') return this.pricing.costView(pricing, none);
    if (request.expectedEndDate !== null) {
      return this.pricing.costView(pricing, { ...none, currentMonths: pricing.amountMonths });
    }

    return this.pricing.costView(pricing, await this.termOf(request, pricing, tx));
  }

  /** The months of one person's request from what it keeps; a right with no end has twelve months of the year after and no count of the term. */
  private async termOf(
    request: Pick<AccessRequestRecord, 'termMonths' | 'beneficiaryEmployeeIds'>,
    pricing: PricingRecord,
    tx?: DbTx,
  ): Promise<CostTerm> {
    const currentMonths = pricing.amountMonths;
    if (request.termMonths === null) {
      return {
        currentMonths,
        nextMonths: pricing.nextYearAmount === null ? null : 12,
        startedMonths: null,
        cutAt: null,
      };
    }
    const nextMonths = nextMonthsOf(pricing);
    const startedMonths = nextMonths === null || currentMonths === null ? null : currentMonths + nextMonths;
    const cut = startedMonths !== null && startedMonths < request.termMonths;

    return {
      currentMonths,
      nextMonths,
      startedMonths,
      cutAt: cut ? await this.contractEndOf(request.beneficiaryEmployeeIds[0], tx) : null,
    };
  }

  private async contractEndOf(employeeId: string | undefined, tx?: DbTx): Promise<BusinessDate | null> {
    if (employeeId === undefined) return null;

    return (await this.organizationReads.getEmployee(employeeId, tx))?.contractEndDate ?? null;
  }
}
