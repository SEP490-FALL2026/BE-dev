import { RevocationCompletionError } from '../../public/licensing.errors';
import { planK1Checklist, type K1ChecklistClaim } from './provisioning-k1-checklist.policy';

/** The instant the task was made; a step is never ticked before it (review O2). */
const OPENED = new Date(Date.UTC(2026, 10, 13, 8, 0));
const minutesAfter = (minutes: number): string => new Date(OPENED.getTime() + minutes * 60_000).toISOString();

/** The two steps of a person who still works, ticked at the given minutes after the task was made. */
const claimAt = (renewal: number, evidence: number): K1ChecklistClaim => ({
  items: [
    { code: 'RENEWAL_DISABLED', done: true, doneAt: minutesAfter(renewal) },
    { code: 'EVIDENCE_RECORDED', done: true, doneAt: minutesAfter(evidence) },
  ],
  evidence: 'đã hủy gia hạn',
});

const plan = (claim: K1ChecklistClaim) =>
  planK1Checklist({ type: 'K1', sources: ['RETURN'], claim, evidence: '', lastOfPerson: true, openedAt: OPENED });

const refusalOf = (claim: K1ChecklistClaim): RevocationCompletionError | undefined => {
  try {
    plan(claim);
  } catch (error) {
    return error instanceof RevocationCompletionError ? error : undefined;
  }

  return undefined;
};

describe('a step of a K1 checklist is not ticked before the task was made (review O2)', () => {
  it.each([
    ['every step', -60, -50],
    ['the first step', -1, 5],
    ['both steps, a minute or two before', -2, -1],
  ])(
    'refuses %s ticked before the task: K1_CHECKLIST_OUT_OF_ORDER, with the variant and the steps',
    (_label, renewal, evidence) => {
      const refusal = refusalOf(claimAt(renewal, evidence));

      expect(refusal?.problem).toBe('K1_CHECKLIST_OUT_OF_ORDER');
      expect(refusal?.expected).toEqual({
        variant: 'STILL_EMPLOYED',
        codes: ['RENEWAL_DISABLED', 'EVIDENCE_RECORDED'],
      });
    },
  );

  it('takes a step ticked at the very instant the task was made, after it, or far ahead (the future is not blocked, D-55)', () => {
    expect(plan(claimAt(0, 0))?.items.map((item) => item.doneAt)).toEqual([minutesAfter(0), minutesAfter(0)]);
    expect(plan(claimAt(1, 2))?.items).toHaveLength(2);
    expect(plan(claimAt(60 * 24, 60 * 24 + 1))?.items).toHaveLength(2);
  });

  it('tells what is missing before a step that is too early', () => {
    const early = claimAt(-5, -4);

    expect(refusalOf({ ...early, items: early.items.slice(1) })?.problem).toBe('K1_CHECKLIST_INCOMPLETE');
    expect(refusalOf({ ...early, evidence: '' })?.problem).toBe('K1_CHECKLIST_INCOMPLETE');
  });
});
