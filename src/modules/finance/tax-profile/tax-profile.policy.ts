import { normalizeDisplayName } from '../../../core/display-name';
import { RateMalformedError, RateOutOfRangeError, RateScaleExceededError } from '../../../core/money/money.errors';
import { formatRatePercent, parseRatePercent } from '../../../core/money/tax-estimate';
import { searchKey } from '../../../core/search-key';
import {
  TaxProfileRateInvalidError,
  TaxProfileTaxTypeDuplicateError,
  TaxProfileTaxTypeInvalidError,
  TaxProfileTooManyLinesError,
} from '../public/finance.errors';
import type { DefaultTaxProfileView, TaxGroup, TaxLineInput, TaxPayer, TaxProfileView } from '../public/finance.types';
import type { TaxLineRecord, TaxProfileContent, TaxProfileVersion } from './tax-profile.types';

export const MAX_TAX_TYPE_LENGTH = 100;
export const MAX_LINES = 20;

/**
 * Who pays the tax, which follows from the group and is never typed in (`QĐ-60b`): the buyer remits it for T2; for T1 and
 * T3 the vendor collects it on the document.
 */
export function payerOfGroup(group: TaxGroup): TaxPayer {
  return group === 'T2' ? 'BUYER_REMITS' : 'VENDOR_COLLECTS';
}

/**
 * The profile a vendor is estimated by until Finance declares one (`QĐ-60b`, `OQ-B-06`): T2, the default for a foreign
 * vendor selling through a digital platform, with VAT 10% deductible and contractor CIT 5% not deductible. `QĐ-60b` names
 * the group, not the rates; the rates are those of the tax research note, a design choice the Owner confirms.
 */
export const DEFAULT_TAX_PROFILE: TaxProfileContent = {
  group: 'T2',
  lines: [
    { taxType: 'GTGT', rateBp: 1000, deductible: true },
    { taxType: 'TNDN nhà thầu', rateBp: 500, deductible: false },
  ],
};

/**
 * The lines as they are kept: names trimmed with blanks collapsed (1 to 100 characters, none twice ignoring case and
 * accents), rates read as hundredths of a percent, at most twenty. An empty list is a vendor not subject to tax.
 */
export function cleanTaxLines(lines: readonly TaxLineInput[]): TaxLineRecord[] {
  if (lines.length > MAX_LINES) throw new TaxProfileTooManyLinesError();

  const seen = new Set<string>();

  return lines.map((line) => {
    const taxType = normalizeDisplayName(line.taxType);
    if (taxType.length < 1 || taxType.length > MAX_TAX_TYPE_LENGTH) throw new TaxProfileTaxTypeInvalidError();
    const key = searchKey(taxType);
    if (seen.has(key)) throw new TaxProfileTaxTypeDuplicateError();
    seen.add(key);

    return { taxType, rateBp: readRate(taxType, line.ratePercent), deductible: line.deductible };
  });
}

function readRate(taxType: string, ratePercent: string): number {
  try {
    return parseRatePercent(ratePercent);
  } catch (error) {
    if (
      error instanceof RateMalformedError ||
      error instanceof RateScaleExceededError ||
      error instanceof RateOutOfRangeError
    ) {
      throw new TaxProfileRateInvalidError(taxType);
    }
    throw error;
  }
}

/** True when two profiles have the same group and the same lines in the same order (names compared ignoring case). */
export function sameProfile(a: TaxProfileContent, b: TaxProfileContent): boolean {
  return (
    a.group === b.group &&
    a.lines.length === b.lines.length &&
    a.lines.every((line, index) => {
      const other = b.lines[index];

      return (
        searchKey(line.taxType) === searchKey(other.taxType) &&
        line.rateBp === other.rateBp &&
        line.deductible === other.deductible
      );
    })
  );
}

/** The profile as it is answered: rates as percentages, each line with the payer its group implies. */
export function toProfileView(version: TaxProfileVersion): TaxProfileView {
  const payer = payerOfGroup(version.group);

  return {
    group: version.group,
    lines: version.lines.map((line) => ({
      taxType: line.taxType,
      ratePercent: formatRatePercent(line.rateBp),
      deductible: line.deductible,
      payer,
    })),
    version: version.version,
    declaredBy: version.declaredByAppUserId,
    declaredAt: version.declaredAt,
  };
}

/** The default profile as it is shown to a vendor that has none. */
export function defaultProfileView(): DefaultTaxProfileView {
  const payer = payerOfGroup(DEFAULT_TAX_PROFILE.group);

  return {
    group: DEFAULT_TAX_PROFILE.group,
    lines: DEFAULT_TAX_PROFILE.lines.map((line) => ({
      taxType: line.taxType,
      ratePercent: formatRatePercent(line.rateBp),
      deductible: line.deductible,
      payer,
    })),
  };
}
