import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { DocumentAttachRefusedError } from '../../catalog/public/catalog.errors';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import { PurchaseInvoiceRefusedError } from './purchase-invoice.errors';
import type { PurchaseInvoiceFormInput, PurchaseInvoiceSubmitInput } from './purchase-invoice.dto';
import { PurchaseInvoicePoolService } from './pool-expectation/purchase-invoice-pool-expectation.service';
import { PurchaseInvoicePlanService } from './purchase-invoice-plan.service';
import { PurchaseInvoiceRepo, type PurchaseInvoiceRow } from './purchase-invoice.repo';
import type { PurchaseInvoicePlan } from './purchase-invoice.types';

/**
 * The IT Admin submits the invoice of a purchase and Finance is told (`PI-1`, `QĐ-111u`). The form is read against its request or subscription
 * in the transaction (label, period, match, department that bears it), the invoice is kept as it was read, its files are attached to it, and
 * nothing is spent yet: Finance signs the money out. The marks laid on an invoice (more than approved, outside the term) never refuse it.
 */
const linkPersistenceFields = (link: PurchaseInvoicePlan['link']) => ({
  linkKind: link.kind,
  requestId: link.kind === 'REQUEST' ? link.requestId : null,
  provisioningTaskId: link.kind === 'REQUEST' ? link.provisioningTaskId : null,
  subscriptionId: link.kind === 'SUBSCRIPTION' ? link.subscriptionId : null,
  seatPurchaseId: link.kind === 'SUBSCRIPTION' ? link.seatPurchaseId : null,
  subscriptionLineIds: link.kind === 'SUBSCRIPTION' ? [...link.subscriptionLineIds] : [],
  licenseLotId: link.kind === 'LICENSE_LOT' ? link.licenseLotId : null,
});

