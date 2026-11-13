/**
 * The checklist the IT Admin sends to complete the revocation of a K1 seat (`QĐ-111az`, P25): every step of a variant ticked, one minute
 * apart and in the order of the list, ending a minute ago. The variant is the server's (a departure among the reasons of the revocation makes
 * it `DEPARTURE`); a test that completes a K1 revocation names the one its source gives. No assertion lives here.
 */
export type K1Variant = 'DEPARTURE' | 'STILL_EMPLOYED';

export type K1ChecklistCode =
  | 'MAILBOX_PASSWORD_RESET'
  | 'SOFTWARE_FORGOT_PASSWORD'
  | 'SESSIONS_SIGNED_OUT'
  | 'RENEWAL_DISABLED'
  | 'EVIDENCE_RECORDED'
  | 'MAILBOX_LOCKED';

/** The checklist on the card of a K1 revocation, as the wire has it. */
export interface K1ChecklistCardWire {
  variant: K1Variant;
  items: { code: K1ChecklistCode; label: string; order: number; doneAt: string | null }[];
}

export interface K1ChecklistBody {
  items: { code: K1ChecklistCode; done: boolean; doneAt?: string }[];
  evidence?: string;
}

/** The steps of each variant in the order they are done. */
export const K1_CODES: Record<K1Variant, readonly K1ChecklistCode[]> = {
  DEPARTURE: [
    'MAILBOX_PASSWORD_RESET',
    'SOFTWARE_FORGOT_PASSWORD',
    'SESSIONS_SIGNED_OUT',
    'RENEWAL_DISABLED',
    'EVIDENCE_RECORDED',
    'MAILBOX_LOCKED',
  ],
  STILL_EMPLOYED: ['RENEWAL_DISABLED', 'EVIDENCE_RECORDED'],
};

/** The instant of the step at `index` of a checklist that ended a minute ago and was done a minute apart. */
export function k1TimeOf(length: number, index: number, now: number = Date.now()): string {
  return new Date(now - 60_000 * (length - index)).toISOString();
}

/**
 * A complete checklist of the variant; the evidence goes in it only when the test gives it (the body of the completion may carry it instead).
 * The lock of the mailbox is a step of the last K1 revocation of the person only (R-1): a test that completes one that is not the last asks
 * for the checklist `withLock: false`.
 */
export function k1Checklist(
  variant: K1Variant = 'STILL_EMPLOYED',
  evidence?: string,
  options: { withLock?: boolean } = {},
): K1ChecklistBody {
  const now = Date.now();
  const codes = K1_CODES[variant].filter((code) => code !== 'MAILBOX_LOCKED' || options.withLock !== false);

  return {
    items: codes.map((code, index) => ({ code, done: true, doneAt: k1TimeOf(codes.length, index, now) })),
    ...(evidence === undefined ? {} : { evidence }),
  };
}
