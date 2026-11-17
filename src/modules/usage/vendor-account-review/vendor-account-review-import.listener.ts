import { Injectable, OnModuleInit } from '@nestjs/common';
import { InvoiceDiscrepancyReferralListeners } from '../../requests/public/requests.extension-points';
import { UsageImportListeners } from '../public/usage.extension-points';
import { VendorAccountIntakeService } from './vendor-account-intake.service';

/**
 * Makes the differences the IT Admin reviews (`SBF-08`, RC-2) from what is found elsewhere, when it is found: from the accounts a confirmed report of a
 * vendor leaves with no seat or no owner (`UsageImportListeners`, inside the transaction of the confirmation), and from an invoice Finance closed as a
 * suspicion (`InvoiceDiscrepancyReferralListeners`, inside the transaction of the closing; a listener that throws undoes the closing, `RC-1`).
 * It binds both when the module starts, so neither the requests context nor the confirmation imports it.
 */
@Injectable()
export class VendorAccountReviewListener implements OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [InvoiceDiscrepancyReferralListeners, UsageImportListeners] as const;

  constructor(
    private readonly imports: UsageImportListeners,
    private readonly referrals: InvoiceDiscrepancyReferralListeners,
    private readonly intake: VendorAccountIntakeService,
  ) {}

  onModuleInit(): void {
    this.imports.add('vendor-account-review', async (tx, event) => {
      await this.intake.fromImport(tx, event);
    });
    this.referrals.add('vendor-account-review', (tx, referral) => this.intake.fromInvoiceReferral(tx, referral));
  }
}
