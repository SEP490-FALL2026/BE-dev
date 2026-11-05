/** Why a holder cannot acknowledge the notice of a registration now, in the order the holder has to fix them. */
export type AcknowledgementBlock =
  | 'REGISTRATION_ENDED'
  | 'SIGNATURE_RECORD_MISSING'
  | 'NOTICE_NOT_PUBLISHED'
  | 'NOTICE_NOT_CURRENT'
  | 'ALREADY_ACKNOWLEDGED';

export interface AcknowledgementFacts {
  registrationEnded: boolean;
  signatureRecorded: boolean;
  /** The version in force, null when none is published. */
  currentNoticeId: string | null;
  /** The version the holder says they read; null when only asking whether they can. */
  offeredNoticeId: string | null;
  /** The registration is collecting now: its chain of acknowledgements is in force. */
  alreadyActive: boolean;
}

/**
 * Whether a holder may acknowledge now (`US-09-03` AC-1, AC-4): the registration is open, `BM-06` is signed and kept, the version they
 * read is the one in force, and collection is not on already. After a stopped collection the same acknowledgement turns it back
 * on without a new `BM-06` (`US-09-04` AC-11).
 */
export function acknowledgementBlock(facts: AcknowledgementFacts): AcknowledgementBlock | null {
  if (facts.registrationEnded) return 'REGISTRATION_ENDED';
  if (!facts.signatureRecorded) return 'SIGNATURE_RECORD_MISSING';
  if (facts.currentNoticeId === null) return 'NOTICE_NOT_PUBLISHED';
  if (facts.offeredNoticeId !== null && facts.offeredNoticeId !== facts.currentNoticeId) return 'NOTICE_NOT_CURRENT';
  if (facts.alreadyActive) return 'ALREADY_ACKNOWLEDGED';

  return null;
}

export type AcknowledgementState = 'UNACKNOWLEDGED' | 'ACKNOWLEDGED' | 'STOPPED' | 'ENDED';

/** What the holder sees of a registration. */
export function acknowledgementStateOf(registration: {
  endedAt: Date | null;
  collectionStoppedAt: Date | null;
  acknowledgedFrom: Date | null;
}): AcknowledgementState {
  if (registration.endedAt) return 'ENDED';
  if (registration.collectionStoppedAt) return 'STOPPED';

  return registration.acknowledgedFrom ? 'ACKNOWLEDGED' : 'UNACKNOWLEDGED';
}
