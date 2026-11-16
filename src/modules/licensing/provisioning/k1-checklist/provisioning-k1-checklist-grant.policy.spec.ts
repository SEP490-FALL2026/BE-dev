import { ProvisioningK1ChecklistError } from '../provisioning.errors';
import type { K1ChecklistCode, ProvisioningKind } from '../../public/licensing.types';
import {
  k1ChecklistCard,
  k1ChecklistItems,
  k1ChecklistShown,
  planK1GrantChecklist,
  type K1ChecklistClaim,
} from './provisioning-k1-checklist.policy';

/** The two steps of the grant of a K1 seat, in the order they are done (`QĐ-111az`, `US-07-01` AC-7). */
const GRANT_CODES: K1ChecklistCode[] = ['COMPANY_EMAIL_REGISTERED', 'NO_PERSONAL_DEVICE_MFA'];

/** One minute apart from 08:00 UTC, in the order of the list. */
const at = (index: number): string => new Date(Date.UTC(2026, 10, 15, 8, index)).toISOString();

/** A claim with both steps ticked in order, and the evidence (`null`: the checklist carries none). */
function claimOf(evidence: string | null = 'Đã đăng ký gói tháng trên e1@congty.vn'): K1ChecklistClaim {
  return {
    items: GRANT_CODES.map((code, index) => ({ code, done: true, doneAt: at(index) })),
    ...(evidence === null ? {} : { evidence }),
  };
}

const plan = (claim: K1ChecklistClaim | undefined, options: { type?: ProvisioningKind; evidence?: string } = {}) =>
  planK1GrantChecklist({ type: options.type ?? 'K1', claim, evidence: options.evidence ?? '' });

/** What a refused checklist of a grant says: the problem, and what the server expects of the task. */
function refusalOf(run: () => unknown): ProvisioningK1ChecklistError | undefined {
  try {
    run();
  } catch (error) {
    if (error instanceof ProvisioningK1ChecklistError) return error;
    throw error;
  }

  return undefined;
}

const EXPECTED = { variant: 'GRANT', codes: GRANT_CODES };

describe('the steps of the grant of a K1 seat (QĐ-111az)', () => {
  it('are two, each with its text and its place from 1: the company email first, then no multi-factor sign-in on a personal device', () => {
    const items = k1ChecklistItems('GRANT', true);

    expect(items.map((item) => [item.order, item.code])).toEqual([
      [1, 'COMPANY_EMAIL_REGISTERED'],
      [2, 'NO_PERSONAL_DEVICE_MFA'],
    ]);
    expect(items.every((item) => item.label.length > 0)).toBe(true);
  });

  it('are the same whether or not other K1 seats of the person are still to revoke: the grant has no lock of the mailbox', () => {
    expect(k1ChecklistItems('GRANT', false)).toEqual(k1ChecklistItems('GRANT', true));
  });
});

