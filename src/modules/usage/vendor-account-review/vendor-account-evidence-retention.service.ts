import { Injectable } from '@nestjs/common';
import { businessDateAt } from '../../../core/business-date';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { evidenceCutoff } from './vendor-account-discrepancy.policy';
import { VendorAccountReviewRepo } from './vendor-account-review.repo';

/** The most differences one transaction deletes: the sweep goes on in the next ones until none is left. */
const BATCH = 500;

/**
 * Deletes the evidence of the review of the accounts at the vendor 24 months after its day (`SBF-08`, `US-14-04` AC-2): the two values and the
 * identifier of a difference. A case outside the process keeps what it recorded (money is a financial record, `AC-3`), but nothing of the evidence.
 * Each batch is its own transaction that also writes one audit event with the number deleted and the cutoff, never what was deleted.
 */
@Injectable()
export class VendorAccountEvidenceRetentionService {
  constructor(
    private readonly repo: VendorAccountReviewRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /** Returns how many differences were deleted. */
  async sweep(now: Date): Promise<{ deleted: number }> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) return { deleted: 0 };
    const cutoff = evidenceCutoff(businessDateAt(now, organization.timeZone));
    let deleted = 0;
    for (;;) {
      const batch = await this.runner.run(async (tx) => {
        const organizations = await this.repo.deleteOlderThan(tx, cutoff, BATCH);
        for (const [organizationId, count] of countsOf(organizations)) {
          await this.audit.record(tx, {
            organizationId,
            actorKind: 'SYSTEM',
            actorAppUserId: null,
            actorRoles: [],
            action: 'VENDOR_ACCOUNT_EVIDENCE.EXPIRED',
            resourceType: 'Organization',
            resourceId: organizationId,
            before: null,
            after: { deleted: count, evidenceBefore: cutoff },
            correlationId: `vendor-account-evidence-retention:${cutoff}`,
          });
        }

        return organizations.length;
      });
      deleted += batch;
      if (batch < BATCH) return { deleted };
    }
  }
}

function countsOf(organizationIds: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of organizationIds) counts.set(id, (counts.get(id) ?? 0) + 1);

  return counts;
}
