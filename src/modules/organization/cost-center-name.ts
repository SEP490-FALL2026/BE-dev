import { displayJobTitleName } from './job-title-name';

/** A Cost Center code: letters, digits, dot, underscore and hyphen, starting with a letter or digit. */
export const COST_CENTER_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
export const COST_CENTER_CODE_MAX_LENGTH = 50;
export const COST_CENTER_NAME_MAX_LENGTH = 200;

/**
 * Names that stand for "money with no Cost Center" (US-04-09 AC-4). The report line *Chưa phân bổ Cost Center*
 * is not a Cost Center and cannot be chosen for a department; a catalogue entry that gathers people nobody has
 * placed would be the same hole under another name (FR-9.7). Compared without case, accents or stray spaces, so
 * `Chua phan loai` does not slip through.
 */
const RESERVED_FOLDED_NAMES: ReadonlySet<string> = new Set([
  'chua phan loai',
  'chua phan bo cost center',
  'chua phan bo',
  'unclassified',
  'unallocated',
]);

function fold(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replaceAll('đ', 'd')
    .replaceAll('Đ', 'd')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

export function isReservedCostCenterName(name: string): boolean {
  return RESERVED_FOLDED_NAMES.has(fold(name));
}

/** The name as it is kept: accents composed, ends trimmed, inner whitespace runs collapsed (the same rule as job titles). */
export const displayCostCenterName = displayJobTitleName;
