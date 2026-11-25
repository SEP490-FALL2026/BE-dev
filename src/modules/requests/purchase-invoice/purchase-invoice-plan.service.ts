import { Injectable } from '@nestjs/common';
import { businessDateAt, type BusinessDate } from '../../../core/business-date';
import { MoneyOutOfRangeError } from '../../../core/money/money.errors';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { BudgetsApi } from '../../budgets/public/budgets.api';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { SubscriptionPeriodApi } from '../../catalog/public/subscription-period.api';
import { FinanceApi } from '../../finance/public/finance.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { LicensingOpenGrantsApi } from '../../licensing/public/licensing-open-grants.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import {
  firstOfMonth,
  flagsOfPurchaseInvoice,
  labelOfPurchaseInvoice,
  expenseYearOf,
} from './labels/purchase-invoice-labels.policy';
import {
  expectedPoolAmountOf,
  type PoolInvoiceExpectationSource,
} from './pool-expectation/purchase-invoice-pool-expectation.policy';
import { bearsByHolder, chargedCostCenterOf, holderDayOf } from './purchase-invoice-charge.policy';
import { PurchaseInvoiceRefusedError } from './purchase-invoice.errors';
import { matchPurchaseInvoice, pooledInvoiceCeilingMinor, type OriginalPrice } from './purchase-invoice-match.policy';
import { PurchaseInvoiceRepo, type RequestPurchaseFacts } from './purchase-invoice.repo';
import type { PurchaseInvoiceFormInput } from './purchase-invoice.dto';
import type { PurchaseInvoiceLink, PurchaseInvoiceMoney, PurchaseInvoicePlan } from './purchase-invoice.types';

/**
 * The states of a request whose purchase has been approved to be spent (the spend decision is behind it): it waits for the IT Admin, who buys
 * before the grant, is carrying it out, or has completed it. The money may go out and the invoice come.
 */
const PURCHASABLE_STATES: ReadonlySet<string> = new Set(['AWAITING_EXECUTION', 'EXECUTING', 'COMPLETED']);

/**
 * The states of a request whose grant failed after the IT Admin bought (`QĐ-104k`(4), `QĐ-103r`): the money is already out, so the invoice still
 * comes. The commitment was let go and nobody holds the right, so the department of the user bears it as an expense with no commitment.
 */
const FAILED_AFTER_PURCHASE_STATES: ReadonlySet<string> = new Set(['FAILED', 'AWAITING_IT_CLOSE']);

const pricingOf = (facts: {
  monthlyPriceMinor: bigint | null;
  cycleMonths: number | null;
  renewalDate: BusinessDate | null;
}): SeatPricing => ({
  monthlyMinor: facts.monthlyPriceMinor,
  cycleMonths: facts.cycleMonths,
  renewalDate: facts.renewalDate,
});

/** The cost follows the person who holds the right: a `K1` whose grant did not fail (nobody holds a right that failed). */
const heldByPerson = (state: string, provisioningType: string | undefined): boolean =>
  !FAILED_AFTER_PURCHASE_STATES.has(state) && bearsByHolder(provisioningType);

const takesInvoice = (state: string): boolean =>
  PURCHASABLE_STATES.has(state) || FAILED_AFTER_PURCHASE_STATES.has(state);

/** What a seat of a subscription costs a month and when it renews: the mark of an invoice of a subscription or of the pool is read against it. */
interface SeatPricing {
  monthlyMinor: bigint | null;
  cycleMonths: number | null;
  renewalDate: BusinessDate | null;
}

