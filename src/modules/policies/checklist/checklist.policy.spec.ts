import { autoReasonOf, evaluateChecklist, judgeDecision, type StepInForce } from './checklist.policy';

const VERSION = '019a0000-0000-7000-8000-000000000001';
const OLDER = '019a0000-0000-7000-8000-000000000000';

/** The step 1.2 as the policy of the flow words it: one question the system answers, three the person does. */
const STEP: StepInForce = {
  policyCode: 'POL-MF1',
  policyVersionId: VERSION,
  versionNumber: 2,
  step: {
    code: '1.2',
    title: 'Need',
    checklist: [
      { code: '1.2-01', text: 'The decider is the head of the department', check: 'SYSTEM' },
      { code: '1.2-04', text: 'The need is tied to the work of each person', check: 'PERSON' },
      { code: '1.2-05', text: 'The tools they have do not meet the need', check: 'PERSON' },
      { code: '1.2-06', text: 'The package and the term do not go over the need', check: 'PERSON' },
    ],
  },
};

const allYes = [
  { itemCode: '1.2-04', answer: 'YES' as const },
  { itemCode: '1.2-05', answer: 'YES' as const },
  { itemCode: '1.2-06', answer: 'YES' as const },
];

describe('evaluateChecklist', () => {
  it('accepts every question the person answers, and answers the question of the system itself with Yes', () => {
    const result = evaluateChecklist(STEP, { policyVersionId: VERSION, answers: allYes });

    expect(result).toEqual({
      ok: true,
      verdict: {
        policyVersionId: VERSION,
        versionNumber: 2,
        stepCode: '1.2',
        hasNo: false,
        noItems: [],
        answers: [
          { itemCode: '1.2-01', answer: 'YES', check: 'SYSTEM' },
          { itemCode: '1.2-04', answer: 'YES', check: 'PERSON' },
          { itemCode: '1.2-05', answer: 'YES', check: 'PERSON' },
          { itemCode: '1.2-06', answer: 'YES', check: 'PERSON' },
        ],
      },
    });
  });

  it('keeps the questions in the order of the policy, whatever the order of the answers', () => {
    const result = evaluateChecklist(STEP, { policyVersionId: VERSION, answers: [...allYes].reverse() });

    expect(result.ok && result.verdict.answers.map((answer) => answer.itemCode)).toEqual([
      '1.2-01',
      '1.2-04',
      '1.2-05',
      '1.2-06',
    ]);
  });

  it('reports a version that is no longer the one in force before anything else', () => {
    expect(evaluateChecklist(STEP, { policyVersionId: OLDER, answers: [] })).toEqual({
      ok: false,
      fault: { kind: 'VERSION_CHANGED', policyVersionId: VERSION, versionNumber: 2 },
    });
  });

  it('names the questions the person left unanswered', () => {
    const result = evaluateChecklist(STEP, { policyVersionId: VERSION, answers: [allYes[0]] });

    expect(result).toEqual({ ok: false, fault: { kind: 'INCOMPLETE', missing: ['1.2-05', '1.2-06'], unexpected: [] } });
  });

  it('names an answer to a question the step does not have, and a question answered twice', () => {
    const result = evaluateChecklist(STEP, {
      policyVersionId: VERSION,
      answers: [...allYes, { itemCode: '9.9-99', answer: 'YES' }, { itemCode: '1.2-04', answer: 'NO' }],
    });

    expect(result).toEqual({ ok: false, fault: { kind: 'INCOMPLETE', missing: [], unexpected: ['9.9-99', '1.2-04'] } });
  });

  it('takes the answer Yes to the question of the system and refuses any other', () => {
    expect(
      evaluateChecklist(STEP, {
        policyVersionId: VERSION,
        answers: [...allYes, { itemCode: '1.2-01', answer: 'YES' }],
      }).ok,
    ).toBe(true);
    expect(
      evaluateChecklist(STEP, {
        policyVersionId: VERSION,
        answers: [...allYes, { itemCode: '1.2-01', answer: 'NO' }],
      }),
    ).toEqual({ ok: false, fault: { kind: 'INCOMPLETE', missing: [], unexpected: ['1.2-01'] } });
  });

  it('lists the questions answered No with their words', () => {
    const result = evaluateChecklist(STEP, {
      policyVersionId: VERSION,
      answers: [allYes[0], { itemCode: '1.2-05', answer: 'NO' }, { itemCode: '1.2-06', answer: 'NO' }],
    });

    expect(result.ok && result.verdict.hasNo).toBe(true);
    expect(result.ok && result.verdict.noItems).toEqual([
      { code: '1.2-05', text: 'The tools they have do not meet the need' },
      { code: '1.2-06', text: 'The package and the term do not go over the need' },
    ]);
  });
});

const verdictOf = (answers: { itemCode: string; answer: 'YES' | 'NO' }[]) => {
  const result = evaluateChecklist(STEP, { policyVersionId: VERSION, answers });
  if (!result.ok) throw new Error('the checklist should be complete');

  return result.verdict;
};
const withNo = () => verdictOf([allYes[0], { itemCode: '1.2-05', answer: 'NO' }, allYes[2]]);
const clean = () => verdictOf(allYes);

describe('judgeDecision', () => {
  it('lets a decision that goes on through when every answer is Yes', () => {
    expect(judgeDecision(clean(), { decision: 'APPROVE' })).toEqual({ kind: 'ALLOWED', reason: null });
  });

  it.each(['APPROVE', 'CONFIRM', 'COMPLETE', 'KEEP', 'EXEMPT', 'ESCALATE'] as const)(
    'locks %s when an answer is No',
    (decision) => {
      expect(judgeDecision(withNo(), { decision })).toEqual({
        kind: 'HAS_NO',
        items: [{ code: '1.2-05', text: 'The tools they have do not meet the need' }],
      });
    },
  );

  it.each(['REJECT', 'RETURN'] as const)(
    'fills the reason of a %s from the questions answered No when none is given',
    (decision) => {
      expect(judgeDecision(withNo(), { decision })).toEqual({
        kind: 'ALLOWED',
        reason: '1.2-05 The tools they have do not meet the need',
      });
    },
  );

  it('keeps the reason the person typed over the one the answers give', () => {
    expect(judgeDecision(withNo(), { decision: 'REJECT', reason: '  Another tool does it  ' })).toEqual({
      kind: 'ALLOWED',
      reason: 'Another tool does it',
    });
  });

  it('asks for a reason when a refusal or a return has none and no answer is No', () => {
    expect(judgeDecision(clean(), { decision: 'REJECT' })).toEqual({ kind: 'REASON_REQUIRED' });
    expect(judgeDecision(clean(), { decision: 'RETURN', reason: '   ' })).toEqual({ kind: 'REASON_REQUIRED' });
  });

  it('lets a reclaim through whatever the answers are, as it takes a seat back', () => {
    expect(judgeDecision(withNo(), { decision: 'RECLAIM' })).toEqual({ kind: 'ALLOWED', reason: null });
  });
});

describe('autoReasonOf', () => {
  it('joins the questions answered No and stays within the longest reason a decision takes', () => {
    const items = Array.from({ length: 30 }, (_, index) => ({ code: `1.2-${index}`, text: 'x'.repeat(100) }));

    const reason = autoReasonOf(items);

    expect(reason.length).toBeLessThanOrEqual(1000);
    expect(reason.startsWith('1.2-0 xxx')).toBe(true);
    expect(reason.endsWith('…')).toBe(true);
  });
});
