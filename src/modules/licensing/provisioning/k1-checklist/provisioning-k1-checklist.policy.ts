import { RevocationCompletionError } from '../../public/licensing.errors';
import { ProvisioningK1ChecklistError } from '../provisioning.errors';
import type {
  K1ChecklistCode,
  K1ChecklistExpectation,
  K1ChecklistFacts,
  K1ChecklistVariant,
  ProvisioningKind,
  ProvisioningTaskStatus,
  RevocationSource,
} from '../../public/licensing.types';
import { DEPARTURE_SOURCES } from '../../licensing-alerts.policy';

/** One step of the checklist of a K1 revocation: what it is, and the place it has in the list of its variant (from 1). */
export interface K1ChecklistItem {
  code: K1ChecklistCode;
  label: string;
  order: number;
}

/** What the IT Admin sends for one step: ticked, and when. A step that is not ticked, or has no time, does not count as done. */
export interface K1ChecklistClaimItem {
  code: K1ChecklistCode;
  done: boolean;
  doneAt?: string | undefined;
}

/** What the IT Admin sends to complete the revocation of a K1 seat (`QĐ-111az`, P25). */
export interface K1ChecklistClaim {
  items: K1ChecklistClaimItem[];
  evidence?: string | undefined;
}

/** A step as the task keeps it (`provisioning_tasks.k1_checklist`): ticked, with the instant it was ticked, ISO and in UTC. */
export interface StoredK1ChecklistItem {
  code: K1ChecklistCode;
  order: number;
  doneAt: string;
}

/** The checklist as the task keeps it once the grant or the revocation is completed: the variant it was ticked as and the steps by their order. */
export interface StoredK1Checklist {
  variant: K1ChecklistVariant;
  items: StoredK1ChecklistItem[];
}

/** What the completion of a K1 task stores from the checklist: the checklist itself, the evidence it stands on and what the listeners are told. */
export interface K1ChecklistPlan extends StoredK1Checklist {
  evidence: string;
  facts: K1ChecklistFacts;
}

/** The checklist on the card of a task: the steps of its variant, each with the instant it was ticked, or null while it is not. */
export interface K1ChecklistCard {
  variant: K1ChecklistVariant;
  items: { code: K1ChecklistCode; label: string; order: number; doneAt: string | null }[];
}

/** The text of each step. The card carries it so a client may show it as it is; a client that translates keys on the code. */
const LABELS: Record<K1ChecklistCode, string> = {
  MAILBOX_PASSWORD_RESET: 'Reset the password of the mailbox (the mailbox is not locked yet)',
  SOFTWARE_FORGOT_PASSWORD: 'Use "Forgot password" on the software',
  SESSIONS_SIGNED_OUT: 'Sign out every session of the person',
  RENEWAL_DISABLED: 'Turn off the renewal of the subscription for this seat',
  EVIDENCE_RECORDED: 'Record the evidence',
  MAILBOX_LOCKED: 'Lock the mailbox',
  COMPANY_EMAIL_REGISTERED: 'Register on the company email of the person themself',
  NO_PERSONAL_DEVICE_MFA: 'Do not turn on multi-factor sign-in with a personal device',
};

/**
 * The steps of each variant, in the order they are done. A person who leaves has the mailbox reset, the software's own password reset,
 * the sessions signed out, the renewal turned off, the evidence kept and, last, the mailbox locked. A person who still works (a transfer,
 * an expiry, a return, a ghost seat...) has only the renewal turned off and the evidence kept: the mailbox is theirs (`R-35`). The system
 * controls neither Google nor Microsoft 365: the IT Admin does the steps there and ticks them here. The lock of the mailbox is a step of
 * the last K1 revocation of the person only (see `k1ChecklistCodes`). The grant of a K1 seat has its own two steps (`US-07-01` AC-7): the
 * subscription is registered on the company email of the person who will use it, and no multi-factor sign-in is turned on with a personal device.
 */
const CODES_OF: Record<K1ChecklistVariant, readonly K1ChecklistCode[]> = {
  DEPARTURE: [
    'MAILBOX_PASSWORD_RESET',
    'SOFTWARE_FORGOT_PASSWORD',
    'SESSIONS_SIGNED_OUT',
    'RENEWAL_DISABLED',
    'EVIDENCE_RECORDED',
    'MAILBOX_LOCKED',
  ],
  STILL_EMPLOYED: ['RENEWAL_DISABLED', 'EVIDENCE_RECORDED'],
  GRANT: ['COMPANY_EMAIL_REGISTERED', 'NO_PERSONAL_DEVICE_MFA'],
};

