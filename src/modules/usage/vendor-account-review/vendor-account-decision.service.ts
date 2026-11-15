import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { usageAuditEvent } from '../usage-audit-event.mapper';
import { openCaseKeyOf } from './out-of-process-case.policy';
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
      const locked = await this.lockOpen(tx, id, input.decision, organization.id);
      const opened = input.decision === 'OUT_OF_PROCESS' ? await this.openCase(tx, locked, now) : null;
      const decided = await this.repo.decide(tx, id, {
        decision: input.decision,
        note: input.note.trim(),
        byEmployeeId: actor.employeeId,
        at: now,
        caseId: opened?.record.id ?? null,
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
          {
            state: 'DECIDED',
            decision: input.decision,
            source: locked.source,
            outOfProcessCaseId: opened?.record.id ?? null,
            joinedOpenCase: opened?.joined ?? false,
          },
        ),
      );

      return decided;
    });
  }

  /** The case of `SBF-07a` for the account the difference is about: opened, or the one already open that the difference joins (`QĐ-98h`). */
  private openCase(tx: DbTx, locked: DiscrepancyRecord, now: Date) {
    return this.repo.openOrJoinCase(tx, {
      organizationId: locked.organizationId,
      discrepancyId: locked.id,
      applicationId: locked.applicationId,
      vendorId: locked.vendorId,
      identityKey: openCaseKeyOf({
        vendorId: locked.vendorId,
        identity: locked.identity,
        employeeId: locked.employeeId,
        discrepancyId: locked.id,
      }),
      at: now,
    });
  }

  /**
   * The difference locked for its one decision. Not found, decided already, or an invoice Finance suspects decided as outside the process: the money of
   * that invoice was spent when Finance signed it, and a case from it would record that money twice (`US-13-03` AC-8, AC-11, `D-79`(4)).
   */
  private async lockOpen(
    tx: DbTx,
    id: string,
    decision: VendorAccountDecision,
    organizationId: string,
  ): Promise<DiscrepancyRecord> {
    const locked = await this.repo.lockDiscrepancy(tx, id);
    if (!locked || locked.organizationId !== organizationId) throw new VendorAccountReviewRefusedError('NOT_FOUND');
    if (locked.state === 'DECIDED') throw new VendorAccountReviewRefusedError('ALREADY_DECIDED');
    if (locked.source === 'INVOICE_DIFFERENCE' && decision === 'OUT_OF_PROCESS') {
      throw new VendorAccountReviewRefusedError('DECISION_NOT_ALLOWED');
    }

    return locked;
  }
}
