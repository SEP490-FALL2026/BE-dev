import { Injectable } from '@nestjs/common';
import { fiscalYearOf } from '../../../core/fiscal-year';
import { k1RemainingBillingStart } from '../../../core/term-limit';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CommitmentRepo, type LockedCommitmentOfRequest } from '../budget/commitment.repo';
import type { K1TransferAllocationInput } from '../public/budgets.types';
import {
  applyPairYearAllocations,
  planK1TransferAllocationOffsets,
  summarizeActiveCostCenterAllocations,
  type K1TransferAllocationOffsetPlan,
} from './invoice-allocation.policy';
import { InvoiceAllocationRepo, type InvoiceAllocationRecord } from './invoice-allocation.repo';
import { InvoiceYearApplicationRepo, type InvoiceYearApplicationRecord } from './invoice-year-application.repo';

/**
 * Transfers remaining K1 annual invoice allocations between Cost Centers on replacement (`F8`):
 * writes offsetting `TRANSFER_OUT`/`TRANSFER_IN` allocation lines, updates `invoice_year_applications`,
 * applies moved allocations to the new Request's commitment, and enforces `D-16` on old commitments.
 */
@Injectable()
export class InvoiceAllocationTransferService {
  constructor(
    private readonly commitments: CommitmentRepo,
    private readonly allocations: InvoiceAllocationRepo,
    private readonly yearApplications: InvoiceYearApplicationRepo,
  ) {}

  async transfer(tx: DbTx, input: K1TransferAllocationInput): Promise<{ transferredMinor: bigint }> {
    if (input.invoiceIds.length === 0 || input.oldCostCenterId === input.newCostCenterId) {
      return { transferredMinor: 0n };
    }

    const startDay = k1RemainingBillingStart(input.billingAnchorOn, input.endedOn);
    const transferStartMonth = `${startDay.slice(0, 7)}-01`;
    const baseYear = fiscalYearOf(transferStartMonth);
    await this.allocations.lockK1AllocationYears(tx, input.lockSubjectKey, [baseYear, baseYear + 1]);

    const existingLines = await this.allocations.ofInvoices(input.invoiceIds, tx);
    const plan = planK1TransferAllocationOffsets({
      transferStartMonth,
      oldCostCenterId: input.oldCostCenterId,
      newCostCenterId: input.newCostCenterId,
      existingLines,
    });
    if (plan.offsets.length === 0) return { transferredMinor: 0n };

    const commitmentsByRequest = await this.lockCommitments(tx, input.oldRequestIds, input.newRequestId);
    const existingApps = await this.yearApplications.ofInvoices(input.invoiceIds, tx);

    const insertedOffsets = await this.allocations.insertMany(
      tx,
      plan.offsets.map((offset) => ({
        ...offset,
        commitmentId: this.commitmentForOffset(offset, commitmentsByRequest, input),
      })),
    );
    const postSummary = summarizeActiveCostCenterAllocations([...existingLines, ...insertedOffsets]);

    for (const moved of plan.movedByInvoiceYear) {
      await this.reconcileOldCostCenter(
        tx,
        moved,
        input,
        commitmentsByRequest,
        existingLines,
        insertedOffsets,
        existingApps,
        postSummary,
      );
      await this.applyNewCostCenter(tx, moved, input, commitmentsByRequest, existingApps, postSummary);
    }

    return {
      transferredMinor: plan.movedByInvoiceYear.reduce((sum, item) => sum + item.movedAmountMinor, 0n),
    };
  }

  private async lockCommitments(
    tx: DbTx,
    oldRequestIds: readonly string[],
    newRequestId: string | null,
  ): Promise<Map<string, LockedCommitmentOfRequest[]>> {
    const ids = [...new Set([...oldRequestIds, ...(newRequestId ? [newRequestId] : [])])].sort();
    const map = new Map<string, LockedCommitmentOfRequest[]>();
    for (const reqId of ids) {
      map.set(reqId, await this.commitments.lockOfRequest(tx, reqId));
    }

    return map;
  }

  private commitmentForOffset(
    offset: K1TransferAllocationOffsetPlan,
    commitmentsByRequest: ReadonlyMap<string, LockedCommitmentOfRequest[]>,
    input: K1TransferAllocationInput,
  ): string | null {
    const year = fiscalYearOf(offset.month);
    if (offset.kind === 'TRANSFER_IN' && input.newRequestId) {
      return (
        (commitmentsByRequest.get(input.newRequestId) ?? []).find(
          (c) => c.year === year && c.costCenterId === input.newCostCenterId && c.state !== 'RELEASED',
        )?.id ?? null
      );
    }
    return this.findOldCommitment(year, input.oldCostCenterId, input.oldRequestIds, commitmentsByRequest)?.id ?? null;
  }

