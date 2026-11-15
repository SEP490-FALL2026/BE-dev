import { Injectable } from '@nestjs/common';
import { businessDateAt, type BusinessDate } from '../../../core/business-date';
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
import { chargedCostCenterOf, holderDayOf } from './purchase-invoice-charge.policy';
import { PurchaseInvoiceRefusedError } from './purchase-invoice.errors';
import { matchPurchaseInvoice, type OriginalPrice } from './purchase-invoice-match.policy';
import { PurchaseInvoiceRepo, type RequestPurchaseFacts } from './purchase-invoice.repo';
import type { PurchaseInvoiceFormInput } from './purchase-invoice.dto';
import type { PurchaseInvoiceLink, PurchaseInvoiceMoney, PurchaseInvoicePlan } from './purchase-invoice.types';

/**
 * The states of a request whose purchase has been approved to be spent (the spend decision is behind it): it waits for the IT Admin, who buys
 * before the grant, is carrying it out, or has completed it. The money may go out and the invoice come.
 */
const PURCHASABLE_STATES: ReadonlySet<string> = new Set(['AWAITING_EXECUTION', 'EXECUTING', 'COMPLETED']);

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
  /** The right is a person's own (`K1`, `K4`): the department that bears it is the holder's. */
  holderBound: boolean;
  renewedAssignmentId: string | null;
}

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
    const scope = await this.organizationReads.getItAdminScope(actor.employeeId, (ids) =>
      this.identity.findUsableItAdminEmployeeIds(ids),
    );
    const serviceMonth = `${form.servicePeriodMonth}-01`;

    return form.link.requestId !== undefined
      ? this.requestFacts(form.link.requestId, form.link.provisioningTaskId ?? null, scope, serviceMonth, tx)
      : this.subscriptionFacts(form.link.subscriptionId as string, scope, tx);
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
    if (!PURCHASABLE_STATES.has(request.state) || request.planId === null) {
      throw new PurchaseInvoiceRefusedError('REQUEST_NOT_PURCHASABLE', 'STATE');
    }
    const vendorId = await this.catalog.getPlanVendorId(request.planId, tx);
    if (vendorId === null) throw new PurchaseInvoiceRefusedError('NO_VENDOR');
    const [target] = await this.catalog.findPlanSeatTargets([request.planId], tx);

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
      holderBound: target?.provisioningType === 'K1' || target?.provisioningType === 'K4',
      renewedAssignmentId: request.renewedAssignmentId,
    };
  }

  private async subscriptionFacts(subscriptionId: string, scope: readonly string[], tx?: DbTx): Promise<LinkFacts> {
    const [period] = await this.periods.getPeriods([subscriptionId], tx);
    if (!period || !scope.includes(period.ownerDepartmentId)) throw new PurchaseInvoiceRefusedError('LINK_NOT_FOUND');
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
      requestId: null,
      holderBound: false,
      renewedAssignmentId: null,
    };
  }

  /** The month the right began: the month of the grant, and for a request not granted yet the month of its first invoice. */
  private async startMonthOf(request: RequestPurchaseFacts, tx?: DbTx): Promise<BusinessDate | null> {
    if (request.grantCompletedAt === null) return null;
    const organization = await this.organizationReads.getOrganization(tx);

    return firstOfMonth(businessDateAt(request.grantCompletedAt, (organization as { timeZone: string }).timeZone));
  }

  /** What the invoice says in money, in minor units: the dong taken out and the price of one in the currency it states. */
  async moneyOf(form: PurchaseInvoiceFormInput, tx?: DbTx): Promise<PurchaseInvoiceMoney> {
    const dong = async (input: { amount: string } | undefined): Promise<bigint> =>
      input ? (await this.finance.parseMoney({ amount: input.amount, currency: 'VND' }, tx)).amountMinor : 0n;
    const original = await this.finance.parseMoney(form.unitPriceOriginal, tx);

    return {
      netMinor: await dong(form.netAmount),
      deductibleTaxMinor: await dong(form.deductibleTax),
      nonDeductibleTaxMinor: await dong(form.nonDeductibleTax),
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
    const chargedCostCenterId = await this.chargedCostCenterOf(facts, serviceMonth, tx);
    const commitment = await this.commitmentOf(facts, chargedCostCenterId, serviceMonth, tx);

    return {
      organizationId: facts.organizationId,
      link: facts.link,
      vendorId: facts.vendorId,
      serviceMonth,
      period,
      match,
      chargedCostCenterId,
      commitment,
      flags: flagsOfPurchaseInvoice({
        outsideTerm: period.outsideTerm,
        overApproved: commitment !== null && money.netMinor > commitment.remainingMinor,
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
}
