import { Injectable } from '@nestjs/common';
import { fromDateColumn, businessDateAt, type BusinessDate } from '../../../core/business-date';
import { MoneyOutOfRangeError } from '../../../core/money/money.errors';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { BudgetsApi } from '../../budgets/public/budgets.api';
import { CatalogApi } from '../../catalog/public/catalog.api';
import type { LicenseLotView } from '../../catalog/public/license-lot.types';
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
import type { PoolInvoiceExpectationSource } from './pool-expectation/purchase-invoice-pool-expectation.policy';
import { PurchaseInvoicePoolService } from './pool-expectation/purchase-invoice-pool-expectation.service';
import {
  chargedCostCenterOf,
  holderDayOf,
  isOverApprovedInvoice,
  pricingOf,
  takesInvoice,
} from './purchase-invoice-charge.policy';
import { PurchaseInvoiceRefusedError } from './purchase-invoice.errors';
import { matchPurchaseInvoice } from './purchase-invoice-match.policy';
import { PurchaseInvoiceRepo, type RequestPurchaseFacts } from './purchase-invoice.repo';
import type { PurchaseInvoiceFormInput } from './purchase-invoice.dto';
import type {
  LinkFacts,
  PoolExpectationFacts,
  PurchaseInvoiceMoney,
  PurchaseInvoicePlan,
  SeatPricing,
} from './purchase-invoice.types';
import {
  collectSegmentDepartments,
  resolveK1AnnualMonthAllocations,
} from './confirmation/k1-annual-confirmation.policy';
import { assembleRequestLinkFacts } from './purchase-invoice-lot.policy';

export type { PoolExpectationFacts };

/**
 * Reads a purchase invoice against the request or subscription it names (`PI-1`), returning planning facts without mutating state.
 */
@Injectable()
export class PurchaseInvoicePlanService {
  constructor(
    private readonly invoices: PurchaseInvoiceRepo,
    private readonly catalog: CatalogApi,
    private readonly pool: PurchaseInvoicePoolService,
    private readonly budgets: BudgetsApi,
    private readonly grants: LicensingOpenGrantsApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
    private readonly finance: FinanceApi,
  ) {}

  /** Resolves license-lot allocation month & active beneficiary count when Finance confirms a lot invoice. */
  async lotConfirmationContextOf(
    row: { linkKind: string; licenseLotId: string | null; requestId: string | null },
    now: Date,
    tx: DbTx,
  ): Promise<{ licenseLotId: string; allocationMonth: BusinessDate; lotBeneficiaryCount: number } | null> {
    if (typeof this.pool.lockLot !== 'function') return null;
    const lotId = await this.resolveConfirmationLotId(row, tx);
    if (!lotId) return null;

    // F-18: lock the lot at tier 6a BEFORE reading active beneficiary count (`m`) so confirmation and group-line withdrawal serialize.
    const lot = await this.pool.lockLot(lotId, tx);
    if (!lot) return null;

    const tz = (await this.organizationReads.getOrganization(tx))?.timeZone ?? 'Asia/Ho_Chi_Minh';
    const allocationMonth = firstOfMonth(businessDateAt(now, tz));
    const lotBeneficiaryCount =
      lot.purpose === 'REQUEST' && lot.requestId !== null
        ? await this.invoices.activeBeneficiaryCount(lot.requestId, tx)
        : 0;

    return { licenseLotId: lot.id, allocationMonth, lotBeneficiaryCount };
  }

  private async resolveConfirmationLotId(
    row: { linkKind: string; licenseLotId: string | null; requestId: string | null },
    tx: DbTx,
  ): Promise<string | null> {
    if (row.linkKind === 'LICENSE_LOT' && row.licenseLotId) return row.licenseLotId;
    if (row.linkKind === 'REQUEST' && row.requestId && typeof this.pool.findLotOfRequest === 'function') {
      return (await this.pool.findLotOfRequest(row.requestId, tx))?.id ?? null;
    }

    return null;
  }

  /** Throws PurchaseInvoiceRefusedError and the money errors of `core/money`. */
  async plan(actor: AuthenticatedPrincipal, form: PurchaseInvoiceFormInput, tx?: DbTx): Promise<PurchaseInvoicePlan> {
    const facts = await this.factsOf(actor, form, tx);
    return this.read(facts, form, await this.moneyOf(form, tx), tx);
  }

