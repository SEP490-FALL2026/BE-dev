import { Injectable } from '@nestjs/common';
import { fromDateColumn } from '../../../../core/business-date';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { LicensingApi } from '../../../licensing/public/licensing.api';
import { InvoiceDiscrepancyOpeningService } from '../../invoice-discrepancy/invoice-discrepancy-opening.service';
import type { InvoiceDiscrepancyMismatch } from '../../invoice-discrepancy/invoice-discrepancy.types';
import { mismatchesOfRow } from '../purchase-invoice-match.policy';
import type { PurchaseInvoiceRow } from '../purchase-invoice.repo';

/**
 * Post-confirmation settlement (`SBF-11a`, `W3-09`): opens any mismatch discrepancy case, or when none is opened,
 * records one-time realised renewal savings for a `SUBSCRIPTION` `RENEWAL`/`PERIOD` invoice.
 */
@Injectable()
export class ConfirmationSettlementService {
  constructor(
    private readonly discrepancies: InvoiceDiscrepancyOpeningService,
    private readonly licensing: LicensingApi,
  ) {}

  async settle(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    row: PurchaseInvoiceRow,
    invoiceId: string,
    exceedsPoolThreshold: boolean,
    now: Date,
  ): Promise<void> {
    const base: InvoiceDiscrepancyMismatch[] =
      row.matchResult === 'PRICE_QUANTITY_EXCEPTION' ? mismatchesOfRow(row) : [];
    const mismatches: InvoiceDiscrepancyMismatch[] = exceedsPoolThreshold
      ? [...new Set<InvoiceDiscrepancyMismatch>([...base, 'EXPECTED_AMOUNT'])]
      : base;
    if (mismatches.length > 0) {
      await this.discrepancies.open(tx, actor, {
        organizationId: row.organizationId,
        purchaseInvoiceId: row.id,
        mismatches,
        now,
      });

      return;
    }
    if (row.linkKind !== 'SUBSCRIPTION' || row.subscriptionId === null) return;
    if (row.label !== 'RENEWAL' && row.label !== 'PERIOD') return;

    await this.licensing.recordRealisedSaving(tx, {
      newPeriodId: row.subscriptionId,
      invoiceId,
      serviceMonth: fromDateColumn(row.serviceMonth),
      now,
    });
  }
}
