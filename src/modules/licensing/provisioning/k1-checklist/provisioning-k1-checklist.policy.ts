import { RevocationCompletionError } from '../../public/licensing.errors';
import type {
  K1ChecklistCode,
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

/** The checklist as the task keeps it once the revocation is completed: the variant it was ticked as and the steps by their order. */
export interface StoredK1Checklist {
  variant: K1ChecklistVariant;
  items: StoredK1ChecklistItem[];
}

/** What a K1 completion stores from the checklist: the checklist itself, the evidence it stands on and what the listeners are told. */
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
};

/**
 * The steps of each variant, in the order they are done. A person who leaves has the mailbox reset, the software's own password reset,
 * the sessions signed out, the renewal turned off, the evidence kept and, last, the mailbox locked. A person who still works (a transfer,
 * an expiry, a return, a ghost seat...) has only the renewal turned off and the evidence kept: the mailbox is theirs (`R-35`). The system
 * controls neither Google nor Microsoft 365: the IT Admin does the steps there and ticks them here.
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
};

/**
 * The variant of a revocation, from the sources of the reasons that stand: a departure among them makes it `DEPARTURE` whichever reason
 * came first, because one task answers for all the reasons of a seat (`QĐ-64a`) and the mailbox of a person who leaves is reset and locked
 * whatever else asked for the seat. No source: the person is not known to leave.
 */
export function k1VariantOf(sources: readonly RevocationSource[]): K1ChecklistVariant {
  return sources.some((source) => DEPARTURE_SOURCES.has(source)) ? 'DEPARTURE' : 'STILL_EMPLOYED';
}

/** The steps of a variant with their text and place, in order. */
export function k1ChecklistItems(variant: K1ChecklistVariant): K1ChecklistItem[] {
  return CODES_OF[variant].map((code, index) => ({ code, label: LABELS[code], order: index + 1 }));
}

function fail(problem: 'COMPLETION_NOT_ALLOWED' | 'K1_CHECKLIST_INCOMPLETE' | 'K1_CHECKLIST_OUT_OF_ORDER'): never {
  throw new RevocationCompletionError(problem);
}

/** The instant of a ticked step, or null when it is not ticked or has no instant. */
function tickedAt(item: K1ChecklistClaimItem | undefined): number | null {
  if (!item?.done || item.doneAt === undefined) return null;
  const time = Date.parse(item.doneAt);

  return Number.isNaN(time) ? null : time;
}

/**
 * The steps the IT Admin sent, found for each step of the variant. A step the variant does not have, or sent twice, does not belong to
 * this checklist (`COMPLETION_NOT_ALLOWED`); a step of the variant that is not sent, not ticked, or ticked with no instant is missing
 * (`K1_CHECKLIST_INCOMPLETE`). Returns the instants in the order of the list.
 */
function instantsOf(variant: K1ChecklistVariant, claim: K1ChecklistClaim): { item: K1ChecklistItem; time: number }[] {
  const codes = CODES_OF[variant];
  const sent = claim.items.map((item) => item.code);
  if (sent.some((code, index) => !codes.includes(code) || sent.indexOf(code) !== index)) fail('COMPLETION_NOT_ALLOWED');

  return k1ChecklistItems(variant).map((item) => {
    const time = tickedAt(claim.items.find((sentItem) => sentItem.code === item.code));
    if (time === null) fail('K1_CHECKLIST_INCOMPLETE');

    return { item, time };
  });
}

/**
 * The checklist of a K1 revocation that is completed (`QĐ-111az`, `US-07-05` AC-19, m-09): every step of the variant ticked with the instant
 * it was done, the instants not falling as the list goes (a step ticked before one that comes first in the list is out of order; the same
 * instant is in order, as a client may time to the second), and the evidence, which is the one written in the checklist or, when it has
 * none, the one written beside it. Another kind of provisioning has no checklist and refuses one. The variant is read from the sources, never
 * sent. Throws RevocationCompletionError (`COMPLETION_NOT_ALLOWED`, `K1_CHECKLIST_INCOMPLETE`, `K1_CHECKLIST_OUT_OF_ORDER`).
 */
export function planK1Checklist(input: {
  type: ProvisioningKind;
  sources: readonly RevocationSource[];
  claim: K1ChecklistClaim | undefined;
  /** The evidence written beside the checklist, in the body of the completion. */
  evidence: string;
}): K1ChecklistPlan | null {
  if (input.type !== 'K1') {
    if (input.claim !== undefined) fail('COMPLETION_NOT_ALLOWED');

    return null;
  }
  if (input.claim === undefined) fail('K1_CHECKLIST_INCOMPLETE');

  const variant = k1VariantOf(input.sources);
  const instants = instantsOf(variant, input.claim);
  const evidence = input.claim.evidence?.trim() || input.evidence.trim();
  if (evidence.length === 0) fail('K1_CHECKLIST_INCOMPLETE');
  if (instants.some(({ time }, index) => index > 0 && time < instants[index - 1].time))
    fail('K1_CHECKLIST_OUT_OF_ORDER');

  const items = instants.map(({ item, time }) => ({
    code: item.code,
    order: item.order,
    doneAt: new Date(time).toISOString(),
  }));

  return { variant, items, evidence, facts: { variant, doneCodes: items.map((item) => item.code) } };
}

/**
 * The checklist on the card of a task: what was ticked and when for a task that was completed (as it was kept, whatever the list is now),
 * the list of the variant with nothing ticked for one that is not.
 */
export function k1ChecklistCard(variant: K1ChecklistVariant, stored: StoredK1Checklist | null): K1ChecklistCard {
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

  return { variant, items: k1ChecklistItems(variant).map((item) => ({ ...item, doneAt: null })) };
}

/**
 * Whether the card of a K1 revocation carries a checklist: one to tick while the task can still be completed, and the one it was completed with
 * after (a task completed before the checklist existed, a cancelled one and one closed as failed show none).
 */
export function k1ChecklistShown(status: ProvisioningTaskStatus, kept: boolean): boolean {
  if (status === 'COMPLETED') return kept;

  return status !== 'CANCELLED' && status !== 'CLOSED_FAILED';
}
