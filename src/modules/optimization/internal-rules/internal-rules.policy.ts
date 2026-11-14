import type {
  GhostSeatRecord,
  GhostSeatCloseReason,
  GhostSeatG1Action,
  GhostSeatState,
} from '../ghost-seat/ghost-seat.types';
import type { RuleSkipDetail } from '../rule-run/rule-run-skip-detail.json';
import type { SkipGate } from '../rule-run/rule-run.repo';

type Pricing = 'PER_SEAT' | 'FLAT_RATE' | 'CONCURRENT' | 'CONSUMPTION' | 'PER_HOST' | null;
type Kind = 'K1' | 'K2' | 'K3' | 'K4' | 'K5';

/** A subscription that grants seats today, as the rule of free seats reads it (`FR-4.9` gate 1). */
export interface VacancyFacts {
  provisioningType: Kind;
  pricingModel: Pricing;
  purchased: number | null;
  occupied: number;
  free: number | null;
}

export interface SkipFact {
  gate: SkipGate;
  detail: RuleSkipDetail;
}

/** What the rule does with the `G1` of one subscription. */
export type G1Step =
  | { kind: 'NONE' }
  | { kind: 'CREATE'; freeSeats: number; countsTowardVacantCost: boolean; action: GhostSeatG1Action }
  | { kind: 'UPDATE'; freeSeats: number }
  | { kind: 'CLOSE'; reason: GhostSeatCloseReason };

export interface G1Decision {
  /** Why the subscription is left out of the rule, when it is (kept for the IT Admin to read, `FR-4.12b`). */
  skip: SkipFact | null;
  step: G1Step;
}

/** What `G1` tells the IT Admin to do: a `K4` pool of keys is regranted before more are bought (`Q-12`), anything else regranted or reduced. */
export const g1ActionOf = (kind: Kind): GhostSeatG1Action =>
  kind === 'K4' ? 'REGRANT_BEFORE_PURCHASE' : 'REGRANT_OR_REDUCE';

/**
 * `G1` (`US-10-01` AC-1, AC-7, AC-8, AC-9; `R-E02`): a subscription of the shared pool (`K2`) that is `PER_SEAT` and still has free seats has
 * one open `G1` with how many; the number follows the free seats while it is open, and it closes when none are free or when the subscription
 * no longer grants seats, or is no longer `PER_SEAT`. A `K5` plan is internal software (`QĐ-62o`: out of the MVP) and a plan that
 * is not `PER_SEAT` has no seat to count: both are left out with a reason. Any other kind has no `G1` (`K1`, `K3`; `K4` is `TẠM CHỌN`: no
 * key pool in this build). `vacancy` is null when the subscription no longer grants seats today.
 */
export function decideG1(vacancy: VacancyFacts | null, open: Pick<GhostSeatRecord, 'freeSeats'> | null): G1Decision {
  const close = (reason: GhostSeatCloseReason): G1Step => (open ? { kind: 'CLOSE', reason } : { kind: 'NONE' });
  if (!vacancy) return { skip: null, step: close('OUT_OF_SCOPE') };
  if (vacancy.provisioningType === 'K5') {
    return { skip: { gate: 'INTERNAL_SOFTWARE', detail: { provisioningType: 'K5' } }, step: close('OUT_OF_SCOPE') };
  }
  if (vacancy.pricingModel !== 'PER_SEAT') {
    return {
      skip: {
        gate: 'PER_SEAT',
        detail: { pricingModel: vacancy.pricingModel, provisioningType: vacancy.provisioningType },
      },
      step: close('OUT_OF_SCOPE'),
    };
  }
  // A free seat is a seat of the shared pool (`K2`, BRD 5.4.1, `QĐ-103d`(2)): a personal plan (`K1`) cancelled to the end of its term is never
  // granted again (`INV-12`), and a pool of keys (`K4`) is left out until the Owner decides it (TẠM CHỌN).
  if (vacancy.provisioningType !== 'K2') return { skip: null, step: close('OUT_OF_SCOPE') };

  const free = vacancy.free ?? 0;
  if (free === 0) return { skip: null, step: close('FREE_SEATS_GONE') };
  if (!open) {
    return {
      skip: null,
      step: {
        kind: 'CREATE',
        freeSeats: free,
        countsTowardVacantCost: vacancy.provisioningType === 'K2',
        action: g1ActionOf(vacancy.provisioningType),
      },
    };
  }

  return { skip: null, step: open.freeSeats === free ? { kind: 'NONE' } : { kind: 'UPDATE', freeSeats: free } };
}

/** A seat that is open today, as the rule of the people who left reads it. */
export interface SeatFacts {
  kind: 'PERSONAL' | 'SERVICE';
  /** The seat is flagged as used for a machine account (`QĐ-110m`): it has no `G2`, whoever holds it. */
  isMachineAccount: boolean;
  provisioningType: Kind;
  pricingModel: Pricing;
  holderLeft: boolean;
  liveRevocation: { taskId: string } | null;
  terminatingUntil: string | null;
}

