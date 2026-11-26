import { Injectable, Optional } from '@nestjs/common';
import { DONG } from '../../../core/money/money';
import { Prisma } from '../../../generated/prisma/client';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { budgetAuditEvent } from '../budget/budget-facts.service';
import { BudgetYearLockRepo } from '../budget/budget-year-lock.repo';
import { CommitmentRepo, type LockedCommitmentOfRequest } from '../budget/commitment.repo';
import { bookPurchaseInvoice, planInvoice, type PurchaseBooking } from '../budget/invoice.policy';
import { InvoiceRepo } from '../budget/invoice.repo';
import { PurchaseInvoiceRecordRefusedError } from '../public/budgets.errors';
import { LicenseLotInvoiceService } from './license-lot-invoice.service';
import type {
  LotWithdrawalAfterInvoiceInput,
  PurchaseInvoiceRecordInput,
  PurchaseInvoiceRecorded,
  RecordedPurchaseInvoiceInfo,
} from '../public/budgets.types';
import { ThresholdAlertService, type ThresholdWatch } from '../threshold/threshold-alert.service';
import { applyPairYearAllocations, splitK1AnnualInvoice, type K1AllocationLinePlan } from './invoice-allocation.policy';
import { InvoiceAllocationRepo } from './invoice-allocation.repo';
import { InvoiceYearApplicationRepo } from './invoice-year-application.repo';

interface K1GroupPlan {
  year: number;
  costCenterId: string;
  requestId: string | null;
  amountMinor: bigint;
  taxPartMinor: bigint;
  commitment: LockedCommitmentOfRequest | null;
  appliedMinor: bigint;
  taxVarianceMinor: bigint;
}

@Injectable()
export class PurchaseInvoiceRecorderService {
  constructor(
    private readonly commitments: CommitmentRepo,
    private readonly invoices: InvoiceRepo,
    private readonly yearLock: BudgetYearLockRepo,
    private readonly audit: AuditApi,
    private readonly thresholds: ThresholdAlertService,
    private readonly allocations: InvoiceAllocationRepo,
    private readonly yearApplications: InvoiceYearApplicationRepo,
    @Optional() private readonly lotInvoices?: LicenseLotInvoiceService,
  ) {}

  /** Throws PurchaseInvoiceRecordRefusedError. */
  async record(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: PurchaseInvoiceRecordInput,
  ): Promise<PurchaseInvoiceRecorded> {
    this.assertPositiveAmounts(input);
    const lotRecorded = await this.recordLotIfPresent(tx, actor, input);
    if (lotRecorded) return lotRecorded;
    if (this.isK1Annual(input)) return this.recordK1Annual(tx, actor, input);
    const serviceYear = Number(input.serviceMonth.slice(0, 4));
    const { rows, booking } = await this.lockAndBookInvoice(tx, input, serviceYear);

    const watch = await this.watchUse(tx, rows, booking, serviceYear);
    const placed = await this.place(tx, input, rows, booking, serviceYear);
    const actualCostMinor = input.netMinor + input.nonDeductibleTaxMinor;
    const subscriptionId = booking.kind === 'SUBSCRIPTION' ? booking.subscriptionId : null;
    const invoice = await this.insert(tx, {
      organizationId: input.organizationId,
      commitmentId: placed.commitmentId,
      vendorId: input.vendorId,
      number: input.number,
      issuedOn: input.issuedOn,
      currency: DONG,
      netMinor: input.netMinor,
      deductibleTaxMinor: input.deductibleTaxMinor,
      nonDeductibleTaxMinor: input.nonDeductibleTaxMinor,
      actualCostMinor,
      appliedMinor: placed.appliedMinor,
      matchResult: placed.matchResult,
      note: null,
      recordedByEmployeeId: actor.employeeId,
      now: input.now,
      serviceMonth: input.serviceMonth,
      purchaseInvoiceId: input.purchaseInvoiceId,
      subscriptionId,
      costCenterId: placed.costCenterId,
      unallocated: booking.kind === 'UNALLOCATED' ? input.unallocated : null,
      poolFigures: input.poolFigures ?? null,
    });
    if (watch !== null) await this.thresholds.settle(tx, watch, input.now);
    await this.log(tx, actor, input, invoice.id, booking.kind, placed, actualCostMinor);

    return { invoiceId: invoice.id, booking: booking.kind, subscriptionId, actualCostMinor, ...placed };
  }

