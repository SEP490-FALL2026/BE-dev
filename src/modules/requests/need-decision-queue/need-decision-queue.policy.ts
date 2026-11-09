/**
 * The rows of the routing table that give the need step to a person: the head (1), the spending approver for a head who sent for
 * themselves (2), the head who sent for others (5) and the head who decides the lines of a group an Employee sent (9). Row 8 gives
 * the step to nobody, so its step waits and is never in a queue; rows 3 and 4 (the approver of last resort, `QĐ-93c`) are not written
 * any more, and the migration that drops the old roles refuses a database that still has a pending step on one.
 */
export const HELD_ROUTING_ROWS = [1, 5, 9] as const;

/** The longest excerpt of the reason a row of the queue shows; the whole reason is read on the request. */
export const REASON_EXCERPT_LENGTH = 200;

/** The reason cut to the first `REASON_EXCERPT_LENGTH` characters (by character, not by byte), with an ellipsis when it was cut. */
export function reasonExcerptOf(reason: string): string {
  const characters = [...reason.trim()];

  return characters.length <= REASON_EXCERPT_LENGTH
    ? characters.join('')
    : `${characters.slice(0, REASON_EXCERPT_LENGTH).join('').trimEnd()}…`;
}
