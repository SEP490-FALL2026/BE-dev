import type { AssignmentRecord } from '../public/licensing.types';

/** Why the flag of a seat cannot be changed, in the order the rules are judged. */
export type MachineAccountRefusal = 'NOT_PERSONAL' | 'NOT_OPEN' | 'HOLDER_NOT_IT_ADMIN';

/** What the IT Admin asks for: the flag on with its reason, or off. */
export interface MachineAccountChange {
  on: boolean;
  /** The reason the seat is a machine account; present exactly when the flag is turned on. */
  note: string | null;
}

/** What the change does to the seat. */
export type MachineAccountOutcome = 'FLAG_ON' | 'NOTE_CHANGED' | 'FLAG_OFF' | 'UNCHANGED';

/**
 * Whether the flag "used for a machine account" of a seat may be turned on or off (`QĐ-110m`, `R-9`), in a fixed order: it is a personal
 * seat (a service account of the earlier releases is history, never flagged); it is open (not ended, not set to end, not failed or
 * cancelled); and, to turn the flag on, the person who holds it is an IT Admin who can act. Turning it off asks nothing of the holder: a
 * person who stopped being an IT Admin must be able to give the flag up. Null when the change may be made; whether the person holds
 * another personal seat of the subscription for an overlapping period is judged by the database (INV-02), not here.
 */
export function machineAccountRefusal(
  seat: Pick<AssignmentRecord, 'kind' | 'validUntil' | 'failedAt' | 'cancelledAt'>,
  holderIsItAdmin: boolean,
  change: MachineAccountChange,
): MachineAccountRefusal | null {
  if (seat.kind !== 'PERSONAL') return 'NOT_PERSONAL';
  if (seat.validUntil !== null || seat.failedAt !== null || seat.cancelledAt !== null) return 'NOT_OPEN';
  if (change.on && !holderIsItAdmin) return 'HOLDER_NOT_IT_ADMIN';

  return null;
}

/** What asking for `change` does to the seat as it is: a request that asks for what already is changes nothing and writes nothing. */
export function machineAccountOutcome(
  seat: Pick<AssignmentRecord, 'isMachineAccount' | 'machineAccountNote'>,
  change: MachineAccountChange,
): MachineAccountOutcome {
  if (!change.on) return seat.isMachineAccount ? 'FLAG_OFF' : 'UNCHANGED';
  if (!seat.isMachineAccount) return 'FLAG_ON';

  return seat.machineAccountNote === change.note ? 'UNCHANGED' : 'NOTE_CHANGED';
}