  /** Resolves an in-review pool variance on the invoice linked to `purchaseInvoiceId`. */
  async markPoolVarianceResolved(tx: DbTx, purchaseInvoiceId: string, resolvedAt?: Date): Promise<boolean> {
    return (await this.invoices.markPoolVarianceResolved(tx, purchaseInvoiceId, resolvedAt)) !== null;
  }

  /** Reads recorded subscription/lot placement and pool-variance details of `purchaseInvoiceId`. */
  async purchaseInvoiceInfo(purchaseInvoiceId: string, tx?: DbTx): Promise<RecordedPurchaseInvoiceInfo | null> {
    const row = await this.invoices.findByPurchaseInvoiceId(purchaseInvoiceId, tx);
    if (!row) return null;

    return {
      subscriptionId: row.subscriptionId,
      poolFigures:
        row.poolVarianceMinor !== null && row.poolVarianceMonth !== null
          ? {
              expectedMinor: row.poolExpectedMinor,
              varianceMinor: row.poolVarianceMinor,
              varianceMonth: row.poolVarianceMonth,
              inReview: row.poolVarianceInReview,
            }
          : null,
    };
  }

  /** Compensates a confirmed `REQUEST` lot invoice on group member withdrawal (`F13c`, `D-16`). */
  recordLotWithdrawalAfterInvoice(tx: DbTx, input: LotWithdrawalAfterInvoiceInput): Promise<void> {
    return this.lotInvoices ? this.lotInvoices.recordLotWithdrawalAfterInvoice(tx, input) : Promise.resolve();
  }

  private async recordLotIfPresent(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: PurchaseInvoiceRecordInput,
  ): Promise<PurchaseInvoiceRecorded | null> {
    if (!input.licenseLotId || !this.lotInvoices) return null;

    return this.lotInvoices.recordLotInvoiceConfirmation(tx, actor, input);
  }

  private async lockAndBookInvoice(tx: DbTx, input: PurchaseInvoiceRecordInput, serviceYear: number) {
    const rows =
      input.requestId !== null && input.subscriptionId === null && input.unallocated === null
        ? await this.commitments.lockOfRequest(tx, input.requestId)
        : [];
    const booking = bookPurchaseInvoice({
      commitments: rows,
      serviceYear,
      chargedCostCenterId: input.chargedCostCenterId,
      subscriptionId: input.subscriptionId,
      unallocated: input.unallocated !== null,
    });
    if (booking.kind === 'UNPLACED') throw new PurchaseInvoiceRecordRefusedError('NO_PLACE');
    if (await this.invoices.exists(tx, input.organizationId, input.vendorId, input.number)) {
      throw new PurchaseInvoiceRecordRefusedError('DUPLICATE_NUMBER');
    }

    return { rows, booking };
  }

  private assertPositiveAmounts(input: PurchaseInvoiceRecordInput): void {
    if (input.netMinor <= 0n || input.deductibleTaxMinor < 0n || input.nonDeductibleTaxMinor < 0n) {
      throw new PurchaseInvoiceRecordRefusedError('AMOUNT_NOT_POSITIVE');
    }
  }