/** What the link says of what was approved or bought, before the invoice is read against it. */
interface LinkFacts {
  organizationId: string;
  link: PurchaseInvoiceLink;
  vendorId: string;
  continuation: boolean;
  /** The first day of the month the right began; null for a subscription. */
  startMonth: BusinessDate | null;
  termMonths: number | null;
  expectedQuantity: number | null;
  expectedUnitPrice: OriginalPrice | null;
  requestCostCenterId: string | null;
  requestId: string | null;
  /** The right is a person's own (`K1`): the department that bears it is the holder's. A `K4` key is the request's (`QĐ-103k`). */
  holderBound: boolean;
  /**
   * The department of the user when the invoice is of a `K1` the IT Admin bought and whose grant then failed: the invoice is a line of the Cost Center not
   * allocated, not an expense of that department (`QĐ-104k`(4)). Null for any other request.
   */
  failedGrantDepartmentId: string | null;
  /**
   * The subscription of the shared pool the invoice is a line of, for a request of a `K2` plan (`QĐ-104c`(3), `QĐ-103k`): every invoice of a `K2`
   * pool goes to the pool, whatever it is linked to, and a department bears only the seat-months of the seats it holds. Null for any other kind.
   */
  poolSubscriptionId: string | null;
  /** The price and the renewal day of the subscription the invoice is a line of (the one it names, or the pool of a `K2` request); null for a request of another kind. */
  seatPricing: SeatPricing | null;
  /** Pool expectation inputs for a K2 invoice (subscription period or pool top-up); null for K1/K4. */
  poolSource: PoolInvoiceExpectationSource | null;
  renewedAssignmentId: string | null;
}

/** Facts needed by confirmation to evaluate expected pool amount and variance month in the organization time zone. */
export type PoolExpectationFacts =
  | {
      isK2: true;
      poolSubscriptionId: string | null;
      timeZone: string;
      source: PoolInvoiceExpectationSource;
    }
  | { isK2: false };

/**
 * Reads a purchase invoice against the request or subscription it names (`PI-1`): who may name it (the IT Admin works the departments they are in
 * charge of, `D8`), the label and period of the invoice (`QĐ-111w`), whether it matches what was approved or bought (`R-44`), the department that
 * bears the month it pays for (`R-51`) and the commitment it goes into. It decides nothing about money: the marks it lays on never refuse the
 * invoice. A preview and a submission both go through here, so what the IT Admin was told is what is kept.
 */
@Injectable()
export class PurchaseInvoicePlanService {
  constructor(
    private readonly invoices: PurchaseInvoiceRepo,
    private readonly catalog: CatalogApi,
    private readonly periods: SubscriptionPeriodApi,
    private readonly budgets: BudgetsApi,
    private readonly grants: LicensingOpenGrantsApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
    private readonly finance: FinanceApi,
  ) {}

  /** Throws PurchaseInvoiceRefusedError and the money errors of `core/money`. */
  async plan(actor: AuthenticatedPrincipal, form: PurchaseInvoiceFormInput, tx?: DbTx): Promise<PurchaseInvoicePlan> {
    const facts = await this.factsOf(actor, form, tx);
    return this.read(facts, form, await this.moneyOf(form, tx), tx);
  }

  /** Throws PurchaseInvoiceRefusedError('LINK_NOT_FOUND' | 'REQUEST_NOT_PURCHASABLE' | 'NO_VENDOR'). */
  private async factsOf(actor: AuthenticatedPrincipal, form: PurchaseInvoiceFormInput, tx?: DbTx): Promise<LinkFacts> {
    const scope = await this.organizationReads.getItAdminActingScope(
      actor.employeeId,
      (ids) => this.identity.findUsableItAdminEmployeeIds(ids, tx),
      tx,
    );
    const serviceMonth = `${form.servicePeriodMonth}-01`;

    return form.link.requestId !== undefined
      ? this.requestFacts(form.link.requestId, form.link.provisioningTaskId ?? null, scope, serviceMonth, tx)
      : this.subscriptionFacts(form.link.subscriptionId as string, tx);
  }

