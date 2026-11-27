import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CommitmentRepo } from '../budget/commitment.repo';
import type { K1YearStartApplyInput } from '../public/budgets.types';
import { applyPairYearAllocations, summarizeActiveCostCenterAllocations } from './invoice-allocation.policy';
import { InvoiceAllocationRepo } from './invoice-allocation.repo';
import { InvoiceYearApplicationRepo } from './invoice-year-application.repo';

/**
 * Applies existing K1 annual `invoice_allocations` immediately inside the 01/01 year-start commitment pass (`K-A1`, `N3`, `F9(c)`):
 * prevents holding already-paid spend in the new year and transitions fully covered commitments to `EXPENSED`.
 */
@Injectable()
export class K1YearStartApplicationService {
  constructor(
    private readonly commitments: CommitmentRepo,
    private readonly allocations: InvoiceAllocationRepo,
    private readonly yearApplications: InvoiceYearApplicationRepo,
  ) {}

  async lockK1AllocationYears(tx: DbTx, subjectKeys: readonly string[], years: readonly number[]): Promise<void> {
    const sortedKeys = [...new Set(subjectKeys)].sort();
    const sortedYears = [...new Set(years)].sort((a, b) => a - b);
    for (const key of sortedKeys) {
      await this.allocations.lockK1AllocationYears(tx, key, sortedYears);
    }
  }

  async applyYearStart(tx: DbTx, input: K1YearStartApplyInput): Promise<void> {
    for (const item of input.items) {
      if (item.invoiceIds.length > 0) await this.applyItemYearStart(tx, input.year, item);
    }
  }

  private async applyItemYearStart(
    tx: DbTx,
    year: number,
    item: K1YearStartApplyInput['items'][number],
  ): Promise<void> {
    const commitment = await this.commitments.lockById(tx, item.commitmentId);
    if (!commitment || commitment.state !== 'HELD') return;

    let available = commitment.amountMinor - commitment.releasedMinor - commitment.appliedMinor;
    if (available <= 0n) return;

    const summary = summarizeActiveCostCenterAllocations(await this.allocations.ofInvoices(item.invoiceIds, tx));
    const existingApps = await this.yearApplications.ofInvoices(item.invoiceIds, tx);
    let totalApplied = 0n;

    for (const invoiceId of item.invoiceIds) {
      const delta = await this.applyInvoiceShare(tx, {
        invoiceId,
        year,
        costCenterId: item.costCenterId,
        commitmentId: commitment.id,
        available,
        summary,
        existingApps,
      });
      available -= delta;
      totalApplied += delta;
    }

    if (totalApplied > 0n) {
      const stateAfter = available <= 0n ? 'EXPENSED' : 'HELD';
      await this.commitments.applyInvoice(tx, commitment, { takeMinor: totalApplied, stateAfter });
    }
  }

  private async applyInvoiceShare(
    tx: DbTx,
    params: {
      invoiceId: string;
      year: number;
      costCenterId: string;
      commitmentId: string;
      available: bigint;
      summary: ReturnType<typeof summarizeActiveCostCenterAllocations>;
      existingApps: Awaited<ReturnType<InvoiceYearApplicationRepo['ofInvoices']>>;
    },
  ): Promise<bigint> {
    const entry = params.summary.get(`${params.invoiceId}:${params.year}:${params.costCenterId}`);
    if (!entry) return 0n;

    let priorApplied = 0n;
    let priorTaxVar = 0n;
    for (const app of params.existingApps) {
      if (app.invoiceId === params.invoiceId && app.year === params.year && app.costCenterId === params.costCenterId) {
        priorApplied += app.appliedMinor;
        priorTaxVar += app.taxVarianceMinor;
      }
    }
    const remainingAlloc = entry.amountMinor - priorApplied;
    const remainingTax = entry.taxPartMinor > priorTaxVar ? entry.taxPartMinor - priorTaxVar : 0n;
    if (remainingAlloc <= 0n) return 0n;

    const outcome = applyPairYearAllocations({
      pairYearMinor: remainingAlloc,
      pairYearTaxPartMinor: remainingTax,
      availableCommitmentMinor: params.available,
    });
    if (outcome.appliedMinor > 0n || outcome.taxVarianceMinor > 0n) {
      await this.yearApplications.insert(tx, {
        invoiceId: params.invoiceId,
        year: params.year,
        costCenterId: params.costCenterId,
        commitmentId: params.commitmentId,
        source: 'YEAR_START',
        appliedMinor: outcome.appliedMinor,
        taxVarianceMinor: outcome.taxVarianceMinor,
      });
    }

    return outcome.appliedMinor;
  }
}