  /**
   * Locks the budget year and reads the use of the Cost Center and year the invoice moves, to tell the threshold it crosses (`RV-2`): the Cost Center of the commitment it takes down, or the one that bears the
   * expense. A line of the subscription or of no Cost Center moves the use of none, and nothing is watched. Neither is a commitment that waits for a budget (attached to no version): with no version there is
   * no base and no threshold, and the year lock taken after the row of that commitment would meet the approval of a version, which holds the year and then takes the rows that wait (FIX-RV23 RV2-03).
   */
  private async watchUse(
    tx: DbTx,
    rows: Awaited<ReturnType<CommitmentRepo['lockOfRequest']>>,
    booking: Exclude<PurchaseBooking, { kind: 'UNPLACED' }>,
    serviceYear: number,
  ): Promise<ThresholdWatch | null> {
    const row =
      booking.kind === 'COMMITMENT' ? rows.find((candidate) => candidate.id === booking.commitmentId) : undefined;
    const pair =
      booking.kind === 'COST_CENTER'
        ? { costCenterId: booking.costCenterId, year: serviceYear }
        : row && row.attachedVersionId !== null
          ? { costCenterId: row.costCenterId, year: row.year }
          : null;

    return pair === null ? null : this.thresholds.watch(tx, [pair]);
  }

  private async log(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: PurchaseInvoiceRecordInput,
    invoiceId: string,
    booking: PurchaseBooking['kind'],
    placed: { commitmentId: string | null; costCenterId: string | null; appliedMinor: bigint; matchResult: string },
    actualCostMinor: bigint,
  ): Promise<void> {
    await this.audit.record(
      tx,
      budgetAuditEvent(actor, input.organizationId, 'INVOICE.RECORDED', 'INVOICE', invoiceId, {
        purchaseInvoiceId: input.purchaseInvoiceId,
        serviceMonth: input.serviceMonth,
        booking,
        commitmentId: placed.commitmentId,
        costCenterId: placed.costCenterId,
        number: input.number,
        netMinor: input.netMinor.toString(),
        deductibleTaxMinor: input.deductibleTaxMinor.toString(),
        nonDeductibleTaxMinor: input.nonDeductibleTaxMinor.toString(),
        actualCostMinor: actualCostMinor.toString(),
        appliedMinor: placed.appliedMinor.toString(),
        matchResult: placed.matchResult,
      }),
    );
  }

  /** Takes the commitment down, or locks the budget year of the Cost Center that bears the expense; what the invoice is matched as follows. */
  private async place(
    tx: DbTx,
    input: PurchaseInvoiceRecordInput,
    rows: Awaited<ReturnType<CommitmentRepo['lockOfRequest']>>,
    booking: Exclude<PurchaseBooking, { kind: 'UNPLACED' }>,
    serviceYear: number,
  ): Promise<{
    commitmentId: string | null;
    costCenterId: string | null;
    appliedMinor: bigint;
    matchResult: PurchaseInvoiceRecorded['matchResult'];
  }> {
    const carriesTax = input.deductibleTaxMinor > 0n || input.nonDeductibleTaxMinor > 0n;
    let placed: Awaited<ReturnType<PurchaseInvoiceRecorderService['place']>> = {
      commitmentId: null,
      costCenterId: null,
      appliedMinor: 0n,
      matchResult: carriesTax ? 'TAX_ONLY' : 'MATCHED',
    };
    if (booking.kind === 'COMMITMENT') {
      const row = rows.find((candidate) => candidate.id === booking.commitmentId);
      if (!row) throw new PurchaseInvoiceRecordRefusedError('NO_PLACE');
      const plan = planInvoice(row, {
        netMinor: input.netMinor,
        deductibleTaxMinor: input.deductibleTaxMinor,
        nonDeductibleTaxMinor: input.nonDeductibleTaxMinor,
      });
      if (!plan.ok) throw new PurchaseInvoiceRecordRefusedError('AMOUNT_NOT_POSITIVE');
      await this.commitments.applyInvoice(tx, row, plan);
      placed = { ...placed, commitmentId: row.id, appliedMinor: plan.takeMinor };
    } else if (booking.kind === 'COST_CENTER') {
      await this.yearLock.lock(tx, booking.costCenterId, [serviceYear]);
      placed = { ...placed, costCenterId: booking.costCenterId };
    }

    return input.matchResult === 'PRICE_QUANTITY_EXCEPTION'
      ? { ...placed, matchResult: 'PRICE_QUANTITY_EXCEPTION' }
      : placed;
  }

