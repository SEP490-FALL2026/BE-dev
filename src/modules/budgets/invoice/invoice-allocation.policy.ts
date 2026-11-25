import type { BusinessDate } from '../../../core/business-date';
import { addMonths, fiscalYearOf } from '../../../core/fiscal-year';
import { roundHalfAway } from '../../../core/seat-month-cost';
import type {
  InvoiceAllocationBucket,
  InvoiceAllocationKind,
  InvoiceAllocationRecord,
} from './invoice-allocation.repo';

export const K1_ANNUAL_PERIODS = 12;

export interface K1AllocationLinePlan {
  readonly month: BusinessDate;
  readonly year: number;
  readonly costCenterId: string;
  readonly amountMinor: bigint;
  readonly taxPartMinor: bigint;
}

export interface K1TransferAllocationOffsetPlan {
  readonly invoiceId: string;
  readonly month: BusinessDate;
  readonly bucket: InvoiceAllocationBucket;
  readonly costCenterId: string;
  readonly amountMinor: bigint;
  readonly taxPartMinor: bigint;
  readonly kind: Extract<InvoiceAllocationKind, 'TRANSFER_OUT' | 'TRANSFER_IN'>;
  readonly adjustsAllocationId: string;
}

export interface K1MovedInvoiceYearTotal {
  readonly invoiceId: string;
  readonly year: number;
  readonly movedAmountMinor: bigint;
  readonly movedTaxPartMinor: bigint;
}

export interface PairYearApplicationOutcome {
  readonly appliedMinor: bigint;
  readonly excessMinor: bigint;
  readonly taxVarianceMinor: bigint;
  readonly uncommittedExcessMinor: bigint;
}

/** Calendar-month starts (`YYYY-MM-01`) for the 12 periods beginning at the invoice's own `serviceMonth`. */
export function deriveK1AllocationMonths(serviceMonth: BusinessDate): BusinessDate[] {
  return Array.from({ length: K1_ANNUAL_PERIODS }, (_, index) => addMonths(serviceMonth, index));
}

function splitTwelvePeriods(totalMinor: bigint): bigint[] {
  const count = BigInt(K1_ANNUAL_PERIODS);
  const rounded = roundHalfAway(totalMinor, count);
  const base = rounded * 11n > totalMinor ? totalMinor / count : rounded;
  const remainder = totalMinor - base * 11n;

  return [...Array.from({ length: 11 }, () => base), remainder];
}

/** Splits an annual K1 invoice evenly across 12 months (`roundHalfAway` for 1..11, remainder on period 12). */
export function splitK1AnnualInvoice(input: {
  serviceMonth: BusinessDate;
  netMinor: bigint;
  nonDeductibleTaxMinor: bigint;
  monthCostCenters?: readonly { month: BusinessDate; costCenterId: string }[];
  fallbackCostCenterId: string;
}): K1AllocationLinePlan[] {
  const months = deriveK1AllocationMonths(input.serviceMonth);
  const actualParts = splitTwelvePeriods(input.netMinor + input.nonDeductibleTaxMinor);
  const taxParts = splitTwelvePeriods(input.nonDeductibleTaxMinor);
  const ccByMonth = new Map((input.monthCostCenters ?? []).map((entry) => [entry.month, entry.costCenterId]));

  return months.map((month, index) => ({
    month,
    year: fiscalYearOf(month),
    costCenterId: ccByMonth.get(month) ?? input.fallbackCostCenterId,
    amountMinor: actualParts[index] ?? 0n,
    taxPartMinor: taxParts[index] ?? 0n,
  }));
}

/** Applies an `(invoice, year)` allocation total against available commitment and classifies excess vs tax variance. */
export function applyPairYearAllocations(input: {
  pairYearMinor: bigint;
  pairYearTaxPartMinor: bigint;
  availableCommitmentMinor: bigint;
}): PairYearApplicationOutcome {
  const available = input.availableCommitmentMinor > 0n ? input.availableCommitmentMinor : 0n;
  const appliedMinor = input.pairYearMinor <= available ? input.pairYearMinor : available;
  const excessMinor = input.pairYearMinor - appliedMinor;
  const taxVarianceMinor = excessMinor <= input.pairYearTaxPartMinor ? excessMinor : input.pairYearTaxPartMinor;

  return {
    appliedMinor,
    excessMinor,
    taxVarianceMinor,
    uncommittedExcessMinor: excessMinor - taxVarianceMinor,
  };
}

