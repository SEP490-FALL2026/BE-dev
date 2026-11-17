import { Injectable } from '@nestjs/common';
import { businessDateAt } from '../../../core/business-date';
import { MoneyOutOfRangeError } from '../../../core/money/money.errors';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { BudgetsApi } from '../../budgets/public/budgets.api';
import { OutOfProcessSpendRefusedError } from '../../budgets/public/budgets.errors';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { DocumentAttachRefusedError } from '../../catalog/public/catalog.errors';
import { FinanceApi } from '../../finance/public/finance.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { usageAuditEvent } from '../usage-audit-event.mapper';
import { closureRefusal } from './out-of-process-case.policy';

/** The most files a case holds (the proofs of payment, then the proofs of a revocation). */
const OUT_OF_PROCESS_DOCUMENTS_MAX = 20;
import { VendorAccountReviewRefusedError } from './vendor-account-review.errors';
import { VendorAccountReviewNotifier } from './vendor-account-review-notifier.service';
import { VendorAccountReviewRepo } from './vendor-account-review.repo';
import type { OutOfProcessCaseRecord, OutOfProcessOutcome } from './vendor-account-review.types';

/** What a case is closed with: the money only for `RECORD_SPENT`, where no Cost Center (`costCenterId` null) means it is not allocated yet. */
export interface OutOfProcessClosureInput {
  outcome: OutOfProcessOutcome;
  note: string;
  documentIds: readonly string[];
  amount: { amount: string } | undefined;
  /** The Cost Center that bears the money; `null` = none yet; absent = not chosen (only `RECORD_SPENT` chooses). */
  costCenterId: string | null | undefined;
  /** The renewal or payment with the vendor was cancelled; only `REVOKED` says so, and then needs a proof among the files. */
  renewalCancelled: boolean;
}

/**
 * Closes a case outside the process once (`SBF-07a`, R-45, C-4). Money is recorded only as money already spent with a proof of payment of the
 * company: the amount in dong, the files the person who closes it uploaded, and the Cost Center that bears it or none yet. Then the files are attached
 * to the case and the money becomes the one expense of the case, in the same transaction; without a proof the case can only be a false alarm or a report.
 */
@Injectable()
export class OutOfProcessCaseClosureService {
  constructor(
    private readonly repo: VendorAccountReviewRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly catalog: CatalogApi,
    private readonly finance: FinanceApi,
    private readonly budgets: BudgetsApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
    private readonly notifier: VendorAccountReviewNotifier,
  ) {}

  /** Throws VendorAccountReviewRefusedError and the money errors of `core/money`. */
  async close(
    actor: AuthenticatedPrincipal,
    id: string,
    input: OutOfProcessClosureInput,
    now: Date = new Date(),
  ): Promise<OutOfProcessCaseRecord> {
    // The money already spent, and the Cost Center that bears it, are Finance's to record; the revocation of an account is the IT Admin's; either closes a
    // false alarm or a report (`SBF-07a`, `US-13-05` AC-19, AC-20).
    if (input.outcome === 'RECORD_SPENT' && !actor.roles.includes('FINANCE')) {
      throw new VendorAccountReviewRefusedError('FINANCE_ONLY');
    }
    if (input.outcome === 'REVOKED' && !actor.roles.includes('IT_ADMIN')) {
      throw new VendorAccountReviewRefusedError('IT_ADMIN_ONLY');
    }
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('A case outside the process was closed before installation');

    return this.runner.run(async (tx) => {
      const locked = await this.repo.lockCase(tx, id);
      if (!locked || locked.organizationId !== organization.id)
        throw new VendorAccountReviewRefusedError('CASE_NOT_FOUND');
      if (locked.state === 'CLOSED') throw new VendorAccountReviewRefusedError('CASE_ALREADY_CLOSED');
      this.refuseOnSpend(locked, input);
      const amountMinor = await this.judge(tx, locked, input);
      if (input.outcome === 'RECORD_SPENT') {
        await this.recordSpent(tx, actor, locked, input, amountMinor as bigint, now, organization);
        // The money of a case on a company asset is an act on the open case: the IT Admin can still revoke the account afterwards (`US-13-05` AC-20, AC-25).
        if (locked.companyAsset === true) return this.keepOpen(tx, actor, locked, input, amountMinor as bigint);
      } else if (input.outcome === 'REVOKED') {
        await this.attachProofs(tx, actor, locked, input);
      }
      const closed = await this.repo.closeCase(tx, id, {
        outcome: input.outcome,
        note: input.note.trim(),
        byEmployeeId: actor.employeeId,
        at: now,
        ...this.moneyOf(locked, input, amountMinor),
        renewalCancelled: input.outcome === 'REVOKED',
      });
      await this.log(tx, actor, closed, input);
      if (input.outcome === 'REPORT_ONLY') await this.notifier.caseReported(tx, closed, now);

      return closed;
    });
  }