  private isK1Annual(input: PurchaseInvoiceRecordInput): boolean {
    return Boolean(input.k1Annual) && input.subscriptionId === null && input.unallocated === null;
  }

  private async recordK1Annual(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: PurchaseInvoiceRecordInput,
  ): Promise<PurchaseInvoiceRecorded> {
    const k1Annual = input.k1Annual as NonNullable<PurchaseInvoiceRecordInput['k1Annual']>;
    const fallbackCc = input.chargedCostCenterId ?? k1Annual.monthAllocations?.[0]?.costCenterId ?? null;
    if (fallbackCc === null) throw new PurchaseInvoiceRecordRefusedError('NO_PLACE');

    const lines = this.splitK1Lines(input, k1Annual, fallbackCc);
    const years = [...new Set(lines.map((line) => line.year))].sort((a, b) => a - b);
    await this.allocations.lockK1AllocationYears(tx, k1Annual.lockSubjectKey, years);

    const commitmentsByRequest = await this.lockK1RequestCommitments(tx, input.requestId, k1Annual);
    if (await this.invoices.exists(tx, input.organizationId, input.vendorId, input.number)) {
      throw new PurchaseInvoiceRecordRefusedError('DUPLICATE_NUMBER');
    }

    const groups = this.buildK1Groups(lines, input.requestId, k1Annual, commitmentsByRequest);
    const watch = await this.watchAndLockK1Groups(tx, groups);
    const totalApplied = await this.applyK1Commitments(tx, groups);

    return this.persistK1AnnualInvoice(tx, actor, input, { lines, groups, watch, totalApplied, fallbackCc });
  }

  private splitK1Lines(
    input: PurchaseInvoiceRecordInput,
    k1Annual: NonNullable<PurchaseInvoiceRecordInput['k1Annual']>,
    fallbackCostCenterId: string,
  ): K1AllocationLinePlan[] {
    return splitK1AnnualInvoice({
      serviceMonth: input.serviceMonth,
      netMinor: input.netMinor,
      nonDeductibleTaxMinor: input.nonDeductibleTaxMinor,
      monthCostCenters: k1Annual.monthAllocations?.map((entry) => ({
        month: entry.month,
        costCenterId: entry.costCenterId,
      })),
      fallbackCostCenterId,
    });
  }

  private k1MatchResult(input: PurchaseInvoiceRecordInput): PurchaseInvoiceRecorded['matchResult'] {
    if (input.matchResult === 'PRICE_QUANTITY_EXCEPTION') return 'PRICE_QUANTITY_EXCEPTION';
    const carriesTax = input.deductibleTaxMinor > 0n || input.nonDeductibleTaxMinor > 0n;

    return carriesTax ? 'TAX_ONLY' : 'MATCHED';
  }

  private async persistK1AnnualInvoice(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: PurchaseInvoiceRecordInput,
    state: {
      lines: readonly K1AllocationLinePlan[];
      groups: readonly K1GroupPlan[];
      watch: ThresholdWatch | null;
      totalApplied: bigint;
      fallbackCc: string;
    },
  ): Promise<PurchaseInvoiceRecorded> {
    const actualCostMinor = input.netMinor + input.nonDeductibleTaxMinor;
    const primaryCommitment = this.pickPrimaryK1Commitment(state.groups, Number(input.serviceMonth.slice(0, 4)));
    const matchResult = this.k1MatchResult(input);
    const booking: PurchaseBooking['kind'] = primaryCommitment ? 'COMMITMENT' : 'COST_CENTER';
    const costCenterId = primaryCommitment ? null : state.fallbackCc;
    const invoice = await this.insert(tx, {
      organizationId: input.organizationId,
      commitmentId: primaryCommitment?.id ?? null,
      vendorId: input.vendorId,
      number: input.number,
      issuedOn: input.issuedOn,
      currency: DONG,
      netMinor: input.netMinor,
      deductibleTaxMinor: input.deductibleTaxMinor,
      nonDeductibleTaxMinor: input.nonDeductibleTaxMinor,
      actualCostMinor,
      appliedMinor: state.totalApplied,
      matchResult,
      note: null,
      recordedByEmployeeId: actor.employeeId,
      now: input.now,
      serviceMonth: input.serviceMonth,
      purchaseInvoiceId: input.purchaseInvoiceId,
      subscriptionId: null,
      costCenterId,
      unallocated: null,
      poolFigures: null,
    });
    await this.writeK1AllocationsAndApplications(tx, invoice.id, state.lines, state.groups);
    if (state.watch !== null) await this.thresholds.settle(tx, state.watch, input.now);
    const placed = {
      commitmentId: primaryCommitment?.id ?? null,
      costCenterId,
      appliedMinor: state.totalApplied,
      matchResult,
    };
    await this.log(tx, actor, input, invoice.id, booking, placed, actualCostMinor);

    return { invoiceId: invoice.id, booking, subscriptionId: null, actualCostMinor, ...placed };
  }

