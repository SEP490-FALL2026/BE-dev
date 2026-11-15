import type { EscalationCandidate, EscalationFacts, EscalationVerdict } from './escalation.types';

/** A `G3`/`G4` of the watch tier that no head was asked about (or that a transfer paused), with a holder and a seat chain. */
function isUsageWatch(record: EscalationCandidate): boolean {
  return (
    (record.group === 'G3' || record.group === 'G4') &&
    record.tier === 'MONITOR' &&
    (record.state === 'OPEN' || record.state === 'PAUSED') &&
    record.employeeId !== null &&
    record.seatChainId !== null
  );
}

/**
 * Whether the IT Admin may push a recommendation from the watch tier to the review tier before the weekly pass would (`QĐ-111ay`, `FR-4.12`): only a
 * `G3`/`G4` of the watch tier that no head was asked about, on a seat that still holds a seat, that is not used for a machine account (`QĐ-110m`)
 * and whose holder is not in the grace of a transfer (`QĐ-110p`: the recommendation of such a holder is paused), and whose holder has a department
 * for the queue of a head to be found. The eight gates were passed when the recommendation was made; nothing here judges the days again.
 */
export function escalationVerdictOf(facts: EscalationFacts): EscalationVerdict {
  const { record } = facts;
  if (!record) return { kind: 'SKIP', reason: 'NOT_FOUND' };
  if (!isUsageWatch(record)) return { kind: 'SKIP', reason: 'NOT_WATCH' };
  if (!facts.seat) return { kind: 'SKIP', reason: 'SEAT_ENDED' };
  if (facts.seat.isMachineAccount) return { kind: 'SKIP', reason: 'MACHINE_ACCOUNT' };
  if (facts.inTransfer || record.state === 'PAUSED') return { kind: 'SKIP', reason: 'TRANSFER_GRACE' };
  if (facts.placementDepartmentId === null) return { kind: 'SKIP', reason: 'NO_DEPARTMENT' };

  return { kind: 'ESCALATE' };
}