  private async requestFacts(
    requestId: string,
    provisioningTaskId: string | null,
    scope: readonly string[],
    serviceMonth: BusinessDate,
    tx?: DbTx,
  ): Promise<LinkFacts> {
    const request = await this.invoices.requestFacts(requestId, tx);
    if (!request || !scope.includes(request.departmentId)) throw new PurchaseInvoiceRefusedError('LINK_NOT_FOUND');
    if (!takesInvoice(request.state) || request.planId === null) {
      throw new PurchaseInvoiceRefusedError('REQUEST_NOT_PURCHASABLE', 'STATE');
    }
    const vendorId = await this.catalog.getPlanVendorId(request.planId, tx);
    if (vendorId === null) throw new PurchaseInvoiceRefusedError('NO_VENDOR');
    const [target] = await this.catalog.findPlanSeatTargets([request.planId], tx);
    const pool = await this.poolOf(target?.provisioningType, request.planId, tx);

    return {
      organizationId: request.organizationId,
      link: { kind: 'REQUEST', requestId, provisioningTaskId },
      vendorId,
      continuation: request.type === 'RENEWAL',
      startMonth: await this.startMonthOf(request, tx),
      termMonths: request.termMonths,
      expectedQuantity: request.beneficiaryCount,
      expectedUnitPrice: await this.catalog.getPlanOriginalPrice(request.planId, tx, serviceMonth),
      requestCostCenterId: request.costCenterId,
      requestId,
      holderBound: heldByPerson(request.state, target?.provisioningType),
      failedGrantDepartmentId:
        FAILED_AFTER_PURCHASE_STATES.has(request.state) && target?.provisioningType === 'K1'
          ? request.departmentId
          : null,
      poolSubscriptionId: pool.id,
      seatPricing: pool.pricing,
      poolSource: pool.poolSource,
      renewedAssignmentId: request.renewedAssignmentId,
    };
  }

  /** The pool a `K2` request's invoice is a line of, with its price and renewal day; none for any other kind of plan. */
  private async poolOf(
    provisioningType: string | undefined,
    planId: string,
    tx?: DbTx,
  ): Promise<{ id: string | null; pricing: SeatPricing | null; poolSource: PoolInvoiceExpectationSource | null }> {
    if (provisioningType !== 'K2') return { id: null, pricing: null, poolSource: null };
    const id = await this.poolSubscriptionOfPlan(planId, tx);
    const [facts] = await this.periods.getPurchaseFacts([id], tx);

    return {
      id,
      pricing: facts ? pricingOf(facts) : null,
      poolSource: {
        kind: 'REQUEST_TOP_UP',
        billingCycle: facts?.billingCycle ?? null,
        monthlyPriceMinor: facts?.monthlyPriceMinor ?? null,
        renewalDate: facts?.renewalDate ?? null,
        endDate: facts?.endDate ?? null,
        purchaseDates: null,
      },
    };
  }

  /**
   * The subscription of the pool a `K2` request's invoice is booked to: the one a grant takes first (`QĐ-104k`(3): one pool for each plan).
   * Throws PurchaseInvoiceRefusedError('NO_PLACE') when the plan has none that can be taken from today, since there is no pool line to book to.
   */
  private async poolSubscriptionOfPlan(planId: string, tx?: DbTx): Promise<string> {
    const today = await this.organizationReads.businessToday(new Date(), tx);
    const [pool] = await this.catalog.getGrantableSubscriptions(planId, today, tx);
    if (!pool) throw new PurchaseInvoiceRefusedError('NO_PLACE');

    return pool.subscriptionId;
  }

  /**
   * The subscription of the pool a request's invoice is a line of when Finance signs it: that of a `K2` plan, null for any other kind (booked to the
   * commitment or the Cost Center that bears it). Throws PurchaseInvoiceRefusedError('NO_PLACE') for a `K2` plan with no pool to book to.
   */
  async poolSubscriptionOfRequest(requestId: string, tx?: DbTx): Promise<string | null> {
    const request = await this.invoices.requestFacts(requestId, tx);
    if (!request || request.planId === null) return null;
    const [target] = await this.catalog.findPlanSeatTargets([request.planId], tx);

    return target?.provisioningType === 'K2' ? this.poolSubscriptionOfPlan(request.planId, tx) : null;
  }

