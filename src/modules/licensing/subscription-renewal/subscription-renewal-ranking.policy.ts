import type { BusinessDate } from '../../../core/business-date';
import type { RenewalSeatUsage } from '../public/licensing-subscription-renewal.types';
import type { HeldSeat, SeatRankGroup } from './subscription-renewal.types';

/** A personal seat of the subscription with what the ranking reads: whether its holder left, and the evidence of use if any. */
export interface RankInput {
  seat: HeldSeat;
  holderLeft: boolean;
  /** Null when no source of usage exists: the seat is ranked without it and nothing is guessed. */
  usage: RenewalSeatUsage | null;
}

export interface RankedSeat {
  assignmentId: string;
  employeeId: string;
  group: SeatRankGroup;
  position: number;
  validFrom: BusinessDate;
  lastActivityOn: BusinessDate | null;
}

/** A seat held on the day: begun, not ended (an end is the first day without the seat). */
export const heldOn = (seat: HeldSeat, day: BusinessDate): boolean =>
  seat.validFrom <= day && (seat.validUntil === null || seat.validUntil > day);

const GROUP_ORDER: Readonly<Record<SeatRankGroup, number>> = {
  REVOCATION_DECIDED: 0,
  HOLDER_LEFT: 1,
  USAGE_FLAGGED: 2,
  OTHER: 3,
};

function groupOf(input: RankInput): SeatRankGroup {
  if (input.seat.liveRevocationSources.length > 0) return 'REVOCATION_DECIDED';
  if (input.holderLeft) return 'HOLDER_LEFT';
  if (input.usage?.flagged) return 'USAGE_FLAGGED';

  return 'OTHER';
}

/** An older last activity first, a seat never seen active before any; with no evidence the order falls to the oldest seat. */
function compareActivity(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;

  return a < b ? -1 : 1;
}

/**
 * The list a reduction below the seats in use is chosen from (`QĐ-66x`, `US-11-02` AC-20): the seats whose revocation was already
 * decided, then those whose holder left (`G2`), then those a waste rule flagged (`G3`/`G4`, only when evidence of use exists),
 * then the rest by the oldest last activity. Without evidence of use no seat is flagged and the rest fall to the oldest seat
 * first: an order, never a judgement of use. Only personal seats are offered; the decider chooses, the system never does.
 */
export function rankSeats(inputs: readonly RankInput[]): RankedSeat[] {
  return inputs
    .filter((input) => input.seat.kind === 'PERSONAL')
    .map((input) => ({ input, group: groupOf(input), lastActivityOn: input.usage?.lastActivityOn ?? null }))
    .sort(
      (a, b) =>
        GROUP_ORDER[a.group] - GROUP_ORDER[b.group] ||
        compareActivity(a.lastActivityOn, b.lastActivityOn) ||
        a.input.seat.validFrom.localeCompare(b.input.seat.validFrom) ||
        a.input.seat.assignmentId.localeCompare(b.input.seat.assignmentId),
    )
    .map((entry, index) => ({
      assignmentId: entry.input.seat.assignmentId,
      employeeId: entry.input.seat.employeeId,
      group: entry.group,
      position: index + 1,
      validFrom: entry.input.seat.validFrom,
      lastActivityOn: entry.lastActivityOn,
    }));
}