@Injectable()
export class PurchaseInvoiceSubmissionService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly plans: PurchaseInvoicePlanService,
    private readonly pool: PurchaseInvoicePoolService,
    private readonly invoices: PurchaseInvoiceRepo,
    private readonly catalog: CatalogApi,
    private readonly identity: IdentityAccessApi,
    private readonly notifications: NotificationsApi,
    private readonly audit: AuditApi,
  ) {}

  /** What the invoice would be, with nothing kept (the form without files). Throws PurchaseInvoiceRefusedError. */
  preview(actor: AuthenticatedPrincipal, form: PurchaseInvoiceFormInput): Promise<PurchaseInvoicePlan> {
    return this.plans.plan(actor, form);
  }

  /** Throws PurchaseInvoiceRefusedError (LINK_NOT_FOUND, REQUEST_NOT_PURCHASABLE, NO_VENDOR, NUMBER_TAKEN, DOCUMENT_INVALID) and the money errors. */
  async submit(actor: AuthenticatedPrincipal, input: PurchaseInvoiceSubmitInput): Promise<PurchaseInvoiceRow> {
    return this.runner.run((tx) => this.keep(tx, actor, input, null));
  }

  /** A new submission of a returned invoice, for the same request or subscription. Throws PurchaseInvoiceRefusedError (NOT_FOUND, NOT_RETURNED, ALREADY_RESUBMITTED, …). */
  async resubmit(
    actor: AuthenticatedPrincipal,
    id: string,
    body: Omit<PurchaseInvoiceSubmitInput, 'link'>,
  ): Promise<PurchaseInvoiceRow> {
    return this.runner.run(async (tx) => {
      const old = await this.invoices.lock(tx, id);
      if (!old) throw new PurchaseInvoiceRefusedError('NOT_FOUND');
      if (old.submittedByEmployeeId !== actor.employeeId && !(await this.pool.isOfResponsibleItAdmin(old, tx))) {
        throw new PurchaseInvoiceRefusedError('NOT_FOUND');
      }
      if (old.state !== 'RETURNED') throw new PurchaseInvoiceRefusedError('NOT_RETURNED');
      if ((await this.invoices.resubmittedAs([old.id], tx)).has(old.id)) {
        throw new PurchaseInvoiceRefusedError('ALREADY_RESUBMITTED');
      }
      const link =
        old.linkKind === 'REQUEST'
          ? {
              requestId: old.requestId as string,
              ...(old.provisioningTaskId ? { provisioningTaskId: old.provisioningTaskId } : {}),
            }
          : old.linkKind === 'LICENSE_LOT'
            ? { licenseLotId: old.licenseLotId as string }
            : {
                subscriptionId: old.subscriptionId as string,
                ...(old.seatPurchaseId ? { seatPurchaseId: old.seatPurchaseId } : {}),
                ...(old.subscriptionLineIds.length > 0 ? { subscriptionLineIds: old.subscriptionLineIds } : {}),
              };

      return this.keep(tx, actor, { ...body, link }, old.id);
    });
  }

  private async keep(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: PurchaseInvoiceSubmitInput,
    resubmissionOfId: string | null,
  ): Promise<PurchaseInvoiceRow> {
    if (new Set(input.documentIds).size !== input.documentIds.length) {
      throw new PurchaseInvoiceRefusedError('DOCUMENT_INVALID', 'DUPLICATE');
    }
    const plan = await this.plans.plan(actor, input, tx);
    const money = await this.plans.moneyOf(input, tx);
    if (await this.invoices.numberIsOpen(tx, plan.organizationId, plan.vendorId, input.vendorInvoiceNumber)) {
      throw new PurchaseInvoiceRefusedError('NUMBER_TAKEN');
    }
    const row = await this.insert(tx, {
      organizationId: plan.organizationId,
      ...linkPersistenceFields(plan.link),
      vendorId: plan.vendorId,
      number: input.vendorInvoiceNumber,
      issuedOn: input.issuedOn,
      serviceMonth: plan.serviceMonth,
      label: plan.period.label,
      periodIndex: plan.period.periodIndex,
      periodCount: plan.period.periodCount,
      quantity: input.quantity,
      unitPriceOriginalMinor: money.unitPriceOriginal.amountMinor,
      unitPriceOriginalCurrency: money.unitPriceOriginal.currency,
      netMinor: money.netMinor,
      deductibleTaxMinor: money.deductibleTaxMinor,
      nonDeductibleTaxMinor: money.nonDeductibleTaxMinor,
      matchResult: plan.match.result,
      expectedQuantity: plan.expected.quantity,
      expectedUnitPriceOriginalMinor: plan.expected.unitPrice?.amountMinor ?? null,
      expectedUnitPriceOriginalCurrency: plan.expected.unitPrice?.currency ?? null,
      paymentSource: input.paymentSource,
      flags: plan.flags,
      chargedCostCenterId: plan.chargedCostCenterId,
      unallocatedReason: plan.unallocated?.reason ?? null,
      submittedByEmployeeId: actor.employeeId,
      submittedAt: new Date(),
      resubmissionOfId,
    });
    // The files are judged first: a file already attached to another invoice is refused here, not by the unique index of the link.
    await this.attach(tx, actor, input.documentIds, row.id);
    await this.invoices.linkDocuments(tx, row.id, input.documentIds);
    await this.record(tx, actor, row, plan);
    await this.tellFinance(tx, row);

    return row;
  }

  /** A second invoice with the same number from the same vendor loses the race at the partial unique index and is told so. */
  private async insert(tx: DbTx, input: Parameters<PurchaseInvoiceRepo['insert']>[1]): Promise<PurchaseInvoiceRow> {
    try {
      return await this.invoices.insert(tx, input);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = JSON.stringify(error.meta?.target ?? '');
        if (target.includes('seat_purchase')) {
          throw new PurchaseInvoiceRefusedError('SEAT_PURCHASE_INVOICED');
        }
        if (target.includes('license_lot')) {
          throw new PurchaseInvoiceRefusedError('LOT_ALREADY_INVOICED');
        }
        throw new PurchaseInvoiceRefusedError(target.includes('resubmission') ? 'ALREADY_RESUBMITTED' : 'NUMBER_TAKEN');
      }
      throw error;
    }
  }

  private async attach(tx: DbTx, actor: AuthenticatedPrincipal, documentIds: readonly string[], id: string) {
    try {
      await this.catalog.attachPurchaseDocuments(tx, actor, { documentIds, purchaseInvoiceId: id });
    } catch (error) {
      if (error instanceof DocumentAttachRefusedError) {
        throw new PurchaseInvoiceRefusedError('DOCUMENT_INVALID', error.problem);
      }
      throw error;
    }
  }

  private async record(tx: DbTx, actor: AuthenticatedPrincipal, row: PurchaseInvoiceRow, plan: PurchaseInvoicePlan) {
    await this.audit.record(tx, {
      organizationId: row.organizationId,
      actorKind: 'USER',
      actorAppUserId: actor.appUserId,
      actorRoles: actor.roles,
      action: 'PURCHASE_INVOICE.SUBMITTED',
      resourceType: 'PURCHASE_INVOICE',
      resourceId: row.id,
      before: null,
      after: {
        linkKind: row.linkKind,
        requestId: row.requestId,
        subscriptionId: row.subscriptionId,
        number: row.number,
        label: row.label,
        matchResult: row.matchResult,
        flags: row.flags,
        chargedCostCenterId: plan.chargedCostCenterId,
        unallocatedReason: plan.unallocated?.reason ?? null,
        resubmissionOfId: row.resubmissionOfId,
      },
      correlationId: actor.sessionId,
    });
  }

  /** The inbox of Finance: the one person who signs the money out. Nobody to tell is not a refusal. */
  private async tellFinance(tx: DbTx, row: PurchaseInvoiceRow): Promise<void> {
    const recipient = await this.identity.findUsableFinanceEmployeeId(tx);
    if (recipient === null) return;
    await this.notifications.notifyInApp(tx, {
      organizationId: row.organizationId,
      recipientEmployeeId: recipient,
      code: 'PURCHASE_INVOICE_SUBMITTED',
      subject: { type: 'PURCHASE_INVOICE', id: row.id },
      params: {
        purchaseInvoiceId: row.id,
        linkKind: row.linkKind,
        servicePeriodMonth: row.serviceMonth.toISOString().slice(0, 7),
      },
      eventKey: `PURCHASE_INVOICE_SUBMITTED:${row.id}`,
    });
  }
}