  /** Money already recorded on the open case is not recorded twice and is no false alarm; the proofs of a revocation come after the proofs of payment. */
  private refuseOnSpend(locked: OutOfProcessCaseRecord, input: OutOfProcessClosureInput): void {
    if (locked.amountMinor === null) return;
    if (input.outcome === 'FALSE_ALARM') throw new VendorAccountReviewRefusedError('SPEND_RECORDED');
    if (input.outcome === 'RECORD_SPENT') throw new VendorAccountReviewRefusedError('SPEND_ALREADY_RECORDED');
    if (locked.documentIds.length + input.documentIds.length > OUT_OF_PROCESS_DOCUMENTS_MAX) {
      throw new VendorAccountReviewRefusedError('DOCUMENT_INVALID', 'TOO_MANY');
    }
  }

  /** The money the closed case carries: what the closing records, or what Finance recorded on the open case (kept as it was, with the proofs of the revocation after it). */
  private moneyOf(
    locked: OutOfProcessCaseRecord,
    input: OutOfProcessClosureInput,
    amountMinor: bigint | null,
  ): { amountMinor: bigint | null; costCenterId: string | null; documentIds: readonly string[] } {
    if (input.outcome === 'RECORD_SPENT') {
      return { amountMinor, costCenterId: input.costCenterId ?? null, documentIds: input.documentIds };
    }
    if (locked.amountMinor === null) return { amountMinor: null, costCenterId: null, documentIds: input.documentIds };

    return {
      amountMinor: locked.amountMinor,
      costCenterId: locked.costCenterId,
      documentIds: [...locked.documentIds, ...input.documentIds],
    };
  }

  /** The money is recorded on the case and the case stays open for the IT Admin to revoke (`US-13-05` AC-20). */
  private async keepOpen(
    tx: Parameters<VendorAccountReviewRepo['lockCase']>[0],
    actor: AuthenticatedPrincipal,
    locked: OutOfProcessCaseRecord,
    input: OutOfProcessClosureInput,
    amountMinor: bigint,
  ): Promise<OutOfProcessCaseRecord> {
    const kept = await this.repo.recordSpend(tx, locked.id, {
      amountMinor,
      costCenterId: input.costCenterId ?? null,
      documentIds: input.documentIds,
    });
    await this.audit.record(
      tx,
      usageAuditEvent(
        actor,
        kept.organizationId,
        'OUT_OF_PROCESS_CASE.SPEND_RECORDED',
        'OutOfProcessCase',
        kept.id,
        { state: 'OPEN' },
        {
          state: 'OPEN',
          amountMinor: amountMinor.toString(),
          costCenterId: kept.costCenterId,
          documentCount: input.documentIds.length,
        },
      ),
    );

    return kept;
  }

