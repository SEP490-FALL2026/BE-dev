import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { formatAmount } from '../../../core/money/money';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { FinanceApi } from '../../finance/public/finance.api';
import type { InvoiceDiscrepancyReferral } from '../../requests/public/requests.extension-points';
import type { UsageImportConfirmedEvent } from '../public/usage.extension-points';
import {
  valuesOfInvoiceDifference,
  valuesOfNoAssignment,
  valuesOfUnlistedTool,
  valuesOfUnmatchedIdentity,
} from './vendor-account-discrepancy.policy';
import { VendorAccountReviewRepo } from './vendor-account-review.repo';
import type { NewDiscrepancy } from './vendor-account-review.types';

/**
 * Makes the differences the IT Admin reviews (`SBF-08`, RC-2, `QĐ-111y`, R-18) from what is found elsewhere, in the transaction of whoever found it:
 * an account with activity and no seat and an identifier nobody owns, when a report of the vendor is confirmed; an invoice Finance suspects, when it
 * is closed as a suspicion (`RC-1`); a tool the collector sees that is not on the allowlist. A thing seen again only moves the day of its evidence
 * (US-13-03 AC-11); it never makes a second row, and it never holds the name of a person (`OQ-03`).
 */
@Injectable()
export class VendorAccountIntakeService {
  constructor(
    private readonly repo: VendorAccountReviewRepo,
    private readonly catalog: CatalogApi,
    private readonly finance: FinanceApi,
  ) {}

  /** The open findings and open identifiers the confirmed report contains; returns how many differences are new. */
  async fromImport(tx: DbTx, event: UsageImportConfirmedEvent, now: Date = new Date()): Promise<number> {
    const findings = await this.repo.openFindingsOf(tx, event.applicationId, event.importId);
    const unmatched = await this.repo.openUnmatchedOf(tx, event.applicationId, event.importId);
    if (findings.length === 0 && unmatched.length === 0) return 0;
    const vendorId = (await this.catalog.getCatalogEntry(tx, event.applicationId))?.vendor?.id ?? null;
    const rows: NewDiscrepancy[] = [
      ...findings.map<NewDiscrepancy>((finding) => ({
        organizationId: finding.organizationId,
        source: 'NO_ASSIGNMENT',
        sourceRef: finding.id,
        applicationId: finding.applicationId,
        vendorId,
        employeeId: finding.employeeId,
        identity: null,
        evidenceOn: finding.lastActivityDate.toISOString().slice(0, 10),
        now,
        ...valuesOfNoAssignment({
          firstActivityDate: finding.firstActivityDate.toISOString().slice(0, 10),
          lastActivityDate: finding.lastActivityDate.toISOString().slice(0, 10),
        }),
      })),
      ...unmatched.map<NewDiscrepancy>((identity) => ({
        organizationId: identity.organizationId,
        source: 'UNMATCHED_IDENTITY',
        sourceRef: identity.id,
        applicationId: identity.applicationId,
        vendorId,
        employeeId: null,
        identity: identity.rawIdentifier.trim().slice(0, 320),
        evidenceOn: event.coverageTo,
        now,
        ...valuesOfUnmatchedIdentity({
          reason: identity.reason,
          candidateCount: identity.candidateEmployeeIds.length,
          rawIdentifier: identity.rawIdentifier.trim().slice(0, 200),
        }),
      })),
    ];

    return this.repo.upsertMany(tx, rows);
  }

  /** The invoice Finance closed as a suspicion: what the invoice says against what was approved or bought, side by side. */
  async fromInvoiceReferral(tx: DbTx, referral: InvoiceDiscrepancyReferral, now: Date = new Date()): Promise<void> {
    await this.repo.upsertMany(tx, [
      {
        organizationId: referral.organizationId,
        source: 'INVOICE_DIFFERENCE',
        sourceRef: referral.caseId,
        applicationId: null,
        vendorId: referral.vendorId,
        employeeId: null,
        identity: null,
        evidenceOn: referral.closedAt.toISOString().slice(0, 10),
        now,
        ...valuesOfInvoiceDifference({
          quantity: referral.quantity,
          unitPrice: {
            invoice: await this.priceText(tx, referral.unitPrice.invoice),
            expected: referral.unitPrice.expected ? await this.priceText(tx, referral.unitPrice.expected) : null,
          },
        }),
      },
    ]);
  }

  /** The tools the collector reported that are not on the allowlist: one row for each tool, the day of the evidence the last day it was seen. */
  async fromUnlistedTools(
    tx: DbTx,
    input: { organizationId: string; sightings: readonly { tool: string; date: BusinessDate }[] },
    now: Date = new Date(),
  ): Promise<void> {
    const lastDay = new Map<string, BusinessDate>();
    for (const sighting of input.sightings) {
      const seen = lastDay.get(sighting.tool);
      if (seen === undefined || sighting.date > seen) lastDay.set(sighting.tool, sighting.date);
    }
    await this.repo.upsertMany(
      tx,
      [...lastDay].map(([tool, date]) => ({
        organizationId: input.organizationId,
        source: 'COLLECTOR_UNLISTED' as const,
        sourceRef: tool,
        applicationId: null,
        vendorId: null,
        employeeId: null,
        identity: tool,
        evidenceOn: date,
        now,
        ...valuesOfUnlistedTool(tool),
      })),
    );
  }

  private async priceText(tx: DbTx, price: { amountMinor: bigint; currency: string }): Promise<string> {
    const currency = await this.finance.findCurrency(price.currency, tx);

    return `${formatAmount(price.amountMinor, currency?.minorUnit ?? 0)} ${price.currency}`;
  }
}