/** Groups active `COST_CENTER` allocation amounts and tax parts by `(invoiceId, year, costCenterId)`, excluding reversed source lines. */
export function summarizeActiveCostCenterAllocations(lines: readonly InvoiceAllocationRecord[]): Map<
  string,
  {
    invoiceId: string;
    year: number;
    costCenterId: string;
    amountMinor: bigint;
    taxPartMinor: bigint;
  }
> {
  const reversedIds = new Set(
    lines
      .filter((line) => line.kind === 'TRANSFER_OUT' && line.adjustsAllocationId !== null)
      .map((line) => line.adjustsAllocationId as string),
  );
  const summary = new Map<
    string,
    { invoiceId: string; year: number; costCenterId: string; amountMinor: bigint; taxPartMinor: bigint }
  >();

  for (const line of lines) {
    if (line.bucket !== 'COST_CENTER' || line.costCenterId === null) continue;
    const year = fiscalYearOf(line.month);
    const key = `${line.invoiceId}:${year}:${line.costCenterId}`;
    const current = summary.get(key) ?? {
      invoiceId: line.invoiceId,
      year,
      costCenterId: line.costCenterId,
      amountMinor: 0n,
      taxPartMinor: 0n,
    };
    const activeTax = line.kind === 'TRANSFER_OUT' || reversedIds.has(line.id) ? 0n : line.taxPartMinor;
    summary.set(key, {
      ...current,
      amountMinor: current.amountMinor + line.amountMinor,
      taxPartMinor: current.taxPartMinor + activeTax,
    });
  }

  return summary;
}

/** Builds offsetting `TRANSFER_OUT` / `TRANSFER_IN` allocation lines for remaining months at or after `transferStartMonth`. */
export function planK1TransferAllocationOffsets(input: {
  transferStartMonth: BusinessDate;
  oldCostCenterId: string;
  newCostCenterId: string;
  existingLines: readonly InvoiceAllocationRecord[];
}): { offsets: K1TransferAllocationOffsetPlan[]; movedByInvoiceYear: K1MovedInvoiceYearTotal[] } {
  if (input.oldCostCenterId === input.newCostCenterId) return { offsets: [], movedByInvoiceYear: [] };

  const reversedIds = new Set(
    input.existingLines
      .filter((line) => line.kind === 'TRANSFER_OUT' && line.adjustsAllocationId !== null)
      .map((line) => line.adjustsAllocationId as string),
  );

  const offsets: K1TransferAllocationOffsetPlan[] = [];
  const movedMap = new Map<string, K1MovedInvoiceYearTotal>();

  for (const line of input.existingLines) {
    if (!isTransferableLine(line, input.oldCostCenterId, input.transferStartMonth, reversedIds)) continue;

    offsets.push(
      {
        invoiceId: line.invoiceId,
        month: line.month,
        bucket: 'COST_CENTER',
        costCenterId: input.oldCostCenterId,
        amountMinor: -line.amountMinor,
        taxPartMinor: 0n,
        kind: 'TRANSFER_OUT',
        adjustsAllocationId: line.id,
      },
      {
        invoiceId: line.invoiceId,
        month: line.month,
        bucket: 'COST_CENTER',
        costCenterId: input.newCostCenterId,
        amountMinor: line.amountMinor,
        taxPartMinor: line.taxPartMinor,
        kind: 'TRANSFER_IN',
        adjustsAllocationId: line.id,
      },
    );

    const year = fiscalYearOf(line.month);
    const key = `${line.invoiceId}:${year}`;
    const prev = movedMap.get(key) ?? { invoiceId: line.invoiceId, year, movedAmountMinor: 0n, movedTaxPartMinor: 0n };
    movedMap.set(key, {
      ...prev,
      movedAmountMinor: prev.movedAmountMinor + line.amountMinor,
      movedTaxPartMinor: prev.movedTaxPartMinor + line.taxPartMinor,
    });
  }

  return { offsets, movedByInvoiceYear: [...movedMap.values()] };
}

function isTransferableLine(
  line: InvoiceAllocationRecord,
  oldCostCenterId: string,
  transferStartMonth: BusinessDate,
  reversedIds: ReadonlySet<string>,
): boolean {
  return (
    line.bucket === 'COST_CENTER' &&
    line.costCenterId === oldCostCenterId &&
    line.month >= transferStartMonth &&
    (line.kind === 'ORIGINAL' || line.kind === 'TRANSFER_IN') &&
    line.amountMinor > 0n &&
    !reversedIds.has(line.id)
  );
}
