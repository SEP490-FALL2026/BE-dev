import type { BusinessDate } from '../../../core/business-date';

/** Whether a block puts the employee out from `today` on: its first day has come (QĐ-100q). */
export function isBlockInForce(block: { blockedFrom: BusinessDate } | null | undefined, today: BusinessDate): boolean {
  return block != null && block.blockedFrom <= today;
}
