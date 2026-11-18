import type {
  RequestPartyBlock,
  RequestPartyReason,
  RequestPartyRole,
  RequestParties,
} from '../public/request-party.types';

/** What the judgment needs to know about people: who holds the spending approver role, and who has no department yet (empty until the unplaced item reads it). */
export interface RequestPartyFacts {
  spendingApproverEmployeeId: string | null;
  unplacedEmployeeIds: ReadonlySet<string>;
}

/** Inside one side, the spending approver is judged before the person with no department; a person who is both is the spending approver. */
const REASON_ORDER: readonly RequestPartyReason[] = ['SPENDING_APPROVER', 'UNPLACED'];

function reasonOf(employeeId: string, facts: RequestPartyFacts): RequestPartyReason | null {
  if (facts.spendingApproverEmployeeId === employeeId) return 'SPENDING_APPROVER';
  if (facts.unplacedEmployeeIds.has(employeeId)) return 'UNPLACED';

  return null;
}

function blockOfSide(
  party: RequestPartyRole,
  employeeIds: readonly string[],
  facts: RequestPartyFacts,
): RequestPartyBlock | null {
  for (const reason of REASON_ORDER) {
    const blocked = employeeIds.filter((id) => reasonOf(id, facts) === reason);
    if (blocked.length > 0) return { reason, party, employeeIds: [...new Set(blocked)].sort() };
  }

  return null;
}

/**
 * The refusal of a Request, or null when every person of it can be a party. The requester is judged before the
 * beneficiaries, and a Request that a person asks for themselves is the REQUESTER's (`D-S21`).
 */
export function requestPartyBlock(parties: RequestParties, facts: RequestPartyFacts): RequestPartyBlock | null {
  const requester =
    parties.requesterEmployeeId === null ? null : blockOfSide('REQUESTER', [parties.requesterEmployeeId], facts);

  return requester ?? blockOfSide('BENEFICIARY', parties.beneficiaryEmployeeIds, facts);
}

/** The reason of each person who can never be a party, in the order of their ids; a person who is both kinds is the SPENDING_APPROVER. */
export function ineligibleReasons(
  employeeIds: readonly string[],
  facts: RequestPartyFacts,
): ReadonlyMap<string, RequestPartyReason> {
  const reasons = new Map<string, RequestPartyReason>();
  for (const id of [...new Set(employeeIds)].sort()) {
    const reason = reasonOf(id, facts);
    if (reason !== null) reasons.set(id, reason);
  }

  return reasons;
}
