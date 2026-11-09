import type { BusinessDate } from '../../../core/business-date';
import { businessDateAt } from '../../../core/business-date';
import { searchKey } from '../../../core/search-key';

export type HolderDecision = 'OK' | 'NOT_FOUND' | 'NOT_WORKING';

/**
 * Who may hold a machine (`US-09-01` AC-9): a person who works here, on leave or not. A person who has left, who is
 * terminated or who is handing over their work is not given a new machine.
 */
export function judgeHolder(employee: { status: string; workState: string } | null): HolderDecision {
  if (!employee) return 'NOT_FOUND';
  if (employee.status !== 'ACTIVE') return 'NOT_WORKING';

  return employee.workState === 'WORKING' || employee.workState === 'ON_LONG_LEAVE' ? 'OK' : 'NOT_WORKING';
}

/** The day the machine was handed over: not after today, not before the person was hired (`US-09-01` AC-1). */
export function isHandoverDateValid(input: {
  handedOverOn: BusinessDate;
  today: BusinessDate;
  hireDate: BusinessDate;
}): boolean {
  return input.handedOverOn <= input.today && input.handedOverOn >= input.hireDate;
}

/** Two codes that differ by case, accents or blanks name one machine. */
export const normalizeAssetCode = searchKey;

/**
 * The last day of a registration that ends at `endedAt` (its days are `[validFrom, validUntil)`): the day it ended in the zone
 * of the organization, never before the day it began.
 */
export function validUntilOf(validFrom: BusinessDate, endedAt: Date, timeZone: string): BusinessDate {
  const day = businessDateAt(endedAt, timeZone);

  return day < validFrom ? validFrom : day;
}
