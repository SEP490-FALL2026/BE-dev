import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { usageAuditEvent } from '../usage-audit-event.mapper';
import { VendorAccountReviewRefusedError } from './vendor-account-review.errors';
import { VendorAccountReviewRepo } from './vendor-account-review.repo';
import type { DiscrepancyRecord, VendorAccountDecision } from './vendor-account-review.types';

/**
 * The one decision of the IT Admin on a difference of an account at the vendor (`SBF-08`, RC-2): let it go through a Request, revoke the access, call
 * it a false alarm, or say it is outside the process, which opens the case of `SBF-07a` in the same transaction (C-4). It is taken once, with a note;
 * the revocation and the Request themselves are done where they are done today, this records the choice.
 */
@Injectable()
export class VendorAccountDecisionService {
  constructor(
    private readonly repo: VendorAccountReviewRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /** Throws VendorAccountReviewRefusedError (NOT_FOUND, ALREADY_DECIDED). */
  async decide(
    actor: AuthenticatedPrincipal,
    id: string,
    input: { decision: VendorAccountDecision; note: string },
    now: Date = new Date(),
  ): Promise<DiscrepancyRecord> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('A difference of an account at the vendor was decided before installation');

    return this.runner.run(async (tx) => {
      const locked = await this.repo.lockDiscrepancy(tx, id);
      if (!locked || locked.organizationId !== organization.id) throw new VendorAccountReviewRefusedError('NOT_FOUND');
      if (locked.state === 'DECIDED') throw new VendorAccountReviewRefusedError('ALREADY_DECIDED');
      const opened =
        input.decision === 'OUT_OF_PROCESS'
          ? await this.repo.insertCase(tx, {
              organizationId: locked.organizationId,
              discrepancyId: locked.id,
              applicationId: locked.applicationId,
              vendorId: locked.vendorId,
              at: now,
            })
          : null;
      const decided = await this.repo.decide(tx, id, {
        decision: input.decision,
        note: input.note.trim(),
        byEmployeeId: actor.employeeId,
        at: now,
        caseId: opened?.id ?? null,
      });
      await this.audit.record(
        tx,
        usageAuditEvent(
          actor,
          locked.organizationId,
          'VENDOR_ACCOUNT_DISCREPANCY.DECIDED',
          'VendorAccountDiscrepancy',
          id,
          { state: 'OPEN' },
          { state: 'DECIDED', decision: input.decision, source: locked.source, outOfProcessCaseId: opened?.id ?? null },
        ),
      );

      return decided;
    });
  }
}
