import type { BusinessDate } from '../../../../core/business-date';
import type { RenewalPeriodFacts } from '../../../catalog/public/subscription-period.types';
import type { RenewalProblem } from '../subscription-renewal.errors';
import type { NoticeBasis, RenewalChoice } from '../subscription-renewal.types';

/**
 * Whether a renewal can be proposed for the period (`US-11-05` AC-1, AC-15): an active term subscription not continued yet. A
 * perpetual purchase, internal software and a draft have no renewal (`QĐ-49c`); a period with no milestone waits for its
 * contract data, and no milestone is guessed (`OQ-B-07`).
 */
export function checkProposable(period: RenewalPeriodFacts): RenewalProblem | null {
  if (period.kind !== 'TERM' || period.applicationKind === 'INTERNAL') return 'NOT_RENEWABLE';
  if (period.status !== 'ACTIVE' || period.renewedById !== null) return 'NOT_RENEWABLE';

  return milestoneOf(period) === null ? 'CONTRACT_DATA_INCOMPLETE' : null;
}

/** The milestone the period is proposed against and where it comes from; null when there is none to count from. */
export function milestoneOf(period: RenewalPeriodFacts): { basis: NoticeBasis; baseDate: BusinessDate } | null {
  const { source, baseDate } = period.notice;
  if (baseDate === null) return null;
  const dated = source === 'DECLARED' || source === 'INFERRED_UNCONFIRMED' || source === 'BY_END_DATE';

  return dated ? { basis: source, baseDate } : null;
}

/** A proposed reduction names fewer seats than are bought; a renewal as it is and a cancellation name none. */
export function checkProposedQuantity(
  choice: RenewalChoice,
  quantity: number | null,
  purchasedQuantity: number | null,
): RenewalProblem | null {
  if (choice !== 'REDUCE') return quantity === null ? null : 'QUANTITY_INVALID';
  if (quantity === null || quantity < 0) return 'QUANTITY_INVALID';

  return purchasedQuantity !== null && quantity >= purchasedQuantity ? 'QUANTITY_INVALID' : null;
}
