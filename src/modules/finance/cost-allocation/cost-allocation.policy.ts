import { RateMalformedError, RateOutOfRangeError, RateScaleExceededError } from '../../../core/money/money.errors';
import { formatRatePercent, parseRatePercent } from '../../../core/money/tax-estimate';
import type { CostCenterBrief } from '../../organization/organization.types';
import {
  CostAllocationCostCenterDuplicateError,
  CostAllocationLineCountError,
  CostAllocationRatioInvalidError,
  CostAllocationTotalError,
} from '../finance.errors';
import type { AllocationLineInput, CostAllocationView } from '../finance.types';
import type { AllocationLineRecord, AllocationVersion } from './cost-allocation.types';

/** 100% in hundredths of a percent: the shares of an allocation add up to exactly this (`INV-03`). */
export const ALLOCATION_TOTAL_BP = 10000;
export const MAX_ALLOCATION_LINES = 20;

/**
 * The lines as they are kept: from 1 to 20, each share above 0 and up to 100 with at most two decimals (read as
 * hundredths of a percent), no Cost Center twice, adding up to exactly 100%. Checked in that order, so a total is
 * only judged on lines that are each valid. The lines come back in the order of their Cost Center ids: the order of
 * entry means nothing, so two entries of the same split are the same allocation.
 */
export function cleanAllocationLines(lines: readonly AllocationLineInput[]): AllocationLineRecord[] {
  if (lines.length < 1 || lines.length > MAX_ALLOCATION_LINES) throw new CostAllocationLineCountError(lines.length);

  const records = lines.map((line) => {
    const costCenterId = line.costCenterId.toLowerCase();

    return { costCenterId, ratioBp: readRatio(costCenterId, line.ratioPercent) };
  });

  const seen = new Set<string>();
  for (const record of records) {
    if (seen.has(record.costCenterId)) throw new CostAllocationCostCenterDuplicateError(record.costCenterId);
    seen.add(record.costCenterId);
  }

  const total = records.reduce((sum, record) => sum + record.ratioBp, 0);
  if (total !== ALLOCATION_TOTAL_BP) throw new CostAllocationTotalError(total);

  return records.sort((a, b) => (a.costCenterId < b.costCenterId ? -1 : a.costCenterId > b.costCenterId ? 1 : 0));
}

function readRatio(costCenterId: string, ratioPercent: string): number {
  let ratioBp: number;
  try {
    ratioBp = parseRatePercent(ratioPercent);
  } catch (error) {
    if (
      error instanceof RateMalformedError ||
      error instanceof RateScaleExceededError ||
      error instanceof RateOutOfRangeError
    ) {
      throw new CostAllocationRatioInvalidError(costCenterId);
    }
    throw error;
  }
  if (ratioBp <= 0) throw new CostAllocationRatioInvalidError(costCenterId);

  return ratioBp;
}

/** True when two cleaned allocations name the same Cost Centers with the same shares. */
export function sameAllocation(a: readonly AllocationLineRecord[], b: readonly AllocationLineRecord[]): boolean {
  return (
    a.length === b.length &&
    a.every((line, index) => line.costCenterId === b[index].costCenterId && line.ratioBp === b[index].ratioBp)
  );
}

/**
 * The allocation as it is answered: shares as percentages, each line with the code, name and kind of its Cost Center,
 * in the order of the codes.
 * `centers` holds every Cost Center the version names (the foreign key guarantees they exist): one that is missing is a bug.
 */
export function toAllocationView(
  version: AllocationVersion,
  centers: ReadonlyMap<string, CostCenterBrief>,
): CostAllocationView {
  return {
    version: version.version,
    lines: version.lines
      .map((line) => {
        const center = centers.get(line.costCenterId);
        if (!center) throw new Error(`The Cost Center ${line.costCenterId} of an allocation was not read`);

        return {
          costCenterId: center.id,
          costCenterCode: center.code,
          costCenterName: center.name,
          costCenterKind: center.kind,
          ratioPercent: formatRatePercent(line.ratioBp),
        };
      })
      .sort((a, b) => a.costCenterCode.localeCompare(b.costCenterCode) || a.costCenterId.localeCompare(b.costCenterId)),
    totalPercent: formatRatePercent(version.lines.reduce((sum, line) => sum + line.ratioBp, 0)),
    declaredBy: version.declaredByAppUserId,
    declaredAt: version.declaredAt,
  };
}
