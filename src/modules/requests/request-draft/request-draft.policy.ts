/**
 * The draft of a paid request: which request a draft becomes, whose it is, and how many people it is for, as pure
 * decisions. A draft is a request saved before the finance gates; it exists so that a person can prepare what they cannot yet send
 * (the department has no Cost Center), and it is the sender's alone.
 */

export type DraftKind = 'INDIVIDUAL' | 'GROUP';

/** The type of request each kind of draft becomes when it is sent. A renewal is never kept as a draft. */
export const REQUEST_TYPE_OF_KIND = {
  INDIVIDUAL: 'GRANT',
  GROUP: 'GROUP_GRANT',
} as const satisfies Record<DraftKind, string>;

/** The kind of draft a request of this type is, or null for a type that is never kept as a draft. */
export function kindOfType(type: string): DraftKind | null {
  const found = (Object.entries(REQUEST_TYPE_OF_KIND) as [DraftKind, string][]).find(([, value]) => value === type);

  return found ? found[0] : null;
}

/** What a caller meets when they ask for a draft by its id: theirs and still a draft, not theirs or not there, or theirs and sent already. */
export type DraftVerdict = 'OK' | 'NOT_FOUND' | 'NOT_DRAFT';

/**
 * A request that is not the caller's is answered as one that does not exist, so a draft cannot be probed; one that is the caller's
 * and is no longer a draft has been sent, and is neither sent nor deleted again (the ownership is judged before the state).
 */
export function draftVerdict(
  row: { requesterEmployeeId: string; state: string } | null,
  employeeId: string,
): DraftVerdict {
  if (row === null || row.requesterEmployeeId !== employeeId) return 'NOT_FOUND';

  return row.state === 'DRAFT' ? 'OK' : 'NOT_DRAFT';
}

/** How many people the saved content is for: the people named of a group once each, one for any other kind. */
export function beneficiaryCountOf(content: { kind: DraftKind; lines?: readonly { employeeId: string }[] }): number {
  if (content.kind !== 'GROUP') return 1;

  return new Set((content.lines ?? []).map((line) => line.employeeId)).size;
}
