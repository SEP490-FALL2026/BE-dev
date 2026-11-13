import { RevocationCompletionError } from '../../public/licensing.errors';
import {
  REVOCATION_SOURCES,
  type K1ChecklistCode,
  type K1ChecklistVariant,
  type ProvisioningKind,
  type RevocationSource,
} from '../../public/licensing.types';
import {
  k1ChecklistCard,
  k1ChecklistItems,
  k1ChecklistShown,
  k1VariantOf,
  planK1Checklist,
  type K1ChecklistClaim,
} from './provisioning-k1-checklist.policy';

const DEPARTURE_CODES: K1ChecklistCode[] = [
  'MAILBOX_PASSWORD_RESET',
  'SOFTWARE_FORGOT_PASSWORD',
  'SESSIONS_SIGNED_OUT',
  'RENEWAL_DISABLED',
  'EVIDENCE_RECORDED',
  'MAILBOX_LOCKED',
];
const STILL_EMPLOYED_CODES: K1ChecklistCode[] = ['RENEWAL_DISABLED', 'EVIDENCE_RECORDED'];

/** One minute apart from 08:00 UTC, in the order of the list. */
const at = (index: number): string => new Date(Date.UTC(2026, 10, 13, 8, index)).toISOString();

/** A claim with every step of the variant ticked in order, and the evidence (`null`: the checklist carries none). */
function claimOf(
  variant: K1ChecklistVariant,
  evidence: string | null = 'Đã tắt gia hạn trên cổng nhà cung cấp',
): K1ChecklistClaim {
  const codes = variant === 'DEPARTURE' ? DEPARTURE_CODES : STILL_EMPLOYED_CODES;

  return {
    items: codes.map((code, index) => ({ code, done: true, doneAt: at(index) })),
    ...(evidence === null ? {} : { evidence }),
  };
}

function plan(
  claim: K1ChecklistClaim | undefined,
  options: { sources?: RevocationSource[]; type?: ProvisioningKind; evidence?: string; lastOfPerson?: boolean } = {},
) {
  return planK1Checklist({
    type: options.type ?? 'K1',
    sources: options.sources ?? ['DEPARTURE'],
    claim,
    evidence: options.evidence ?? '',
    lastOfPerson: options.lastOfPerson ?? true,
  });
}

const problemOf = (run: () => unknown): string | undefined => {
  try {
    run();
  } catch (error) {
    return error instanceof RevocationCompletionError ? error.problem : `not a completion error: ${String(error)}`;
  }

  return undefined;
};

describe("k1VariantOf (the variant is the server's, from the sources of the revocation)", () => {
  it.each(REVOCATION_SOURCES)('%s decides the variant', (source) => {
    const departs = source === 'DEPARTURE' || source === 'ABRUPT_DEPARTURE';

    expect(k1VariantOf([source])).toBe(departs ? 'DEPARTURE' : 'STILL_EMPLOYED');
  });

  it('is DEPARTURE when any reason that stands is a departure, whichever came first (one task, many reasons)', () => {
    expect(k1VariantOf(['TIME_LIMITED_EXPIRY', 'ABRUPT_DEPARTURE'])).toBe('DEPARTURE');
    expect(k1VariantOf(['DEPARTURE', 'RETURN'])).toBe('DEPARTURE');
  });

  it('is STILL_EMPLOYED when no source is given: the person is not known to leave', () => {
    expect(k1VariantOf([])).toBe('STILL_EMPLOYED');
  });
});

describe('k1ChecklistItems (the list of each variant)', () => {
  it('DEPARTURE has six steps in order, the mailbox lock last', () => {
    const items = k1ChecklistItems('DEPARTURE', true);

    expect(items.map((item) => [item.order, item.code])).toEqual(
      DEPARTURE_CODES.map((code, index) => [index + 1, code]),
    );
    expect(items.every((item) => item.label.length > 0)).toBe(true);
  });

  it('STILL_EMPLOYED has the renewal and the evidence only: no mailbox reset, no lock', () => {
    const items = k1ChecklistItems('STILL_EMPLOYED', true);

    expect(items.map((item) => [item.order, item.code])).toEqual([
      [1, 'RENEWAL_DISABLED'],
      [2, 'EVIDENCE_RECORDED'],
    ]);
  });
});