describe('planK1GrantChecklist: the checklist that completes the grant of a K1 seat', () => {
  it('keeps both steps with the instant each was done, in UTC, and the evidence of the checklist', () => {
    const planned = plan(claimOf());

    expect(planned).toMatchObject({
      variant: 'GRANT',
      evidence: 'Đã đăng ký gói tháng trên e1@congty.vn',
      items: [
        { code: 'COMPANY_EMAIL_REGISTERED', order: 1, doneAt: at(0) },
        { code: 'NO_PERSONAL_DEVICE_MFA', order: 2, doneAt: at(1) },
      ],
    });
  });

  it('takes the evidence written beside the checklist when the checklist has none, and the checklist one when both are there', () => {
    expect(plan(claimOf(null), { evidence: '  ghi chú ngoài  ' })?.evidence).toBe('ghi chú ngoài');
    expect(plan(claimOf('trong checklist'), { evidence: 'ghi chú ngoài' })?.evidence).toBe('trong checklist');
  });

  it('takes an instant with an offset as the same moment in UTC, and the same instant for both steps as in order', () => {
    const claim: K1ChecklistClaim = {
      items: [
        { code: 'COMPANY_EMAIL_REGISTERED', done: true, doneAt: '2026-11-15T15:00:00+07:00' },
        { code: 'NO_PERSONAL_DEVICE_MFA', done: true, doneAt: '2026-11-15T08:00:00.000Z' },
      ],
      evidence: 'ok',
    };

    expect(plan(claim)?.items.map((item) => item.doneAt)).toEqual([
      '2026-11-15T08:00:00.000Z',
      '2026-11-15T08:00:00.000Z',
    ]);
  });

  it('does not refuse a step ticked before the task was made or ahead of the clock: only the order of the list counts', () => {
    const claim = claimOf();
    claim.items[0].doneAt = '2020-01-01T00:00:00.000Z';
    claim.items[1].doneAt = '2099-01-01T00:00:00.000Z';

    expect(plan(claim)?.items).toHaveLength(2);
  });

  describe('the checklist is missing something (K1_CHECKLIST_INCOMPLETE, telling what is expected)', () => {
    it('sent for no step at all, or not sent', () => {
      expect(refusalOf(() => plan(undefined))).toMatchObject({
        problem: 'K1_CHECKLIST_INCOMPLETE',
        expected: EXPECTED,
      });
      expect(refusalOf(() => plan({ items: [], evidence: 'ok' }))).toMatchObject({
        problem: 'K1_CHECKLIST_INCOMPLETE',
      });
    });

    it.each<[string, (claim: K1ChecklistClaim) => void]>([
      ['only the first step ticked', (claim) => claim.items.pop()],
      ['only the second step ticked', (claim) => claim.items.shift()],
      ['a step sent with done false', (claim) => (claim.items[1].done = false)],
      ['a step ticked with no instant', (claim) => delete claim.items[0].doneAt],
      ['a step ticked with an instant that is not a time', (claim) => (claim.items[0].doneAt = 'yesterday')],
    ])('%s', (_label, change) => {
      const claim = claimOf();
      change(claim);

      expect(refusalOf(() => plan(claim))).toMatchObject({ problem: 'K1_CHECKLIST_INCOMPLETE', expected: EXPECTED });
    });

    it('both steps ticked and no evidence, in the checklist or beside it', () => {
      expect(refusalOf(() => plan(claimOf(null)))).toMatchObject({
        problem: 'K1_CHECKLIST_INCOMPLETE',
        expected: EXPECTED,
      });
      expect(refusalOf(() => plan(claimOf('   '), { evidence: '  ' }))).toMatchObject({
        problem: 'K1_CHECKLIST_INCOMPLETE',
      });
    });
  });

  describe('the steps are not in their order (K1_CHECKLIST_OUT_OF_ORDER)', () => {
    it('the second step is timed before the first', () => {
      const claim = claimOf();
      claim.items[0].doneAt = at(5);
      claim.items[1].doneAt = at(1);

      expect(refusalOf(() => plan(claim))).toMatchObject({ problem: 'K1_CHECKLIST_OUT_OF_ORDER', expected: EXPECTED });
    });

    it('is the order of the list, not the order the steps were sent in', () => {
      const claim = claimOf();
      claim.items.reverse();

      expect(plan(claim)?.items.map((item) => item.code)).toEqual(GRANT_CODES);
    });

    it('is told after a missing step: a step that is missing is reported first', () => {
      const claim = claimOf();
      claim.items[0].doneAt = at(5);
      claim.items[1].doneAt = at(1);
      claim.items[1].done = false;

      expect(refusalOf(() => plan(claim))?.problem).toBe('K1_CHECKLIST_INCOMPLETE');
    });
  });

  describe('a step the grant does not have (K1_CHECKLIST_NOT_ALLOWED)', () => {
    it.each<K1ChecklistCode>(['RENEWAL_DISABLED', 'EVIDENCE_RECORDED', 'MAILBOX_LOCKED', 'MAILBOX_PASSWORD_RESET'])(
      'refuses %s, a step of a revocation',
      (code) => {
        const claim = claimOf();
        claim.items.push({ code, done: true, doneAt: at(9) });

        expect(refusalOf(() => plan(claim))).toMatchObject({ problem: 'K1_CHECKLIST_NOT_ALLOWED', expected: EXPECTED });
      },
    );

    it('refuses a step sent twice', () => {
      const claim = claimOf();
      claim.items.push({ ...claim.items[0] });

      expect(refusalOf(() => plan(claim))?.problem).toBe('K1_CHECKLIST_NOT_ALLOWED');
    });
  });

  describe('a grant of another kind of provisioning has no checklist', () => {
    it.each<ProvisioningKind>(['K2', 'K3', 'K4', 'K5'])('%s: none to keep, and one that is sent is refused', (type) => {
      expect(plan(undefined, { type, evidence: 'ok' })).toBeNull();
      // Nothing is told of the steps: this kind of grant has none.
      const refused = refusalOf(() => plan(claimOf(), { type }));
      expect(refused?.problem).toBe('K1_CHECKLIST_NOT_ALLOWED');
      expect(refused?.expected).toBeUndefined();
    });
  });
});

describe('the checklist on the card of a K1 grant', () => {
  it('is the two steps with nothing ticked while the task is not completed', () => {
    const card = k1ChecklistCard('GRANT', null, true);

    expect(card.variant).toBe('GRANT');
    expect(card.items.map((item) => [item.order, item.code, item.doneAt])).toEqual([
      [1, 'COMPANY_EMAIL_REGISTERED', null],
      [2, 'NO_PERSONAL_DEVICE_MFA', null],
    ]);
  });

  it('is what was ticked, with the instant, once the task is completed', () => {
    const stored = plan(claimOf());
    const card = k1ChecklistCard('GRANT', stored && { variant: stored.variant, items: stored.items }, true);

    expect(card.items.map((item) => [item.code, item.doneAt])).toEqual([
      ['COMPANY_EMAIL_REGISTERED', at(0)],
      ['NO_PERSONAL_DEVICE_MFA', at(1)],
    ]);
  });

  it('is shown on a grant that can still be completed, and on one completed with a checklist, as on a revocation', () => {
    expect(k1ChecklistShown('IN_PROGRESS', false)).toBe(true);
    expect(k1ChecklistShown('COMPLETED', true)).toBe(true);
    expect(k1ChecklistShown('COMPLETED', false)).toBe(false);
    expect(k1ChecklistShown('CANCELLED', false)).toBe(false);
  });
});
