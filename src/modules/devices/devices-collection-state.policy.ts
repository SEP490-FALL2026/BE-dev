/**
 * Whether the machine is being collected from, as a function of the register, `BM-06` and the acknowledgement of the holder
 * (`US-09-03`, `US-09-04`). The one definition: the list reads the same `CASE` in SQL and the gate of the intake reads it back.
 */
export const COLLECTION_STATES = [
  'RETIRED',
  'UNREGISTERED',
  'COLLECTION_STOPPED',
  'ACTIVE',
  'AWAITING_ACKNOWLEDGEMENT',
] as const;
export type CollectionState = (typeof COLLECTION_STATES)[number];

export interface CollectionFacts {
  retiredAt: Date | null;
  /** The open registration of the machine, null when nobody holds it. */
  registration: { acknowledgedFrom: Date | null; collectionStoppedAt: Date | null } | null;
}

export function collectionStateOf(facts: CollectionFacts): CollectionState {
  if (facts.retiredAt !== null) return 'RETIRED';
  if (facts.registration === null) return 'UNREGISTERED';
  if (facts.registration.collectionStoppedAt !== null) return 'COLLECTION_STOPPED';
  if (facts.registration.acknowledgedFrom !== null) return 'ACTIVE';

  return 'AWAITING_ACKNOWLEDGEMENT';
}