/** The recommendation a seat chain already has that is not closed (gate 8), as far as the rule needs it. */
export interface ChainRecommendation {
  id: string;
  group: 'G1' | 'G2' | 'G3' | 'G4';
  state: GhostSeatState;
  revocationTaskId: string | null;
  holderLeftOn: string | null;
}

/** What the rule does with the `G2` of one seat. */
export type G2Step =
  | { kind: 'NONE' }
  | { kind: 'LINK_TASK'; recommendationId: string; taskId: string }
  | { kind: 'MARK_HOLDER_LEFT'; recommendationId: string }
  | {
      kind: 'CREATE';
      state: 'OPEN' | 'RECLAIM_DECIDED';
      revocationTaskId: string | null;
      terminatingUntil: string | null;
      supersedes: string | null;
    };

export interface G2Decision {
  skip: SkipFact | null;
  step: G2Step;
}

const NO_STEP: G2Decision = { skip: null, step: { kind: 'NONE' } };

/**
 * `G2` (`US-10-01` AC-2, AC-4, AC-6, AC-10; `US-10-02` AC-11; `US-07-05` AC-12): a personal seat on a `PER_SEAT` plan still held by
 * a person who left has one `G2`, whatever the age of the seat or the role of the holder (gates 2 to 7 do not apply). Gate 8 decides
 * what the seat chain already has:
 *  - a `G2` not closed ⟹ left out (`OPEN_RECOMMENDATION`); an open one learns of a revocation that began since;
 *  - a recommendation a head paused, or one of `G3`/`G4` not yet decided ⟹ closed as replaced and a `G2` made (`QĐ-108i`, `Q-82`);
 *  - a `G3`/`G4` whose reclaim the head decided ⟹ no `G2` (the seat is being taken back): the day the holder left is marked, once (`DA6-04`).
 * A new `G2` is `OPEN` unless the seat's revocation is under way (`DA6-03`) or its K1 access runs on to a day (`DA6-27`): then it is
 * `RECLAIM_DECIDED`, and nobody is asked to reclaim it.
 */
export function decideG2(seat: SeatFacts, existing: ChainRecommendation | null): G2Decision {
  const outOfScope = outOfScopeOf(seat);
  if (outOfScope) return outOfScope;
  if (!seat.holderLeft) return NO_STEP;
  if (existing?.group === 'G2') return alreadyRecommended(seat, existing);
  if (existing?.state === 'RECLAIM_DECIDED') return markHolderLeft(existing);

  return { skip: null, step: newG2(seat, existing) };
}

/** A `G3`/`G4` whose reclaim the head decided already takes the seat back: no `G2` (`DA6-04`), only the day the holder left, once. */
function markHolderLeft(existing: ChainRecommendation): G2Decision {
  return existing.holderLeftOn
    ? NO_STEP
    : { skip: null, step: { kind: 'MARK_HOLDER_LEFT', recommendationId: existing.id } };
}

/** The `G2` to make: decided already when the seat's revocation is under way or its K1 access runs on to a day. */
function newG2(seat: SeatFacts, existing: ChainRecommendation | null): G2Step {
  const decided = seat.liveRevocation !== null || seat.terminatingUntil !== null;

  return {
    kind: 'CREATE',
    state: decided ? 'RECLAIM_DECIDED' : 'OPEN',
    revocationTaskId: seat.liveRevocation?.taskId ?? null,
    terminatingUntil: seat.liveRevocation ? null : seat.terminatingUntil,
    supersedes: existing?.id ?? null,
  };
}

/** A seat the rule does not judge: not a personal seat, a machine account, internal software (`K5`) or a plan that is not `PER_SEAT` (gate 1). Null when it judges it. */
function outOfScopeOf(seat: SeatFacts): G2Decision | null {
  if (seat.kind !== 'PERSONAL' || seat.isMachineAccount) return NO_STEP;
  const gate =
    seat.provisioningType === 'K5' ? 'INTERNAL_SOFTWARE' : seat.pricingModel !== 'PER_SEAT' ? 'PER_SEAT' : null;
  if (gate === null) return null;
  if (!seat.holderLeft) return NO_STEP;
  const detail =
    gate === 'INTERNAL_SOFTWARE'
      ? { provisioningType: seat.provisioningType }
      : { pricingModel: seat.pricingModel, provisioningType: seat.provisioningType };

  return { skip: { gate, detail }, step: { kind: 'NONE' } };
}

/** Gate 8 for a seat that has a `G2` not closed: left out, and an open one learns of a revocation that began since (`US-07-05` AC-12). */
function alreadyRecommended(seat: SeatFacts, existing: ChainRecommendation): G2Decision {
  const skip: SkipFact = { gate: 'OPEN_RECOMMENDATION', detail: { recommendationId: existing.id } };
  if (existing.state === 'OPEN' && seat.liveRevocation) {
    return { skip, step: { kind: 'LINK_TASK', recommendationId: existing.id, taskId: seat.liveRevocation.taskId } };
  }

  return { skip, step: { kind: 'NONE' } };
}