  /**
   * The invoice of a subscription comes from any IT Admin (`QĐ-111u`: every purchase has one, `QĐ-58b`: another IT Admin works in the place of
   * the one who answers): a subscription has no owning department, so the route's role is its whole scope.
   */
  private async subscriptionFacts(subscriptionId: string, tx?: DbTx): Promise<LinkFacts> {
    const [period] = await this.periods.getPurchaseFacts([subscriptionId], tx);
    if (!period) {
      throw new PurchaseInvoiceRefusedError('LINK_NOT_FOUND');
    }
    const vendorId = await this.catalog.getPlanVendorId(period.planId, tx);
    if (vendorId === null) throw new PurchaseInvoiceRefusedError('NO_VENDOR');
    const organization = await this.organizationReads.getOrganization(tx);

    return {
      organizationId: (organization as { id: string }).id,
      link: { kind: 'SUBSCRIPTION', subscriptionId },
      vendorId,
      continuation: false,
      startMonth: null,
      termMonths: null,
      expectedQuantity: period.purchasedQuantity,
      expectedUnitPrice: await this.catalog.getSubscriptionOriginalPrice(subscriptionId, tx),
      requestCostCenterId: null,
      failedGrantDepartmentId: null,
      requestId: null,
      holderBound: false,
      poolSubscriptionId: null,
      seatPricing: pricingOf(period),
      poolSource:
        period.provisioningType === 'K2'
          ? {
              kind: 'SUBSCRIPTION',
              billingCycle: period.billingCycle,
              purchasedQuantity: period.purchasedQuantity,
              monthlyPriceMinor: period.monthlyPriceMinor,
            }
          : null,
      renewedAssignmentId: null,
    };
  }

  /** Reads K2 pool expectation inputs for a submitted invoice being confirmed. */
  async poolExpectationFactsOf(
    link: { linkKind: 'REQUEST' | 'SUBSCRIPTION'; requestId: string | null; subscriptionId: string | null },
    tx?: DbTx,
  ): Promise<PoolExpectationFacts> {
    if (link.linkKind === 'SUBSCRIPTION') {
      return link.subscriptionId === null ? { isK2: false } : this.subscriptionPoolExpectation(link.subscriptionId, tx);
    }

    return link.requestId === null ? { isK2: false } : this.requestPoolExpectation(link.requestId, tx);
  }

  private async subscriptionPoolExpectation(subscriptionId: string, tx?: DbTx): Promise<PoolExpectationFacts> {
    const [period] = await this.periods.getPurchaseFacts([subscriptionId], tx);
    if (!period || period.provisioningType !== 'K2') return { isK2: false };
    const timeZone = ((await this.organizationReads.getOrganization(tx)) as { timeZone: string }).timeZone;

    return {
      isK2: true,
      poolSubscriptionId: subscriptionId,
      timeZone,
      source: {
        kind: 'SUBSCRIPTION',
        billingCycle: period.billingCycle,
        purchasedQuantity: period.purchasedQuantity,
        monthlyPriceMinor: period.monthlyPriceMinor,
      },
    };
  }

  private async requestPoolExpectation(requestId: string, tx?: DbTx): Promise<PoolExpectationFacts> {
    const request = await this.invoices.requestFacts(requestId, tx);
    if (!request || request.planId === null) return { isK2: false };
    const [target] = await this.catalog.findPlanSeatTargets([request.planId], tx);
    if (target?.provisioningType !== 'K2') return { isK2: false };
    const poolSubscriptionId = await this.poolSubscriptionOfPlan(request.planId, tx);
    const [period] = await this.periods.getPurchaseFacts([poolSubscriptionId], tx);
    const timeZone = ((await this.organizationReads.getOrganization(tx)) as { timeZone: string }).timeZone;
    const purchaseDates = await this.topUpPurchaseDatesOf(requestId, timeZone, tx);

    return {
      isK2: true,
      poolSubscriptionId,
      timeZone,
      source: this.topUpSource(period, purchaseDates),
    };
  }

  private topUpSource(
    period: Awaited<ReturnType<SubscriptionPeriodApi['getPurchaseFacts']>>[number] | undefined,
    purchaseDates: BusinessDate[] | null,
  ): Extract<PoolExpectationFacts, { isK2: true }>['source'] {
    if (!period) {
      return {
        kind: 'REQUEST_TOP_UP',
        billingCycle: null,
        monthlyPriceMinor: null,
        renewalDate: null,
        endDate: null,
        purchaseDates,
      };
    }

    return {
      kind: 'REQUEST_TOP_UP',
      billingCycle: period.billingCycle,
      monthlyPriceMinor: period.monthlyPriceMinor,
      renewalDate: period.renewalDate,
      endDate: period.endDate,
      purchaseDates,
    };
  }

  private async topUpPurchaseDatesOf(requestId: string, timeZone: string, tx?: DbTx): Promise<BusinessDate[] | null> {
    const tasks = await this.grants.listCompletedPoolTopUpPurchasesOfRequest(requestId, tx);
    if (tasks.length === 0 || tasks.some((task) => task.purchasedAt === null)) return null;

    return tasks.map((task) => businessDateAt(task.purchasedAt as Date, timeZone));
  }