  private async factsOf(actor: AuthenticatedPrincipal, form: PurchaseInvoiceFormInput, tx?: DbTx): Promise<LinkFacts> {
    const scope = await this.organizationReads.getItAdminActingScope(
      actor.employeeId,
      (ids) => this.identity.findUsableItAdminEmployeeIds(ids, tx),
      tx,
    );
    const serviceMonth = `${form.servicePeriodMonth}-01`;

    if (form.link.licenseLotId !== undefined) {
      return this.pool.buildLicenseLotLinkFacts({
        licenseLotId: form.link.licenseLotId,
        serviceMonth,
        scope,
        invoices: this.invoices,
        catalog: this.catalog,
        tx,
      });
    }

    return form.link.requestId !== undefined
      ? this.requestFacts(form.link.requestId, form.link.provisioningTaskId ?? null, scope, serviceMonth, tx)
      : this.subscriptionFacts(
          form.link.subscriptionId as string,
          serviceMonth,
          form.link.seatPurchaseId ?? null,
          form.link.subscriptionLineIds ?? [],
          tx,
        );
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
    await this.ensureNoK2SeatPurchase(requestId, target?.provisioningType, tx);
    const requestLot = await this.loadUninvoicedRequestLot(requestId, tx);
    const pool = await this.poolOf(target?.provisioningType, request.planId, tx);
    const expectedUnitPrice = await this.catalog.getPlanOriginalPrice(request.planId, tx, serviceMonth);

    return assembleRequestLinkFacts({
      request,
      provisioningTaskId,
      provisioningType: target?.provisioningType,
      requestLot,
      vendorId,
      expectedUnitPrice,
      pool,
      startMonth: await this.startMonthOf(request, tx),
    });
  }

  private async loadUninvoicedRequestLot(requestId: string, tx?: DbTx): Promise<LicenseLotView | null> {
    if (typeof this.pool.findLotOfRequest !== 'function') return null;
    const requestLot = await this.pool.findLotOfRequest(requestId, tx);
    if (requestLot && requestLot.invoiceActualMinor !== null) {
      throw new PurchaseInvoiceRefusedError('LOT_ALREADY_INVOICED');
    }

    return requestLot;
  }

  private async ensureNoK2SeatPurchase(
    requestId: string,
    provisioningType: string | undefined,
    tx?: DbTx,
  ): Promise<void> {
    if (provisioningType !== 'K2') return;
    const seatPurchaseIds = await this.pool.topUpPurchaseIdsOfRequest(requestId, tx);
    if (seatPurchaseIds.length > 0) {
      throw new PurchaseInvoiceRefusedError('SEAT_PURCHASE_REQUIRED', undefined, { seatPurchaseIds });
    }
  }

