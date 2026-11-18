import type { BusinessDate } from '../../../core/business-date';
import type { DiscrepancyValues } from './vendor-account-review.types';

/** The evidence of the review of the accounts at the vendor is deleted this many months after its day (`US-14-04` AC-2). */
export const VENDOR_ACCOUNT_EVIDENCE_MONTHS = 24;

/**
 * The two values a difference keeps, as pure rules: what the company has on record against what the vendor shows, written the way the person who
 * decides reads them. Never the name of a person (`OQ-03`): an account is its identifier, a person is only an id.
 */
export function valuesOfNoAssignment(input: {
  firstActivityDate: BusinessDate;
  lastActivityDate: BusinessDate;
}): DiscrepancyValues {
  return {
    internalValue: 'No seat on record',
    vendorValue:
      input.firstActivityDate === input.lastActivityDate
        ? `Active on ${input.firstActivityDate}`
        : `Active from ${input.firstActivityDate} to ${input.lastActivityDate}`,
  };
}

export function valuesOfUnmatchedIdentity(input: {
  reason: 'NOT_FOUND' | 'AMBIGUOUS';
  candidateCount: number;
  rawIdentifier: string;
}): DiscrepancyValues {
  return {
    internalValue:
      input.reason === 'NOT_FOUND'
        ? 'No employee has this identifier'
        : `${input.candidateCount} employees could have this identifier`,
    vendorValue: `Account ${input.rawIdentifier}`,
  };
}

/** The count and the price of one the invoice says against the ones that were approved or bought; `null` for a side nobody knew. */
export function valuesOfInvoiceDifference(input: {
  quantity: { invoice: number; expected: number | null };
  unitPrice: { invoice: string; expected: string | null };
}): DiscrepancyValues {
  const known = input.quantity.expected !== null && input.unitPrice.expected !== null;

  return {
    internalValue: known ? `${input.quantity.expected} at ${input.unitPrice.expected}` : 'Not known',
    vendorValue: `${input.quantity.invoice} at ${input.unitPrice.invoice}`,
  };
}

export function valuesOfUnlistedTool(tool: string): DiscrepancyValues {
  return { internalValue: 'Not on the allowlist of the collector', vendorValue: `Tool ${tool} was reported` };
}

/** The last day of evidence that is kept: a day before it is deleted. A day that does not exist in the month 24 months earlier is the last of it. */
export function evidenceCutoff(today: BusinessDate): BusinessDate {
  const [year, month, day] = today.split('-').map(Number);
  const total = year * 12 + (month - 1) - VENDOR_ACCOUNT_EVIDENCE_MONTHS;
  const cutYear = Math.floor(total / 12);
  const cutMonth = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(cutYear, cutMonth, 0)).getUTCDate();

  return `${String(cutYear).padStart(4, '0')}-${String(cutMonth).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}