  private async lockK1RequestCommitments(
    tx: DbTx,
    primaryRequestId: string | null,
    k1Annual: NonNullable<PurchaseInvoiceRecordInput['k1Annual']>,
  ): Promise<Map<string, LockedCommitmentOfRequest[]>> {
    const requestIds = [
      ...new Set(
        [primaryRequestId, ...(k1Annual.monthAllocations?.map((entry) => entry.requestId) ?? [])].filter(
          (id): id is string => id !== null,
        ),
      ),
    ].sort();
    const map = new Map<string, LockedCommitmentOfRequest[]>();
    for (const reqId of requestIds) {
      map.set(reqId, await this.commitments.lockOfRequest(tx, reqId));
    }

    return map;
  }

  private buildK1Groups(
    lines: readonly K1AllocationLinePlan[],
    primaryRequestId: string | null,
    k1Annual: NonNullable<PurchaseInvoiceRecordInput['k1Annual']>,
    commitmentsByRequest: ReadonlyMap<string, LockedCommitmentOfRequest[]>,
  ): K1GroupPlan[] {
    const requestByMonth = new Map(
      (k1Annual.monthAllocations ?? []).map((entry) => [entry.month, entry.requestId ?? primaryRequestId]),
    );
    const grouped = new Map<string, K1GroupPlan>();
    for (const line of lines) {
      const reqId = requestByMonth.get(line.month) ?? primaryRequestId;
      const key = `${line.year}:${line.costCenterId}:${reqId ?? ''}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.amountMinor += line.amountMinor;
        existing.taxPartMinor += line.taxPartMinor;
        continue;
      }
      const rows = reqId ? (commitmentsByRequest.get(reqId) ?? []) : [];
      const commitment =
        rows.find((c) => c.year === line.year && c.costCenterId === line.costCenterId && c.state !== 'RELEASED') ??
        null;
      grouped.set(key, {
        year: line.year,
        costCenterId: line.costCenterId,
        requestId: reqId,
        amountMinor: line.amountMinor,
        taxPartMinor: line.taxPartMinor,
        commitment,
        appliedMinor: 0n,
        taxVarianceMinor: 0n,
      });
    }

    const sorted = [...grouped.values()].sort(
      (a, b) => a.year - b.year || a.costCenterId.localeCompare(b.costCenterId),
    );
    for (const group of sorted) {
      const c = group.commitment;
      const available = c && c.state === 'HELD' ? c.amountMinor - c.releasedMinor - c.appliedMinor : 0n;
      const outcome = applyPairYearAllocations({
        pairYearMinor: group.amountMinor,
        pairYearTaxPartMinor: group.taxPartMinor,
        availableCommitmentMinor: available,
      });
      group.appliedMinor = outcome.appliedMinor;
      group.taxVarianceMinor = outcome.taxVarianceMinor;
    }

    return sorted;
  }

  private async watchAndLockK1Groups(tx: DbTx, groups: readonly K1GroupPlan[]): Promise<ThresholdWatch | null> {
    const watchPairs = new Map<string, { costCenterId: string; year: number }>();
    const unbackedYears = new Map<string, number[]>();
    for (const group of groups) {
      if (group.commitment === null) {
        watchPairs.set(`${group.costCenterId}:${group.year}`, { costCenterId: group.costCenterId, year: group.year });
        const list = unbackedYears.get(group.costCenterId) ?? [];
        if (!list.includes(group.year)) list.push(group.year);
        unbackedYears.set(group.costCenterId, list);
      } else if (group.commitment.attachedVersionId !== null) {
        watchPairs.set(`${group.costCenterId}:${group.year}`, { costCenterId: group.costCenterId, year: group.year });
      }
    }
    const orderedPairs = [...watchPairs.values()].sort(
      (a, b) => a.costCenterId.localeCompare(b.costCenterId) || a.year - b.year,
    );
    const watch = orderedPairs.length > 0 ? await this.thresholds.watch(tx, orderedPairs) : null;
    for (const costCenterId of [...unbackedYears.keys()].sort()) {
      await this.yearLock.lock(tx, costCenterId, unbackedYears.get(costCenterId) ?? []);
    }

    return watch;
  }

  private async applyK1Commitments(tx: DbTx, groups: readonly K1GroupPlan[]): Promise<bigint> {
    let totalApplied = 0n;
    for (const group of groups) {
      const c = group.commitment;
      if (!c || group.appliedMinor <= 0n || c.state !== 'HELD') continue;
      const remaining = c.amountMinor - c.releasedMinor - c.appliedMinor - group.appliedMinor;
      const stateAfter = remaining <= 0n ? 'EXPENSED' : 'HELD';
      await this.commitments.applyInvoice(tx, c, { takeMinor: group.appliedMinor, stateAfter });
      c.appliedMinor += group.appliedMinor;
      c.state = stateAfter;
      totalApplied += group.appliedMinor;
    }

    return totalApplied;
  }

  private pickPrimaryK1Commitment(
    groups: readonly K1GroupPlan[],
    serviceYear: number,
  ): LockedCommitmentOfRequest | null {
    return (
      groups.find((g) => g.year === serviceYear && g.commitment !== null)?.commitment ??
      groups.find((g) => g.commitment !== null)?.commitment ??
      null
    );
  }

  private async writeK1AllocationsAndApplications(
    tx: DbTx,
    invoiceId: string,
    lines: readonly K1AllocationLinePlan[],
    groups: readonly K1GroupPlan[],
  ): Promise<void> {
    const commitmentByYearCc = new Map(
      groups.map((group) => [`${group.year}:${group.costCenterId}`, group.commitment?.id ?? null]),
    );
    await this.allocations.insertMany(
      tx,
      lines.map((line) => ({
        invoiceId,
        month: line.month,
        amountMinor: line.amountMinor,
        taxPartMinor: line.taxPartMinor,
        bucket: 'COST_CENTER',
        costCenterId: line.costCenterId,
        commitmentId: commitmentByYearCc.get(`${line.year}:${line.costCenterId}`) ?? null,
        kind: 'ORIGINAL',
      })),
    );
    for (const group of groups) {
      if (group.commitment === null || (group.appliedMinor === 0n && group.taxVarianceMinor === 0n)) continue;
      await this.yearApplications.insert(tx, {
        invoiceId,
        year: group.year,
        costCenterId: group.costCenterId,
        commitmentId: group.commitment.id,
        source: 'CONFIRMATION',
        appliedMinor: group.appliedMinor,
        taxVarianceMinor: group.taxVarianceMinor,
      });
    }
  }

  /** A second invoice with the same number from the same vendor loses the race at the unique index and is told so. */
  private async insert(tx: DbTx, input: Parameters<InvoiceRepo['insert']>[1]) {
    try {
      return await this.invoices.insert(tx, input);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new PurchaseInvoiceRecordRefusedError('DUPLICATE_NUMBER');
      }
      throw error;
    }
  }
}
