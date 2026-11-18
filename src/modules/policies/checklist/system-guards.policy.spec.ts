import { INITIAL_POLICIES } from '../initial/initial-policies.policy';
import { evaluateChecklist, type StepInForce } from './checklist.policy';
import { SYSTEM_GUARDS, uncheckedSystemItems } from './system-guards.policy';

const systemItemsOfInitialPolicies = INITIAL_POLICIES.flatMap((policy) =>
  policy.content.steps.flatMap((step) =>
    step.checklist.filter((item) => item.check === 'SYSTEM').map((item) => item.code),
  ),
);

describe('the guards behind the questions the system answers (QĐ-111ap, Bộ chính sách khởi tạo "Đã chốt" mục 8)', () => {
  it('names the guard of every question the initial policies have the system answer, and of no other: a library that adds a question has to name its guard', () => {
    expect(Object.keys(SYSTEM_GUARDS).sort()).toEqual([...systemItemsOfInitialPolicies].sort());
    expect(systemItemsOfInitialPolicies).toHaveLength(16);
    for (const guard of Object.values(SYSTEM_GUARDS)) expect(guard.guard.length).toBeGreaterThan(10);
  });

  it('keeps every question the system answers as checked in a decision that goes on, but the ones the step cannot make again', () => {
    expect(uncheckedSystemItems('1.2', 'APPROVE')).toEqual([]);
    expect(uncheckedSystemItems('1.3', 'COMPLETE')).toEqual([]);
    expect(uncheckedSystemItems('1.6', 'CONFIRM')).toEqual([]);
    expect(uncheckedSystemItems('1.7', 'APPROVE')).toEqual([]);
    expect(uncheckedSystemItems('4.7', 'APPROVE')).toEqual([]);
    expect(uncheckedSystemItems('5.4', 'KEEP')).toEqual([]);
  });

  it('leaves unchecked what the check made again at the decision answers, when the decision does not make it: a refusal or a return of the spend', () => {
    expect(uncheckedSystemItems('1.7', 'RETURN')).toEqual(['1.7-02', '1.7-03']);
    expect(uncheckedSystemItems('1.7', 'REJECT')).toEqual(['1.7-02', '1.7-03']);
  });

  it('leaves unchecked the term left of a right at the push, which does not make the check of the recommendation again', () => {
    expect(uncheckedSystemItems('5.3', 'ESCALATE')).toEqual(['5.3-02']);
  });

  it('leaves unchecked the ceiling of the year for a version that is sent back', () => {
    expect(uncheckedSystemItems('4.7', 'RETURN')).toEqual(['4.7-02']);
  });

  it('leaves unchecked that the head approved the need for a request that has no step of the head, whatever the decision', () => {
    for (const decision of ['COMPLETE', 'REJECT', 'RETURN'] as const) {
      expect(uncheckedSystemItems('1.3', decision, { oneStep: true })).toEqual(['1.3-01']);
      expect(uncheckedSystemItems('1.3', decision, { oneStep: false })).toEqual([]);
    }
  });

  it('keeps no question as unchecked in the steps of the head, of the reserve, of the seats and of the push', () => {
    for (const decision of ['APPROVE', 'REJECT', 'RETURN'] as const) {
      expect(uncheckedSystemItems('1.2', decision)).toEqual([]);
    }
    expect(uncheckedSystemItems('5.4', 'RECLAIM')).toEqual([]);
    expect(uncheckedSystemItems('1.6', 'CONFIRM', { oneStep: true })).toEqual([]);
  });
});

describe('the answers of the system in the verdict', () => {
  const STEP: StepInForce = {
    policyCode: 'POL-MF1',
    policyVersionId: '019a0000-0000-7000-8000-000000000001',
    versionNumber: 1,
    step: {
      code: '1.7',
      title: 'Spend',
      checklist: [
        { code: '1.7-01', text: 'The decider is no party', check: 'SYSTEM' },
        { code: '1.7-03', text: 'Checked again at the decision', check: 'SYSTEM' },
        { code: '1.7-05', text: 'The need is as the head said', check: 'PERSON' },
      ],
    },
  };
  const answers = [{ itemCode: '1.7-05', answer: 'YES' as const }];

  it('keeps a question the system did not check as not checked, never as Yes', () => {
    const result = evaluateChecklist(STEP, { policyVersionId: STEP.policyVersionId, answers }, ['1.7-03']);

    expect(result.ok && result.verdict.answers).toEqual([
      { itemCode: '1.7-01', answer: 'YES', check: 'SYSTEM' },
      { itemCode: '1.7-03', answer: 'NOT_CHECKED', check: 'SYSTEM' },
      { itemCode: '1.7-05', answer: 'YES', check: 'PERSON' },
    ]);
  });

  it('keeps every question the system answers as Yes when none is left unchecked, and still refuses a No given to one', () => {
    const kept = evaluateChecklist(STEP, { policyVersionId: STEP.policyVersionId, answers });
    const refused = evaluateChecklist(STEP, {
      policyVersionId: STEP.policyVersionId,
      answers: [...answers, { itemCode: '1.7-01', answer: 'NO' }],
    });

    expect(kept.ok && kept.verdict.answers.map((answer) => answer.answer)).toEqual(['YES', 'YES', 'YES']);
    expect(refused).toMatchObject({ ok: false, fault: { kind: 'INCOMPLETE', unexpected: ['1.7-01'] } });
  });
});