describe('planK1Checklist', () => {
  it.each<[string, RevocationSource[], K1ChecklistVariant]>([
    ['a departure', ['DEPARTURE'], 'DEPARTURE'],
    ['an abrupt departure', ['ABRUPT_DEPARTURE'], 'DEPARTURE'],
    ['a return', ['RETURN'], 'STILL_EMPLOYED'],
    ['a ghost seat', ['GHOST_SEAT'], 'STILL_EMPLOYED'],
    ['a transfer', ['TRANSFER'], 'STILL_EMPLOYED'],
  ])('stores the checklist of %s as the %s variant it is', (_label, sources, variant) => {
    const done = plan(claimOf(variant), { sources });

    expect(done?.variant).toBe(variant);
    expect(done?.items.map((item) => item.code)).toEqual(
      variant === 'DEPARTURE' ? DEPARTURE_CODES : STILL_EMPLOYED_CODES,
    );
    expect(done?.items.map((item) => item.order)).toEqual(variant === 'DEPARTURE' ? [1, 2, 3, 4, 5, 6] : [1, 2]);
    expect(done?.evidence).toBe('Đã tắt gia hạn trên cổng nhà cung cấp');
    expect(done?.facts).toEqual({ variant, doneCodes: done?.items.map((item) => item.code) });
  });

  it('reads MAILBOX_LOCKED among the ticked steps of a departure, and never in a checklist of someone who still works', () => {
    expect(plan(claimOf('DEPARTURE'))?.facts.doneCodes).toContain('MAILBOX_LOCKED');
    expect(plan(claimOf('STILL_EMPLOYED'), { sources: ['RETURN'] })?.facts.doneCodes).not.toContain('MAILBOX_LOCKED');
  });

  it('stores the steps by their order whatever order they were sent in, with the time as an ISO instant', () => {
    const sent = claimOf('DEPARTURE');
    const done = plan({ ...sent, items: [...sent.items].reverse() });

    expect(done?.items.map((item) => item.order)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(done?.items[0]).toEqual({ code: 'MAILBOX_PASSWORD_RESET', order: 1, doneAt: at(0) });
  });

  it('leaves a kind other than K1 without a checklist, and refuses one sent for it', () => {
    expect(plan(undefined, { type: 'K2' })).toBeNull();
    expect(problemOf(() => plan(claimOf('DEPARTURE'), { type: 'K2' }))).toBe('COMPLETION_NOT_ALLOWED');
    expect(problemOf(() => plan(claimOf('DEPARTURE'), { type: 'K4' }))).toBe('COMPLETION_NOT_ALLOWED');
  });

  describe('a K1 checklist that is not complete', () => {
    it('is required: none sent is incomplete', () => {
      expect(problemOf(() => plan(undefined))).toBe('K1_CHECKLIST_INCOMPLETE');
    });

    it.each(DEPARTURE_CODES)('a departure without %s is incomplete', (missing) => {
      const sent = claimOf('DEPARTURE');

      expect(problemOf(() => plan({ ...sent, items: sent.items.filter((item) => item.code !== missing) }))).toBe(
        'K1_CHECKLIST_INCOMPLETE',
      );
    });

    it('a step sent as not done is incomplete (the list can carry every step with its flag)', () => {
      const sent = claimOf('STILL_EMPLOYED');
      const items = sent.items.map((item) => (item.code === 'EVIDENCE_RECORDED' ? { ...item, done: false } : item));

      expect(problemOf(() => plan({ ...sent, items }, { sources: ['RETURN'] }))).toBe('K1_CHECKLIST_INCOMPLETE');
    });

    it('a step ticked with no time, or a time that is no instant, is incomplete', () => {
      const sent = claimOf('STILL_EMPLOYED');
      const options = { sources: ['RETURN'] as RevocationSource[] };

      expect(
        problemOf(() => plan({ ...sent, items: [{ code: 'RENEWAL_DISABLED', done: true }, sent.items[1]] }, options)),
      ).toBe('K1_CHECKLIST_INCOMPLETE');
      expect(
        problemOf(() =>
          plan(
            { ...sent, items: [{ code: 'RENEWAL_DISABLED', done: true, doneAt: 'yesterday' }, sent.items[1]] },
            options,
          ),
        ),
      ).toBe('K1_CHECKLIST_INCOMPLETE');
    });

    it.each([
      ['none', null],
      ['blank', '   '],
    ])('no evidence (%s) is incomplete, in the checklist or beside it', (_label, evidence) => {
      expect(problemOf(() => plan(claimOf('DEPARTURE', evidence)))).toBe('K1_CHECKLIST_INCOMPLETE');
      expect(problemOf(() => plan(claimOf('DEPARTURE', evidence), { evidence: '  ' }))).toBe('K1_CHECKLIST_INCOMPLETE');
    });

    it("takes the evidence written beside the checklist when the checklist has none, and the checklist's own when both are written", () => {
      expect(plan(claimOf('DEPARTURE', null), { evidence: ' ticket IT-9 ' })?.evidence).toBe('ticket IT-9');
      expect(plan(claimOf('DEPARTURE', 'in the checklist'), { evidence: 'beside it' })?.evidence).toBe(
        'in the checklist',
      );
    });
  });

  describe('a K1 checklist that does not fit the variant', () => {
    it('a step the variant does not have is refused: a mailbox lock for a person who still works', () => {
      const sent = claimOf('STILL_EMPLOYED');
      const items = [...sent.items, { code: 'MAILBOX_LOCKED' as const, done: true, doneAt: at(9) }];

      expect(problemOf(() => plan({ ...sent, items }, { sources: ['RETURN'] }))).toBe('COMPLETION_NOT_ALLOWED');
    });

    it('a departure checklist for someone who still works is refused, and the other way round it is incomplete', () => {
      expect(problemOf(() => plan(claimOf('DEPARTURE'), { sources: ['TIME_LIMITED_EXPIRY'] }))).toBe(
        'COMPLETION_NOT_ALLOWED',
      );
      expect(problemOf(() => plan(claimOf('STILL_EMPLOYED'), { sources: ['DEPARTURE'] }))).toBe(
        'K1_CHECKLIST_INCOMPLETE',
      );
    });

    it('a step sent twice is refused', () => {
      const sent = claimOf('STILL_EMPLOYED');

      expect(problemOf(() => plan({ ...sent, items: [...sent.items, sent.items[0]] }, { sources: ['RETURN'] }))).toBe(
        'COMPLETION_NOT_ALLOWED',
      );
    });
  });

  describe('the steps are ticked in their order (m-09)', () => {
    const swap = (claim: K1ChecklistClaim, first: K1ChecklistCode, second: K1ChecklistCode): K1ChecklistClaim => {
      const timeOf = (code: K1ChecklistCode) => claim.items.find((item) => item.code === code)?.doneAt;

      return {
        ...claim,
        items: claim.items.map((item) =>
          item.code === first
            ? { ...item, doneAt: timeOf(second) }
            : item.code === second
              ? { ...item, doneAt: timeOf(first) }
              : item,
        ),
      };
    };

    it('the mailbox lock (6) ticked before the sign-out of the sessions (3) is out of order', () => {
      expect(problemOf(() => plan(swap(claimOf('DEPARTURE'), 'SESSIONS_SIGNED_OUT', 'MAILBOX_LOCKED')))).toBe(
        'K1_CHECKLIST_OUT_OF_ORDER',
      );
    });

    it('two neighbours the wrong way round are out of order', () => {
      expect(problemOf(() => plan(swap(claimOf('DEPARTURE'), 'RENEWAL_DISABLED', 'EVIDENCE_RECORDED')))).toBe(
        'K1_CHECKLIST_OUT_OF_ORDER',
      );
      expect(
        problemOf(() =>
          plan(swap(claimOf('STILL_EMPLOYED'), 'RENEWAL_DISABLED', 'EVIDENCE_RECORDED'), { sources: ['GHOST_SEAT'] }),
        ),
      ).toBe('K1_CHECKLIST_OUT_OF_ORDER');
    });

    it('steps ticked at the same instant are in order: a client may time to the second', () => {
      const sent = claimOf('DEPARTURE');
      const together = { ...sent, items: sent.items.map((item) => ({ ...item, doneAt: at(0) })) };

      expect(plan(together)?.items).toHaveLength(6);
    });

    it('an instant is compared as an instant, not as text: +07:00 and Z of the same moment are in order', () => {
      const sent = claimOf('STILL_EMPLOYED');
      const items = [
        { code: 'RENEWAL_DISABLED' as const, done: true, doneAt: '2026-11-13T15:00:00.000+07:00' },
        { code: 'EVIDENCE_RECORDED' as const, done: true, doneAt: '2026-11-13T08:00:01.000Z' },
      ];

      expect(plan({ ...sent, items }, { sources: ['RETURN'] })?.items.map((item) => item.doneAt)).toEqual([
        '2026-11-13T08:00:00.000Z',
        '2026-11-13T08:00:01.000Z',
      ]);
    });

    it('what is missing is told before what is out of order', () => {
      const sent = swap(claimOf('DEPARTURE'), 'SESSIONS_SIGNED_OUT', 'MAILBOX_LOCKED');

      expect(
        problemOf(() => plan({ ...sent, items: sent.items.filter((item) => item.code !== 'RENEWAL_DISABLED') })),
      ).toBe('K1_CHECKLIST_INCOMPLETE');
    });
  });
});

describe('k1ChecklistCard (what the card of the task shows)', () => {
  it('an open task shows the list of its variant with nothing ticked', () => {
    const card = k1ChecklistCard('STILL_EMPLOYED', null, true);

    expect(card.variant).toBe('STILL_EMPLOYED');
    expect(card.items.map((item) => [item.code, item.order, item.doneAt])).toEqual([
      ['RENEWAL_DISABLED', 1, null],
      ['EVIDENCE_RECORDED', 2, null],
    ]);
    expect(card.items.every((item) => item.label.length > 0)).toBe(true);
  });

  it('a completed task shows what was ticked and when, as it was stored', () => {
    const stored = plan(claimOf('DEPARTURE'));
    if (!stored) throw new Error('the checklist was not planned');
    const card = k1ChecklistCard(stored.variant, { variant: stored.variant, items: stored.items }, true);

    expect(card.items.map((item) => [item.code, item.order, item.doneAt])).toEqual(
      DEPARTURE_CODES.map((code, index) => [code, index + 1, at(index)]),
    );
  });
});

describe('the mailbox lock belongs to the last K1 revocation of the person (R-1, S17, P28)', () => {
  const FIVE = DEPARTURE_CODES.slice(0, 5);
  const withoutLock = (claim: K1ChecklistClaim): K1ChecklistClaim => ({
    ...claim,
    items: claim.items.filter((item) => item.code !== 'MAILBOX_LOCKED'),
  });

  it('a departure that is not the last has the five steps before the lock; the last has the six; a person who still works has two either way', () => {
    expect(k1ChecklistItems('DEPARTURE', false).map((item) => [item.order, item.code])).toEqual(
      FIVE.map((step, index) => [index + 1, step]),
    );
    expect(k1ChecklistItems('DEPARTURE', true)).toHaveLength(6);
    expect(k1ChecklistItems('STILL_EMPLOYED', false)).toEqual(k1ChecklistItems('STILL_EMPLOYED', true));
  });

  it('is completed with the five steps when another K1 revocation of the person is to do, and the listeners are not told of a lock', () => {
    const done = plan(withoutLock(claimOf('DEPARTURE')), { lastOfPerson: false });

    expect(done?.items.map((item) => item.code)).toEqual(FIVE);
    expect(done?.facts).toEqual({ variant: 'DEPARTURE', doneCodes: FIVE });
  });

  it('refuses the lock on a task that is not the last: COMPLETION_NOT_ALLOWED, whatever the other steps', () => {
    expect(problemOf(() => plan(claimOf('DEPARTURE'), { lastOfPerson: false }))).toBe('COMPLETION_NOT_ALLOWED');
  });

  it('asks the lock of the last: five steps are incomplete, and the lock ticked before the sign-out of the sessions is out of order', () => {
    expect(problemOf(() => plan(withoutLock(claimOf('DEPARTURE')), { lastOfPerson: true }))).toBe(
      'K1_CHECKLIST_INCOMPLETE',
    );
  });

  it('a person who still works is not asked for a lock whether or not another revocation is to do', () => {
    for (const lastOfPerson of [true, false]) {
      expect(plan(claimOf('STILL_EMPLOYED'), { sources: ['RETURN'], lastOfPerson })?.facts.doneCodes).toEqual(
        STILL_EMPLOYED_CODES,
      );
    }
  });

  it('the card of a departure that is not the last lists the five steps to tick', () => {
    expect(k1ChecklistCard('DEPARTURE', null, false).items.map((item) => item.code)).toEqual(FIVE);
    expect(k1ChecklistCard('DEPARTURE', null, true).items).toHaveLength(6);
  });
});

describe('k1ChecklistShown', () => {
  it.each(['QUEUED', 'RETRY_SCHEDULED', 'IN_PROGRESS', 'FAILED'] as const)(
    'a %s task shows the list to tick',
    (status) => {
      expect(k1ChecklistShown(status, false)).toBe(true);
    },
  );

  it('a completed task shows the checklist it was completed with, and none when it was completed before the checklist', () => {
    expect(k1ChecklistShown('COMPLETED', true)).toBe(true);
    expect(k1ChecklistShown('COMPLETED', false)).toBe(false);
  });

  it.each(['CANCELLED', 'CLOSED_FAILED'] as const)('a %s task shows none: nothing is left to tick', (status) => {
    expect(k1ChecklistShown(status, false)).toBe(false);
  });
});