/**
 * The variant of a revocation, from the sources of the reasons that stand: a departure among them makes it `DEPARTURE` whichever reason
 * came first, because one task answers for all the reasons of a seat (`QĐ-64a`) and the mailbox of a person who leaves is reset and locked
 * whatever else asked for the seat. No source: the person is not known to leave.
 */
export function k1VariantOf(sources: readonly RevocationSource[]): Exclude<K1ChecklistVariant, 'GRANT'> {
  return sources.some((source) => DEPARTURE_SOURCES.has(source)) ? 'DEPARTURE' : 'STILL_EMPLOYED';
}

/**
 * The steps a task of this variant has. The lock of the mailbox is the step of the **last** K1 revocation of the person (R-1, S17, P28): a
 * person with two K1 seats has two tasks, and the later seats still need the mailbox open for their first steps, so a task that is not the
 * last has the steps before the lock only and does not take it. Another variant has no lock.
 */
export function k1ChecklistCodes(variant: K1ChecklistVariant, lastOfPerson: boolean): readonly K1ChecklistCode[] {
  return CODES_OF[variant].filter((code) => code !== 'MAILBOX_LOCKED' || lastOfPerson);
}

/** The steps of a variant with their text and place, in order (from 1, so the five steps of a task that is not the last are 1 to 5). */
export function k1ChecklistItems(variant: K1ChecklistVariant, lastOfPerson: boolean): K1ChecklistItem[] {
  return k1ChecklistCodes(variant, lastOfPerson).map((code, index) => ({
    code,
    label: LABELS[code],
    order: index + 1,
  }));
}

/** What is wrong with a checklist: a step it does not have or sent twice, a step or the evidence missing, a step timed before one that comes first. */
type Fault = 'NOT_ALLOWED' | 'INCOMPLETE' | 'OUT_OF_ORDER';

/**
 * Refuses the checklist, telling the variant and the steps this task expects (nothing is told when the kind of grant has no checklist). The
 * revocation and the grant of a K1 seat judge a checklist the same way, and each answers with the error of its own route.
 */
type Refuse = (fault: Fault, expected?: K1ChecklistExpectation) => never;

/** The refusal of the completion of a revocation (`REVOCATION.*` on the wire). */
const refuseRevocation: Refuse = (fault, expected) => {
  throw new RevocationCompletionError(
    fault === 'NOT_ALLOWED' ? 'COMPLETION_NOT_ALLOWED' : `K1_CHECKLIST_${fault}`,
    expected,
  );
};

/** The refusal of the completion of a grant (`PROVISIONING.*` on the wire). */
const refuseGrant: Refuse = (fault, expected) => {
  throw new ProvisioningK1ChecklistError(`K1_CHECKLIST_${fault}`, expected);
};

/** The instant of a ticked step, or null when it is not ticked or has no instant. */
function tickedAt(item: K1ChecklistClaimItem | undefined): number | null {
  if (!item?.done || item.doneAt === undefined) return null;
  const time = Date.parse(item.doneAt);

  return Number.isNaN(time) ? null : time;
}

/**
 * The steps the IT Admin sent, found for each step of the variant. A step the variant does not have, or sent twice, does not belong to
 * this checklist (`NOT_ALLOWED`); a step of the variant that is not sent, not ticked, or ticked with no instant is missing
 * (`INCOMPLETE`). Returns the instants in the order of the list.
 */
function instantsOf(
  expected: K1ChecklistExpectation,
  lastOfPerson: boolean,
  claim: K1ChecklistClaim,
  refuse: Refuse,
): { item: K1ChecklistItem; time: number }[] {
  const sent = claim.items.map((item) => item.code);
  if (sent.some((code, index) => !expected.codes.includes(code) || sent.indexOf(code) !== index)) {
    refuse('NOT_ALLOWED', expected);
  }

  return k1ChecklistItems(expected.variant, lastOfPerson).map((item) => {
    const time = tickedAt(claim.items.find((sentItem) => sentItem.code === item.code));
    if (time === null) refuse('INCOMPLETE', expected);

    return { item, time };
  });
}

/**
 * The judgment of the checklist of a variant that is known, shared by the revocation and the grant of a K1 seat: every step of the variant
 * ticked with the instant it was done, the instants not falling as the list goes, and the evidence (the one written in the checklist or, when it
 * has none, the one written beside it). A step that is missing is told before a step that is out of order.
 */