  private findOldCommitment(
    year: number,
    costCenterId: string,
    oldRequestIds: readonly string[],
    commitmentsByRequest: ReadonlyMap<string, LockedCommitmentOfRequest[]>,
  ): LockedCommitmentOfRequest | null {
    for (const reqId of oldRequestIds) {
      const found = (commitmentsByRequest.get(reqId) ?? []).find(
        (c) => c.year === year && c.costCenterId === costCenterId && c.state !== 'RELEASED',
      );
      if (found) return found;
    }

    return null;
  }

  private async reconcileOldCostCenter(
    tx: DbTx,
    moved: { invoiceId: string; year: number; movedAmountMinor: bigint; movedTaxPartMinor: bigint },
    input: K1TransferAllocationInput,
    commitmentsByRequest: ReadonlyMap<string, LockedCommitmentOfRequest[]>,
    existingLines: readonly InvoiceAllocationRecord[],
    insertedOffsets: readonly InvoiceAllocationRecord[],
    existingApps: readonly InvoiceYearApplicationRecord[],
    postSummary: ReturnType<typeof summarizeActiveCostCenterAllocations>,
  ): Promise<void> {
    const oldCommitment = this.findOldCommitment(
      moved.year,
      input.oldCostCenterId,
      input.oldRequestIds,
      commitmentsByRequest,
    );
    const split = countOldAllocationSplit(
      existingLines,
      insertedOffsets,
      moved.invoiceId,
      moved.year,
      input.oldCostCenterId,
    );
    const perMonth = perMonthCapacityOf(oldCommitment, split.totalCount);
    const releaseTarget =
      perMonth > 0n ? perMonth * BigInt(split.movedCount) : moved.movedAmountMinor - moved.movedTaxPartMinor;

    await this.recordOldCostCenterDelta(
      tx,
      moved,
      input,
      oldCommitment,
      existingApps,
      postSummary,
      perMonth,
      split.retainedCount,
    );
    await this.releaseOldCommitmentIfHeld(tx, oldCommitment, releaseTarget, input);
  }

  private async recordOldCostCenterDelta(
    tx: DbTx,
    moved: { invoiceId: string; year: number },
    input: K1TransferAllocationInput,
    oldCommitment: LockedCommitmentOfRequest | null,
    existingApps: readonly InvoiceYearApplicationRecord[],
    postSummary: ReturnType<typeof summarizeActiveCostCenterAllocations>,
    perMonth: bigint,
    retainedCount: number,
  ): Promise<void> {
    if (!oldCommitment) return;
    const prior = sumPriorApplications(existingApps, moved.invoiceId, moved.year, input.oldCostCenterId);
    if (prior.appliedMinor <= 0n) return;

    const oldPost = postSummary.get(`${moved.invoiceId}:${moved.year}:${input.oldCostCenterId}`) ?? {
      amountMinor: 0n,
      taxPartMinor: 0n,
    };
    const retainedCap = perMonth * BigInt(retainedCount);
    const targetAvail = prior.appliedMinor < retainedCap ? prior.appliedMinor : retainedCap;
    const oldOutcome = applyPairYearAllocations({
      pairYearMinor: oldPost.amountMinor,
      pairYearTaxPartMinor: oldPost.taxPartMinor,
      availableCommitmentMinor: targetAvail,
    });
    const deltaApplied = oldOutcome.appliedMinor - prior.appliedMinor;
    const deltaTaxVar = oldOutcome.taxVarianceMinor - prior.taxVarianceMinor;
    if (deltaApplied === 0n && deltaTaxVar === 0n) return;

    await this.yearApplications.insert(tx, {
      invoiceId: moved.invoiceId,
      year: moved.year,
      costCenterId: input.oldCostCenterId,
      commitmentId: oldCommitment.id,
      source: 'TRANSFER',
      appliedMinor: deltaApplied,
      taxVarianceMinor: deltaTaxVar,
    });
  }

  private async releaseOldCommitmentIfHeld(
    tx: DbTx,
    oldCommitment: LockedCommitmentOfRequest | null,
    releaseTarget: bigint,
    input: K1TransferAllocationInput,
  ): Promise<void> {
    // D-16: budget_commitments_guard() blocks updating EXPENSED commitments or decreasing applied_minor without a migration.
    // Only release TRANSFER_EFFECTIVE when oldCommitment is still HELD with heldMinor > 0n; skip UPDATE when EXPENSED.
    if (!oldCommitment || oldCommitment.state !== 'HELD') return;
    const heldMinor = oldCommitment.amountMinor - oldCommitment.releasedMinor - oldCommitment.appliedMinor;
    const takeMinor = heldMinor < releaseTarget ? heldMinor : releaseTarget;
    if (takeMinor <= 0n) return;

    await this.commitments.release(tx, oldCommitment, {
      takeMinor,
      reason: 'TRANSFER_EFFECTIVE',
      reasonText: input.reference,
      releasedByEmployeeId: null,
      now: input.now,
    });
    oldCommitment.releasedMinor += takeMinor;
  }