  /** What the closing says in money, in minor units, once it stands: the files are not twice the same, the amount is read and the outcome allows what is sent. */
  private async judge(
    tx: Parameters<VendorAccountReviewRepo['lockCase']>[0],
    locked: OutOfProcessCaseRecord,
    input: OutOfProcessClosureInput,
  ): Promise<bigint | null> {
    if (new Set(input.documentIds).size !== input.documentIds.length) {
      throw new VendorAccountReviewRefusedError('DOCUMENT_INVALID', 'DUPLICATE');
    }
    const amountMinor =
      input.amount === undefined
        ? null
        : (await this.finance.parseMoney({ amount: input.amount.amount, currency: 'VND' }, tx)).amountMinor;
    // An amount at or below nothing is out of range like every money field; the policy judges the rest.
    if (amountMinor !== null && amountMinor <= 0n) throw new MoneyOutOfRangeError();
    const refusal = closureRefusal({
      outcome: input.outcome,
      documentCount: input.documentIds.length,
      amountMinor,
      costCenterChosen: input.costCenterId !== undefined,
      hasVendor: locked.vendorId !== null,
      companyAsset: locked.companyAsset,
      renewalCancelled: input.renewalCancelled,
    });
    if (refusal) throw new VendorAccountReviewRefusedError(refusal);

    return amountMinor;
  }

  private async log(
    tx: Parameters<VendorAccountReviewRepo['lockCase']>[0],
    actor: AuthenticatedPrincipal,
    closed: OutOfProcessCaseRecord,
    input: OutOfProcessClosureInput,
  ): Promise<void> {
    await this.audit.record(
      tx,
      usageAuditEvent(
        actor,
        closed.organizationId,
        'OUT_OF_PROCESS_CASE.CLOSED',
        'OutOfProcessCase',
        closed.id,
        { state: 'OPEN' },
        {
          state: 'CLOSED',
          outcome: input.outcome,
          amountMinor: closed.amountMinor === null ? null : closed.amountMinor.toString(),
          costCenterId: closed.costCenterId,
          documentCount: input.documentIds.length,
        },
      ),
    );
  }

  private async recordSpent(
    tx: Parameters<VendorAccountReviewRepo['lockCase']>[0],
    actor: AuthenticatedPrincipal,
    locked: OutOfProcessCaseRecord,
    input: OutOfProcessClosureInput,
    amountMinor: bigint,
    now: Date,
    organization: { id: string; timeZone: string },
  ): Promise<void> {
    const costCenterId = input.costCenterId ?? null;
    if (costCenterId !== null) {
      // The Cost Center in force, held `FOR SHARE` so that it cannot be stopped before the expense is committed (`QĐ-90f`, `US-13-05` AC-19).
      const [found] = await this.organizationReads.lockCostCentersShared(tx, [costCenterId]);
      if (!found || found.status !== 'ACTIVE') throw new VendorAccountReviewRefusedError('COST_CENTER_NOT_FOUND');
    }
    try {
      await this.catalog.attachOutOfProcessCaseDocuments(tx, actor, {
        documentIds: input.documentIds,
        outOfProcessCaseId: locked.id,
      });
      await this.budgets.recordOutOfProcessSpend(tx, actor, {
        organizationId: organization.id,
        caseId: locked.id,
        vendorId: locked.vendorId as string,
        amountMinor,
        costCenterId,
        recordedOn: businessDateAt(now, organization.timeZone),
        now,
      });
    } catch (error) {
      if (error instanceof DocumentAttachRefusedError) {
        throw new VendorAccountReviewRefusedError('DOCUMENT_INVALID', error.problem);
      }
      if (error instanceof OutOfProcessSpendRefusedError) {
        throw new VendorAccountReviewRefusedError(
          error.reason === 'DUPLICATE_NUMBER' ? 'NUMBER_TAKEN' : 'AMOUNT_INVALID',
        );
      }
      throw error;
    }
  }

  /** The proof of the cancellation of the renewal or payment, attached to the case in the transaction of the closing (`US-13-05` AC-25). */
  private async attachProofs(
    tx: Parameters<VendorAccountReviewRepo['lockCase']>[0],
    actor: AuthenticatedPrincipal,
    locked: OutOfProcessCaseRecord,
    input: OutOfProcessClosureInput,
  ): Promise<void> {
    try {
      await this.catalog.attachOutOfProcessCaseDocuments(tx, actor, {
        documentIds: input.documentIds,
        outOfProcessCaseId: locked.id,
      });
    } catch (error) {
      if (error instanceof DocumentAttachRefusedError) {
        throw new VendorAccountReviewRefusedError('DOCUMENT_INVALID', error.problem);
      }
      throw error;
    }
  }
}
