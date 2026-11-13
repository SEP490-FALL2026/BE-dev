import { RevocationCompletionError } from '../../public/licensing.errors';
import { planK1Checklist, type K1ChecklistClaim } from './provisioning-k1-checklist.policy';

/** The instant the task was made; the steps are ticked at minutes around it. */
const OPENED = new Date(Date.UTC(2026, 10, 13, 8, 0));
const minutesAfter = (minutes: number): string => new Date(OPENED.getTime() + minutes * 60_000).toISOString();

/** The two steps of a person who still works, ticked at the given minutes from the moment the task was made. */
const claimAt = (renewal: number, evidence: number): K1ChecklistClaim => ({
  items: [
    { code: 'RENEWAL_DISABLED', done: true, doneAt: minutesAfter(renewal) },
    { code: 'EVIDENCE_RECORDED', done: true, doneAt: minutesAfter(evidence) },
  ],
  evidence: 'đã hủy gia hạn',
});

const plan = (claim: K1ChecklistClaim) =>
  planK1Checklist({ type: 'K1', sources: ['RETURN'], claim, evidence: '', lastOfPerson: true });

/**
 * A step done before the task was made is taken as done then: the password of the mailbox is reset when access is blocked, before the IT
 * Admin opens the revocation (`QĐ-110b`, `QĐ-110c`, D-64). Only the order of the list counts.
 */
describe('a step of a K1 checklist done before the task was made (D-64)', () => {
  it.each([
    ['every step, an hour before', -60, -50],
    ['the first step only', -1, 5],
    ['both steps, a minute or two before', -2, -1],
  ])('takes %s as done when it was done', (_label, renewal, evidence) => {
    expect(plan(claimAt(renewal, evidence))?.items.map((item) => item.doneAt)).toEqual([
      minutesAfter(renewal),
      minutesAfter(evidence),
    ]);
  });

  it('still refuses a step done before the one that comes first in the list', () => {
    let problem: string | undefined;
    try {
      plan(claimAt(-5, -10));
    } catch (error) {
      problem = error instanceof RevocationCompletionError ? error.problem : undefined;
    }

    expect(problem).toBe('K1_CHECKLIST_OUT_OF_ORDER');
  });

  it('takes steps at the very instant the task was made, after it, or far ahead (the future is not blocked, D-55)', () => {
    expect(plan(claimAt(0, 0))?.items).toHaveLength(2);
    expect(plan(claimAt(60 * 24, 60 * 24 + 1))?.items).toHaveLength(2);
  });
});