function judgeChecklist(
  input: { variant: K1ChecklistVariant; lastOfPerson: boolean; claim: K1ChecklistClaim | undefined; evidence: string },
  refuse: Refuse,
): K1ChecklistPlan {
  const { variant, lastOfPerson, claim } = input;
  const expected: K1ChecklistExpectation = { variant, codes: [...k1ChecklistCodes(variant, lastOfPerson)] };
  if (claim === undefined) refuse('INCOMPLETE', expected);

  const instants = instantsOf(expected, lastOfPerson, claim, refuse);
  const evidence = claim.evidence?.trim() || input.evidence.trim();
  if (evidence.length === 0) refuse('INCOMPLETE', expected);
  if (instants.some(({ time }, index) => index > 0 && time < instants[index - 1].time)) {
    refuse('OUT_OF_ORDER', expected);
  }

  const items = instants.map(({ item, time }) => ({
    code: item.code,
    order: item.order,
    doneAt: new Date(time).toISOString(),
  }));

  return { variant, items, evidence, facts: { variant, doneCodes: items.map((item) => item.code) } };
}

/**
 * The checklist of a K1 revocation that is completed (`QĐ-111az`, `US-07-05` AC-19, m-09): every step of the variant ticked with the instant
 * it was done, the instants not falling as the list goes (a step ticked before one that comes first in the list is out of order; the same
 * instant is in order, as a client may time to the second), and the evidence, which is the one written in the checklist or, when it has
 * none, the one written beside it. Another kind of provisioning has no checklist and refuses one. The variant is read from the sources, never
 * sent; the lock of the mailbox is asked, and accepted, only when this is the last K1 revocation of the person (`lastOfPerson`). A step may
 * be ticked before the task was made: the password of the mailbox is reset when access is blocked, before the IT Admin opens the revocation
 * (`QĐ-110b`, `QĐ-110c`, D-64); one ticked ahead of the clock is not refused either, the clock of the IT Admin being theirs (D-55). Throws RevocationCompletionError (`COMPLETION_NOT_ALLOWED`, `K1_CHECKLIST_INCOMPLETE`,
 * `K1_CHECKLIST_OUT_OF_ORDER`).
 */
export function planK1Checklist(input: {
  type: ProvisioningKind;
  sources: readonly RevocationSource[];
  /** True when no other K1 revocation of the person is still to do: only then the mailbox is locked with this one. */
  lastOfPerson: boolean;
  claim: K1ChecklistClaim | undefined;
  /** The evidence written beside the checklist, in the body of the completion. */
  evidence: string;
}): K1ChecklistPlan | null {
  if (input.type !== 'K1') {
    if (input.claim !== undefined) refuseRevocation('NOT_ALLOWED');

    return null;
  }

  return judgeChecklist({ ...input, variant: k1VariantOf(input.sources) }, refuseRevocation);
}

/**
 * The checklist of the grant of a K1 seat that is completed (`QĐ-111az`, R-19, `US-07-01` AC-7): the two steps of the variant `GRANT` ticked in
 * their order, each with the instant it was done, and the evidence (in the checklist, or beside it). It is judged as the checklist of a
 * revocation: a step that is missing is told before one out of order, the same instant is in order, and a step is not refused for being before
 * the task or ahead of the clock. A grant of another kind of provisioning has no checklist and refuses one. Throws ProvisioningK1ChecklistError
 * (`K1_CHECKLIST_NOT_ALLOWED`, `K1_CHECKLIST_INCOMPLETE`, `K1_CHECKLIST_OUT_OF_ORDER`).
 */
export function planK1GrantChecklist(input: {
  type: ProvisioningKind;
  claim: K1ChecklistClaim | undefined;
  /** The evidence written beside the checklist, in the body of the completion. */
  evidence: string;
}): K1ChecklistPlan | null {
  if (input.type !== 'K1') {
    if (input.claim !== undefined) refuseGrant('NOT_ALLOWED');

    return null;
  }

  return judgeChecklist({ ...input, variant: 'GRANT', lastOfPerson: true }, refuseGrant);
}

/**
 * The checklist on the card of a task: what was ticked and when for a task that was completed (as it was kept, whatever the list is now),
 * the list of the variant with nothing ticked for one that is not.
 */
export function k1ChecklistCard(
  variant: K1ChecklistVariant,
  stored: StoredK1Checklist | null,
  lastOfPerson: boolean,
): K1ChecklistCard {
  if (stored) {
    return {
      variant: stored.variant,
      items: stored.items.map((item) => ({
        code: item.code,
        label: LABELS[item.code],
        order: item.order,
        doneAt: item.doneAt,
      })),
    };
  }

  return { variant, items: k1ChecklistItems(variant, lastOfPerson).map((item) => ({ ...item, doneAt: null })) };
}

/**
 * Whether the card of a K1 revocation carries a checklist: one to tick while the task can still be completed, and the one it was completed with
 * after (a task completed before the checklist existed, a cancelled one and one closed as failed show none).
 */
export function k1ChecklistShown(status: ProvisioningTaskStatus, kept: boolean): boolean {
  if (status === 'COMPLETED') return kept;

  return status !== 'CANCELLED' && status !== 'CLOSED_FAILED';
}