  /** The month the right began: the month of the grant, and for a request not granted yet the month of its first invoice. */
  private async startMonthOf(request: RequestPurchaseFacts, tx?: DbTx): Promise<BusinessDate | null> {
    if (request.grantCompletedAt === null) return null;
    const organization = await this.organizationReads.getOrganization(tx);

    return firstOfMonth(businessDateAt(request.grantCompletedAt, (organization as { timeZone: string }).timeZone));
  }

  /**
   * What the invoice says in money, in minor units: the dong taken out and the price of one in the currency it states. The net amount and the price
   * of one are more than nothing and a tax is not less than nothing, as the table keeps them; one that is not is out of range, like every money
   * field below zero. Throws the money errors of `core/money`.
   */
  async moneyOf(form: PurchaseInvoiceFormInput, tx?: DbTx): Promise<PurchaseInvoiceMoney> {
    const dong = async (
      input: { amount: string } | undefined,
      path: string,
      floor: 'POSITIVE' | 'NON_NEGATIVE',
    ): Promise<bigint> => {
      if (!input) return 0n;
      const { amountMinor } = await this.finance.parseMoney({ amount: input.amount, currency: 'VND' }, path, tx);
      if (floor === 'POSITIVE' ? amountMinor <= 0n : amountMinor < 0n) throw new MoneyOutOfRangeError(path);

      return amountMinor;
    };
    const original = await this.finance.parseMoney(form.unitPriceOriginal, 'unitPriceOriginal', tx);
    if (original.amountMinor <= 0n) throw new MoneyOutOfRangeError('unitPriceOriginal');

    return {
      netMinor: await dong(form.netAmount, 'netAmount', 'POSITIVE'),
      deductibleTaxMinor: await dong(form.deductibleTax, 'deductibleTax', 'NON_NEGATIVE'),
      nonDeductibleTaxMinor: await dong(form.nonDeductibleTax, 'nonDeductibleTax', 'NON_NEGATIVE'),
      unitPriceOriginal: original,
    };
  }

  private async read(
    facts: LinkFacts,
    form: PurchaseInvoiceFormInput,
    money: PurchaseInvoiceMoney,
    tx?: DbTx,
  ): Promise<PurchaseInvoicePlan> {
    const serviceMonth = `${form.servicePeriodMonth}-01`;
    const earlier = await this.invoices.earlierOf(
      facts.link.kind === 'REQUEST'
        ? { requestId: facts.link.requestId }
        : { subscriptionId: facts.link.subscriptionId },
      tx,
    );
    const period = labelOfPurchaseInvoice({
      link: facts.link.kind,
      continuation: facts.continuation,
      hasEarlierInvoice: earlier.count > 0,
      serviceMonth,
      startMonth: facts.startMonth ?? earlier.earliestServiceMonth ?? serviceMonth,
      termMonths: facts.termMonths,
    });
    const match = matchPurchaseInvoice({
      quantity: form.quantity,
      unitPriceOriginal: money.unitPriceOriginal,
      expectedQuantity: facts.expectedQuantity,
      expectedUnitPrice: facts.expectedUnitPrice,
    });
    // An invoice of a K2 pool is a line of the pool, whatever it is linked to: no Cost Center bears it and no commitment is taken down by it (`QĐ-104c`(3)).
    const pooled = facts.poolSubscriptionId !== null;
    // An invoice of a `K1` whose grant failed after the purchase is a line of the Cost Center not allocated: no Cost Center bears it, no commitment takes it (`QĐ-104k`(4)).
    const unallocated =
      facts.failedGrantDepartmentId === null
        ? null
        : ({ reason: 'K1_GRANT_FAILED', departmentId: facts.failedGrantDepartmentId } as const);
    const placed = pooled || unallocated !== null;
    const chargedCostCenterId = placed ? null : await this.chargedCostCenterOf(facts, serviceMonth, tx);
    const commitment = placed ? null : await this.commitmentOf(facts, chargedCostCenterId, serviceMonth, tx);
    const noExpectedAmount = await this.isPoolExpectedMissing(facts, tx);

    return {
      organizationId: facts.organizationId,
      link: facts.link,
      vendorId: facts.vendorId,
      serviceMonth,
      period,
      match,
      expected: { quantity: facts.expectedQuantity, unitPrice: facts.expectedUnitPrice },
      chargedCostCenterId,
      commitment,
      unallocated,
      flags: flagsOfPurchaseInvoice({
        outsideTerm: period.outsideTerm,
        overApproved: this.overApproved(facts, serviceMonth, money, commitment),
        noExpectedAmount,
      }),
    };
  }