  private async poolOf(
    provisioningType: string | undefined,
    planId: string,
    tx?: DbTx,
  ): Promise<{ id: string | null; pricing: SeatPricing | null; poolSource: PoolInvoiceExpectationSource | null }> {
    if (provisioningType !== 'K2') return { id: null, pricing: null, poolSource: null };
    const id = await this.poolSubscriptionOfPlan(planId, tx);
    const [facts] = await this.pool.getPurchaseFacts([id], tx);

    return {
      id,
      pricing: facts ? pricingOf(facts) : null,
      poolSource: this.pool.topUpSource(facts, null),
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
  private async subscriptionFacts(
    subscriptionId: string,
    serviceMonth: BusinessDate,
    seatPurchaseId: string | null,
    subscriptionLineIds: readonly string[],
    tx?: DbTx,
  ): Promise<LinkFacts> {
    if (tx !== undefined && seatPurchaseId === null) {
      await this.pool.lockPeriod(tx, subscriptionId);
    }
    const [period] = await this.pool.getPurchaseFacts([subscriptionId], tx);
    if (!period) throw new PurchaseInvoiceRefusedError('LINK_NOT_FOUND');

    const vendorId = await this.catalog.getPlanVendorId(period.planId, tx);
    if (vendorId === null) throw new PurchaseInvoiceRefusedError('NO_VENDOR');
    const purchase = await this.validateSeatPurchaseLink(subscriptionId, seatPurchaseId, tx);
    if (seatPurchaseId === null) {
      await this.validateLineSelection(subscriptionId, serviceMonth, subscriptionLineIds, tx);
    }
    const organization = await this.organizationReads.getOrganization(tx);
    const poolSource =
      period.provisioningType === 'K2'
        ? await this.pool.subscriptionSource({
            subscriptionId,
            period,
            serviceMonth,
            seatPurchaseId,
            subscriptionLineIds,
            tx,
          })
        : null;

    return {
      organizationId: (organization as { id: string }).id,
      link: { kind: 'SUBSCRIPTION', subscriptionId, seatPurchaseId, subscriptionLineIds },
      vendorId,
      continuation: false,
      startMonth: null,
      termMonths: null,
      expectedQuantity: purchase ? purchase.quantity : period.purchasedQuantity,
      expectedUnitPrice: await this.catalog.getSubscriptionOriginalPrice(subscriptionId, tx),
      requestCostCenterId: null,
      failedGrantDepartmentId: null,
      requestId: null,
      holderBound: false,
      poolSubscriptionId: null,
      seatPricing: pricingOf(period),
      poolSource,
      renewedAssignmentId: null,
      licenseLotId: null,
    };
  }

  private async validateSeatPurchaseLink(subscriptionId: string, seatPurchaseId: string | null, tx?: DbTx) {
    if (seatPurchaseId === null) return null;
    const purchase = await this.pool.findSeatPurchase(seatPurchaseId, tx);
    if (!purchase) throw new PurchaseInvoiceRefusedError('LINK_NOT_FOUND');
    const [line] = await this.pool.linesOfIds([purchase.subscriptionLineId], tx);
    if (!line || line.subscriptionId !== subscriptionId) {
      throw new PurchaseInvoiceRefusedError('INVALID_LINE_SELECTION');
    }
    if (await this.invoices.seatPurchaseHasOpenInvoice(seatPurchaseId, tx)) {
      throw new PurchaseInvoiceRefusedError('SEAT_PURCHASE_INVOICED');
    }

    return purchase;
  }

  private async validateLineSelection(
    subscriptionId: string,
    serviceMonth: BusinessDate,
    subscriptionLineIds: readonly string[],
    tx?: DbTx,
  ): Promise<void> {
    const invoiced = await this.invoices.invoicedLinesForMonth(subscriptionId, serviceMonth, tx);
    if (subscriptionLineIds.length === 0) {
      if (invoiced.lineIds.size > 0) {
        throw new PurchaseInvoiceRefusedError('LINE_ALREADY_INVOICED', undefined, { lineIds: [...invoiced.lineIds] });
      }

      return;
    }
    const lines = (await this.pool.linesOfSubscription(subscriptionId, tx)).filter((l) => l.closedReason !== 'REMOVED');
    const validIds = new Set(lines.map((l) => l.id));
    if (subscriptionLineIds.some((id) => !validIds.has(id))) {
      throw new PurchaseInvoiceRefusedError('INVALID_LINE_SELECTION');
    }
    if (invoiced.wholePeriodInvoiced) {
      throw new PurchaseInvoiceRefusedError('LINE_ALREADY_INVOICED', undefined, { lineIds: subscriptionLineIds });
    }
    const overlap = subscriptionLineIds.filter((id) => invoiced.lineIds.has(id));
    if (overlap.length > 0) {
      throw new PurchaseInvoiceRefusedError('LINE_ALREADY_INVOICED', undefined, { lineIds: overlap });
    }
  }

  /** Reads K2 pool expectation inputs for a submitted invoice being confirmed. */
  async poolExpectationFactsOf(
    link: {
      linkKind: 'REQUEST' | 'SUBSCRIPTION' | 'LICENSE_LOT';
      requestId: string | null;
      subscriptionId: string | null;
      seatPurchaseId?: string | null;
      subscriptionLineIds?: readonly string[];
      serviceMonth?: Date;
    },
    tx?: DbTx,
  ): Promise<PoolExpectationFacts> {
    if (link.linkKind === 'SUBSCRIPTION') {
      return link.subscriptionId === null
        ? { isK2: false }
        : this.pool.subscriptionPoolExpectation(
            link.subscriptionId,
            link.serviceMonth ? fromDateColumn(link.serviceMonth) : '2000-01-01',
            link.seatPurchaseId ?? null,
            link.subscriptionLineIds ?? [],
            tx,
          );
    }

    return link.requestId === null ? { isK2: false } : this.requestPoolExpectation(link.requestId, tx);
  }

  private async requestPoolExpectation(requestId: string, tx?: DbTx): Promise<PoolExpectationFacts> {
    const request = await this.invoices.requestFacts(requestId, tx);
    if (!request || request.planId === null) return { isK2: false };
    const [target] = await this.catalog.findPlanSeatTargets([request.planId], tx);
    if (target?.provisioningType !== 'K2') return { isK2: false };
    const poolSubscriptionId = await this.poolSubscriptionOfPlan(request.planId, tx);
    const [period] = await this.pool.getPurchaseFacts([poolSubscriptionId], tx);
    const timeZone = await this.pool.timeZone(tx);
    const purchaseDates = await this.pool.topUpPurchaseDatesOf(requestId, timeZone, tx);

    return {
      isK2: true,
      poolSubscriptionId,
      timeZone,
      source: this.pool.topUpSource(period, purchaseDates),
    };
  }

  /** The month the right began: the month of the grant, and for a request not granted yet the month of its first invoice. */
  private async startMonthOf(request: RequestPurchaseFacts, tx?: DbTx): Promise<BusinessDate | null> {
    if (request.grantCompletedAt === null) return null;
    const organization = await this.organizationReads.getOrganization(tx);

    return firstOfMonth(businessDateAt(request.grantCompletedAt, (organization as { timeZone: string }).timeZone));
  }

  /** Parses net, deductible/non-deductible tax, and original unit price (`core/money`). */
  async moneyOf(form: PurchaseInvoiceFormInput, tx?: DbTx): Promise<PurchaseInvoiceMoney> {
    const dong = async (input: { amount: string } | undefined, path: string, floor: 'POSITIVE' | 'NON_NEGATIVE') => {
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
    const linkScope =
      facts.link.kind === 'REQUEST'
        ? { requestId: facts.link.requestId }
        : facts.link.kind === 'LICENSE_LOT'
          ? { licenseLotId: facts.link.licenseLotId }
          : { subscriptionId: facts.link.subscriptionId };
    const earlier = await this.invoices.earlierOf(linkScope, tx);
    const period = labelOfPurchaseInvoice({
      link: facts.link.kind,
      hasSeatPurchase: facts.link.kind === 'SUBSCRIPTION' && facts.link.seatPurchaseId !== null,
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
    const unallocated = facts.failedGrantDepartmentId
      ? ({ reason: 'K1_GRANT_FAILED', departmentId: facts.failedGrantDepartmentId } as const)
      : null;
    const placed = facts.poolSubscriptionId !== null || unallocated !== null;
    const chargedCostCenterId = placed ? null : await this.chargedCostCenterOf(facts, serviceMonth, tx);
    const commitment = placed ? null : await this.commitmentOf(facts, chargedCostCenterId, serviceMonth, tx);
    const noExpectedAmount = await this.pool.isPoolExpectedMissing(facts.poolSource, facts.requestId, tx);

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
        overApproved: isOverApprovedInvoice({
          netMinor: money.netMinor,
          commitmentRemainingMinor: commitment?.remainingMinor ?? null,
          seatPricing: facts.seatPricing,
          expectedQuantity: facts.expectedQuantity,
          serviceMonth,
        }),
        noExpectedAmount,
      }),
    };
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

  /** Builds K1 annual 12-month allocation inputs when confirming a K1 annual (qty 1) request invoice, or null otherwise. */
  async k1AnnualAllocationFactsOf(
    row: {
      linkKind: 'REQUEST' | 'SUBSCRIPTION' | 'LICENSE_LOT';
      requestId: string | null;
      unallocatedReason: string | null;
      quantity: number;
      serviceMonth: Date;
      chargedCostCenterId: string | null;
    },
    tx?: DbTx,
  ) {
    const eligible = await this.eligibleK1AnnualRequest(row, tx);
    if (!eligible) return null;

    const timeline = await this.grants.getK1AnnualHolderTimeline(eligible.requestId, eligible.renewedAssignmentId, tx);
    const lockSubjectKey = timeline?.rootAssignmentId ?? `req:${eligible.requestId}`;
    const deptIds = timeline ? collectSegmentDepartments(timeline.segments) : [];
    const costCenterByDepartment =
      deptIds.length > 0 ? await this.organizationReads.getUnitCostCenterIds(deptIds, tx) : new Map<string, string>();
    const monthAllocations = timeline
      ? resolveK1AnnualMonthAllocations({
          serviceMonth: row.serviceMonth.toISOString().slice(0, 10),
          segments: timeline.segments,
          costCenterByDepartment,
          fallbackCostCenterId: row.chargedCostCenterId,
          primaryRequestId: eligible.requestId,
        })
      : undefined;

    return { lockSubjectKey, ...(monthAllocations ? { monthAllocations } : {}) };
  }

  private async eligibleK1AnnualRequest(
    row: { linkKind: string; requestId: string | null; unallocatedReason: string | null; quantity: number },
    tx?: DbTx,
  ): Promise<{ requestId: string; renewedAssignmentId: string | null } | null> {
    if (
      row.linkKind !== 'REQUEST' ||
      row.requestId === null ||
      row.unallocatedReason === 'K1_GRANT_FAILED' ||
      row.quantity !== 1
    ) {
      return null;
    }
    const request = await this.invoices.requestFacts(row.requestId, tx);
    if (!request?.planId) return null;
    const [target] = await this.catalog.findPlanSeatTargets([request.planId], tx);
    if (target?.provisioningType !== 'K1' || target.referenceCommitmentMonths !== 12) return null;

    return { requestId: row.requestId, renewedAssignmentId: request.renewedAssignmentId };
  }
}
