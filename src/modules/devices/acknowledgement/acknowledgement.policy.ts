/** Why a holder cannot acknowledge the notice of a registration now, in the order the holder has to fix them. */
export type AcknowledgementBlock =
  | 'REGISTRATION_ENDED'
  | 'COLLECTOR_NOT_INSTALLED'
  | 'SIGNATURE_RECORD_MISSING'
  | 'NOTICE_NOT_PUBLISHED'
  | 'NOTICE_NOT_CURRENT'
  | 'ALREADY_ACKNOWLEDGED';

export interface AcknowledgementFacts {
  registrationEnded: boolean;
  collectorInstalled: boolean;
  signatureRecorded: boolean;
  /** The version in force, null when none is published. */
  currentNoticeId: string | null;
  /** The version the holder says they read; null when only asking whether they can. */
  offeredNoticeId: string | null;
  /** The registration is collecting now: its chain of acknowledgements is in force. */
  alreadyActive: boolean;
}

/**
 * Whether a holder may acknowledge now: the registration is open, has a collector installed, signed record is kept,
 * the version read is the one in force, and collection is not on already.
 */
export function acknowledgementBlock(facts: AcknowledgementFacts): AcknowledgementBlock | null {
  if (facts.registrationEnded) return 'REGISTRATION_ENDED';
  if (!facts.collectorInstalled) return 'COLLECTOR_NOT_INSTALLED';
  if (!facts.signatureRecorded) return 'SIGNATURE_RECORD_MISSING';
  if (facts.currentNoticeId === null) return 'NOTICE_NOT_PUBLISHED';
  if (facts.offeredNoticeId !== null && facts.offeredNoticeId !== facts.currentNoticeId) return 'NOTICE_NOT_CURRENT';
  if (facts.alreadyActive) return 'ALREADY_ACKNOWLEDGED';

  return null;
}

export type AcknowledgementState = 'UNACKNOWLEDGED' | 'ACKNOWLEDGED' | 'STOPPED' | 'ENDED' | 'NOT_REQUIRED';

/** What the holder sees of a registration. */
export function acknowledgementStateOf(registration: {
  endedAt: Date | null;
  collectorInstalled: boolean;
  collectionStoppedAt: Date | null;
  acknowledgedFrom: Date | null;
}): AcknowledgementState {
  if (registration.endedAt) return 'ENDED';
  if (!registration.collectorInstalled) return 'NOT_REQUIRED';
  if (registration.collectionStoppedAt) return 'STOPPED';

  return registration.acknowledgedFrom ? 'ACKNOWLEDGED' : 'UNACKNOWLEDGED';
}
