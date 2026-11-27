import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { InvoiceDiscrepancyRepo } from './invoice-discrepancy.repo';
import type { InvoiceDiscrepancyMismatch } from './invoice-discrepancy.types';

/**
 * Opens the case of an invoice that differs (`RC-1`, `QĐ-111y`, `R-44`), in the transaction in which Finance signs it: once for the invoice, with what
 * differs, so a signed invoice that was marked never lacks its case and one that was not never has one. The invoice is signed all the same; the case
 * is what Finance works from afterwards. A difference of dong only (exchange rate, card fee) never gets here.
 */
@Injectable()
export class InvoiceDiscrepancyOpeningService {
  constructor(
    private readonly cases: InvoiceDiscrepancyRepo,
    private readonly audit: AuditApi,
  ) {}

  /** Returns the id of the case. */
  async open(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: {
      organizationId: string;
      purchaseInvoiceId: string;
      mismatches: readonly InvoiceDiscrepancyMismatch[];
      now: Date;
    },
  ): Promise<string> {
    const mismatches = [...new Set(input.mismatches)];
    const { id } = await this.cases.insert(tx, {
      organizationId: input.organizationId,
      purchaseInvoiceId: input.purchaseInvoiceId,
      mismatches,
      openedAt: input.now,
    });
    await this.audit.record(tx, {
      organizationId: input.organizationId,
      actorKind: 'USER',
      actorAppUserId: actor.appUserId,
      actorRoles: actor.roles,
      action: 'INVOICE_DISCREPANCY.OPENED',
      resourceType: 'INVOICE_DISCREPANCY',
      resourceId: id,
      before: null,
      after: { purchaseInvoiceId: input.purchaseInvoiceId, mismatches },
      correlationId: actor.sessionId,
    });

    return id;
  }
}