  private async isPoolExpectedMissing(facts: LinkFacts, tx?: DbTx): Promise<boolean> {
    if (facts.poolSource === null) return false;
    if (facts.poolSource.kind === 'SUBSCRIPTION') {
      return expectedPoolAmountOf(facts.poolSource) === null;
    }
    if (facts.requestId === null) return true;
    const timeZone = ((await this.organizationReads.getOrganization(tx)) as { timeZone: string }).timeZone;
    const purchaseDates = await this.topUpPurchaseDatesOf(facts.requestId, timeZone, tx);

    return expectedPoolAmountOf({ ...facts.poolSource, purchaseDates }) === null;
  }

  /**
   * An invoice of a request goes over what the commitment still holds; an invoice that is a line of a subscription or of the pool goes over the seats
   * bought times the price of a month times the months to the renewal day (`QĐ-103w`(3), `QĐ-104c`(3), `QĐ-104d`). What nobody knows is not judged.
   */
  private overApproved(
    facts: LinkFacts,
    serviceMonth: BusinessDate,
    money: PurchaseInvoiceMoney,
    commitment: { remainingMinor: bigint } | null,
  ): boolean {
    if (commitment !== null) return money.netMinor > commitment.remainingMinor;
    if (facts.seatPricing === null) return false;
    const ceiling = pooledInvoiceCeilingMinor({
      quantity: facts.expectedQuantity,
      monthlyMinor: facts.seatPricing.monthlyMinor,
      cycleMonths: facts.seatPricing.cycleMonths,
      serviceMonth,
      renewalDate: facts.seatPricing.renewalDate,
    });

    return ceiling !== null && money.netMinor > ceiling;
  }

  /** The department that held the right in the month the invoice pays for bears it (`R-51`); the request's own Cost Center for what is not a person's. */
  private async chargedCostCenterOf(facts: LinkFacts, serviceMonth: BusinessDate, tx?: DbTx): Promise<string | null> {
    if (facts.link.kind === 'SUBSCRIPTION') return null;
    let holderCostCenterIds: (string | null)[] = [];
    if (facts.holderBound && facts.requestId !== null) {
      const day = holderDayOf(serviceMonth, await this.organizationReads.businessToday(new Date(), tx));
      const seats = await this.grants.listHeldSeatsOfRequests(
        {
          grantRequestIds: facts.renewedAssignmentId === null ? [facts.requestId] : [],
          namedRoots:
            facts.renewedAssignmentId === null
              ? []
              : [{ requestId: facts.requestId, assignmentId: facts.renewedAssignmentId }],
        },
        day,
        tx,
      );
      const units = await this.organizationReads.getOwningUnits(
        seats.map((seat) => seat.employeeId),
        day,
        tx,
      );
      holderCostCenterIds = seats.map((seat) => units.get(seat.employeeId)?.costCenter?.id ?? null);
    }

    return chargedCostCenterOf({ holderCostCenterIds, requestCostCenterId: facts.requestCostCenterId });
  }

  private async commitmentOf(
    facts: LinkFacts,
    chargedCostCenterId: string | null,
    serviceMonth: BusinessDate,
    tx?: DbTx,
  ): Promise<{ id: string; remainingMinor: bigint } | null> {
    if (facts.requestId === null) return null;
    const year = expenseYearOf(serviceMonth);
    const found = (await this.budgets.commitmentsOfRequest(facts.requestId, tx)).find(
      (commitment) =>
        commitment.year === year &&
        commitment.state !== 'RELEASED' &&
        (chargedCostCenterId === null || commitment.costCenterId === chargedCostCenterId),
    );

    return found ? { id: found.id, remainingMinor: found.remainingMinor } : null;
  }
}