  private async applyNewCostCenter(
    tx: DbTx,
    moved: { invoiceId: string; year: number; movedAmountMinor: bigint; movedTaxPartMinor: bigint },
    input: K1TransferAllocationInput,
    commitmentsByRequest: ReadonlyMap<string, LockedCommitmentOfRequest[]>,
    existingApps: readonly InvoiceYearApplicationRecord[],
    postSummary: ReturnType<typeof summarizeActiveCostCenterAllocations>,
  ): Promise<void> {
    if (!input.newRequestId) return;
    const newCommitment = (commitmentsByRequest.get(input.newRequestId) ?? []).find(
      (c) => c.year === moved.year && c.costCenterId === input.newCostCenterId && c.state !== 'RELEASED',
    );
    if (!newCommitment) return;

    const { outcome, available } = planNewCostCenterOutcome(
      moved,
      input.newCostCenterId,
      newCommitment,
      existingApps,
      postSummary,
    );
    if (outcome.appliedMinor > 0n || outcome.taxVarianceMinor > 0n) {
      await this.yearApplications.insert(tx, {
        invoiceId: moved.invoiceId,
        year: moved.year,
        costCenterId: input.newCostCenterId,
        commitmentId: newCommitment.id,
        source: 'TRANSFER',
        appliedMinor: outcome.appliedMinor,
        taxVarianceMinor: outcome.taxVarianceMinor,
      });
    }
    if (outcome.appliedMinor > 0n && newCommitment.state === 'HELD') {
      const stateAfter = available - outcome.appliedMinor <= 0n ? 'EXPENSED' : 'HELD';
      await this.commitments.applyInvoice(tx, newCommitment, { takeMinor: outcome.appliedMinor, stateAfter });
      newCommitment.appliedMinor += outcome.appliedMinor;
      newCommitment.state = stateAfter;
    }
  }
}

function sumPriorApplications(
  apps: readonly InvoiceYearApplicationRecord[],
  invoiceId: string,
  year: number,
  costCenterId: string,
): { appliedMinor: bigint; taxVarianceMinor: bigint } {
  let appliedMinor = 0n;
  let taxVarianceMinor = 0n;
  for (const app of apps) {
    if (app.invoiceId === invoiceId && app.year === year && app.costCenterId === costCenterId) {
      appliedMinor += app.appliedMinor;
      taxVarianceMinor += app.taxVarianceMinor;
    }
  }

  return { appliedMinor, taxVarianceMinor };
}

function countOldAllocationSplit(
  existingLines: readonly InvoiceAllocationRecord[],
  insertedOffsets: readonly InvoiceAllocationRecord[],
  invoiceId: string,
  year: number,
  oldCostCenterId: string,
) {
  const movedCount = insertedOffsets.filter(
    (l) => l.invoiceId === invoiceId && fiscalYearOf(l.month) === year && l.kind === 'TRANSFER_OUT',
  ).length;
  const activeOldLines = existingLines.filter(
    (l) =>
      l.invoiceId === invoiceId &&
      fiscalYearOf(l.month) === year &&
      l.bucket === 'COST_CENTER' &&
      l.costCenterId === oldCostCenterId &&
      (l.kind === 'ORIGINAL' || l.kind === 'TRANSFER_IN'),
  ).length;
  const retainedCount = Math.max(0, activeOldLines - movedCount);

  return { movedCount, retainedCount, totalCount: retainedCount + movedCount };
}

function perMonthCapacityOf(oldCommitment: LockedCommitmentOfRequest | null, totalCount: number): bigint {
  if (!oldCommitment) return 0n;
  if (oldCommitment.seatMonthlyMinor !== null) return oldCommitment.seatMonthlyMinor;

  return totalCount > 0 ? oldCommitment.amountMinor / BigInt(totalCount) : 0n;
}

function planNewCostCenterOutcome(
  moved: { invoiceId: string; year: number; movedAmountMinor: bigint; movedTaxPartMinor: bigint },
  newCostCenterId: string,
  newCommitment: LockedCommitmentOfRequest,
  existingApps: readonly InvoiceYearApplicationRecord[],
  postSummary: ReturnType<typeof summarizeActiveCostCenterAllocations>,
) {
  const newPost = postSummary.get(`${moved.invoiceId}:${moved.year}:${newCostCenterId}`) ?? {
    amountMinor: moved.movedAmountMinor,
    taxPartMinor: moved.movedTaxPartMinor,
  };
  const prior = sumPriorApplications(existingApps, moved.invoiceId, moved.year, newCostCenterId);
  const remainingAmount = newPost.amountMinor - prior.appliedMinor;
  const remainingTax =
    newPost.taxPartMinor > prior.taxVarianceMinor ? newPost.taxPartMinor - prior.taxVarianceMinor : 0n;
  const available =
    newCommitment.state === 'HELD'
      ? newCommitment.amountMinor - newCommitment.releasedMinor - newCommitment.appliedMinor
      : 0n;
  const outcome = applyPairYearAllocations({
    pairYearMinor: remainingAmount > 0n ? remainingAmount : 0n,
    pairYearTaxPartMinor: remainingTax,
    availableCommitmentMinor: available,
  });

  return { outcome, available };
}
