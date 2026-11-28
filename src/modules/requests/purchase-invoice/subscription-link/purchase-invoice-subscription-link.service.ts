import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../../core/business-date';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { CatalogApi } from '../../../catalog/public/catalog.api';
import { IdentityAccessApi } from '../../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import { PurchaseInvoicePoolService } from '../pool-expectation/purchase-invoice-pool-expectation.service';
import { PurchaseInvoiceRefusedError } from '../purchase-invoice.errors';
import { PurchaseInvoiceRepo } from '../purchase-invoice.repo';
import type { LinkFacts } from '../purchase-invoice.types';

/** What decides who answers for an invoice already kept. */
interface InvoiceLink {
  linkKind: string;
  submittedByEmployeeId: string;
  subscriptionId: string | null;
  licenseLotId: string | null;
}

/**
 * The invoice of a subscription, and who answers for an invoice by its link (`QĐ-118d`, `QĐ-118f`, Owner 28/11/2026): the invoice of a subscription
 * (period, renewal, seat purchase, chosen lines) and of a license lot not bought for a request is the work of the IT Admin who answers for the
 * subscription or the lot now; no other IT Admin works in their place and only the Super Admin changes who answers. The invoice of a request (and
 * of the lot bought for it) stays with the IT Admin of its department, and its resubmission with the one who submitted it.
 */
@Injectable()
export class PurchaseInvoiceSubscriptionLinkService {
  constructor(
    private readonly invoices: PurchaseInvoiceRepo,
    private readonly catalog: CatalogApi,
    private readonly pool: PurchaseInvoicePoolService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
  ) {}

  /** The departments the IT Admin acts for (their own and those with no usable IT Admin, `F12`): the scope of an invoice of a request. */
  actingScopeOf(employeeId: string, tx?: DbTx): Promise<readonly string[]> {
    return this.organizationReads.getItAdminActingScope(
      employeeId,
      (ids) => this.identity.findUsableItAdminEmployeeIds(ids, tx),
      tx,
    );
  }

  /** Reads a subscription invoice form against its period. Throws PurchaseInvoiceRefusedError (NOT_RESPONSIBLE when the caller does not answer for it). */
  async factsOf(
    subscriptionId: string,
    actorEmployeeId: string,
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
    await this.requireResponsible(subscriptionId, actorEmployeeId, tx);

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
    const expectedQuantity = purchase ? purchase.quantity : period.purchasedQuantity;

    return {
      organizationId: (organization as { id: string }).id,
      link: { kind: 'SUBSCRIPTION', subscriptionId, seatPurchaseId, subscriptionLineIds },
      vendorId,
      continuation: false,
      startMonth: null,
      termMonths: null,
      expectedQuantity,
      expectedUnitPrice: await this.catalog.getSubscriptionOriginalPrice(subscriptionId, tx),
      requestCostCenterId: null,
      failedGrantDepartmentId: null,
      requestId: null,
      holderBound: false,
      poolSubscriptionId: null,
      ceilingParts: await this.pool.ceilingPartsOf({
        period,
        serviceMonth,
        seatPurchaseId,
        subscriptionLineIds,
        expectedQuantity,
        tx,
      }),
      poolSource,
      renewedAssignmentId: null,
      licenseLotId: null,
    };
  }

  /**
   * Whether the caller may submit this returned invoice again, judged before its state. An invoice of a subscription or of a lot not bought for a
   * request: the IT Admin who answers for it now, whoever submitted it (NOT_RESPONSIBLE otherwise). An invoice of a request: the one who submitted it
   * (NOT_FOUND otherwise, as it always was).
   */
  async requireToResubmit(row: InvoiceLink, actorEmployeeId: string, tx: DbTx): Promise<void> {
    const responsible = await this.responsibleOf(row, tx);
    if (responsible === undefined) {
      if (row.submittedByEmployeeId !== actorEmployeeId) throw new PurchaseInvoiceRefusedError('NOT_FOUND');
    } else if (responsible !== actorEmployeeId) {
      throw new PurchaseInvoiceRefusedError('NOT_RESPONSIBLE');
    }
  }

  /** Who is told what became of the invoice: the IT Admin who answers for it now, the one who submitted it for an invoice of a request or when none is named. */
  async recipientOf(row: InvoiceLink, tx: DbTx): Promise<string> {
    return (await this.responsibleOf(row, tx)) ?? row.submittedByEmployeeId;
  }

  /** The IT Admin who answers for the subscription or lot of the invoice (null when it names none); undefined for an invoice of a request. */
  private async responsibleOf(row: InvoiceLink, tx: DbTx): Promise<string | null | undefined> {
    if (row.linkKind === 'SUBSCRIPTION' && row.subscriptionId !== null) {
      return this.catalog.getSubscriptionResponsibleItAdmin(row.subscriptionId, tx);
    }
    if (row.linkKind !== 'LICENSE_LOT' || row.licenseLotId === null) return undefined;
    const lot = await this.pool.findLot(row.licenseLotId, tx);

    return lot === null || lot.purpose === 'REQUEST' ? undefined : lot.responsibleItAdminEmployeeId;
  }

  private async requireResponsible(subscriptionId: string, actorEmployeeId: string, tx?: DbTx): Promise<void> {
    const responsible = await this.catalog.getSubscriptionResponsibleItAdmin(subscriptionId, tx);
    if (responsible !== actorEmployeeId) throw new PurchaseInvoiceRefusedError('NOT_RESPONSIBLE');
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
}
