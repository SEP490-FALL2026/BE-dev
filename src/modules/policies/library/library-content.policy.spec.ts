import { refuseContent } from './library-content.policy';
import type { PolicyContent } from './library.json';

const item = (code: string, check: 'SYSTEM' | 'PERSON', text = 'Câu hỏi') => ({ code, text, check });
const step = (code: string, items: ReturnType<typeof item>[]) => ({ code, title: `Bước ${code}`, checklist: items });

const current: PolicyContent = {
  sections: [{ heading: 'Mục đích', body: 'a' }],
  steps: [
    step('1.2', [item('1.2-01', 'SYSTEM'), item('1.2-04', 'PERSON')]),
    step('1.6', [item('1.6-01', 'SYSTEM'), item('1.6-02', 'PERSON')]),
  ],
};

describe('refuseContent (QĐ-112a, QĐ-111ap, US-01-13 AC-6)', () => {
  it('accepts a text that only changes words: the title of a step, the question of an item, the sections', () => {
    const next: PolicyContent = {
      sections: [{ heading: 'Phạm vi', body: 'b' }],
      steps: [
        {
          ...step('1.2', [item('1.2-01', 'SYSTEM', 'Hệ thống tự kiểm điều này'), item('1.2-04', 'PERSON', 'Câu mới')]),
          title: 'Tên mới',
        },
        step('1.6', [item('1.6-01', 'SYSTEM'), item('1.6-02', 'PERSON')]),
      ],
    };

    expect(refuseContent(current, next)).toBeNull();
  });

  it('accepts a new question for the person and the removal of one the system answered', () => {
    const next: PolicyContent = {
      ...current,
      steps: [step('1.2', [item('1.2-04', 'PERSON'), item('1.2-08', 'PERSON')]), current.steps[1]],
    };

    expect(refuseContent(current, next)).toBeNull();
  });

  it('refuses a step taken away, naming it', () => {
    expect(refuseContent(current, { ...current, steps: [current.steps[0]] })).toEqual({
      reason: 'STEP_SET_FIXED',
      added: [],
      removed: ['1.6'],
    });
  });

  it('refuses a step added, naming it: the seven steps each belong to one policy', () => {
    expect(
      refuseContent(current, { ...current, steps: [...current.steps, step('1.3', [item('1.3-01', 'PERSON')])] }),
    ).toEqual({
      reason: 'STEP_SET_FIXED',
      added: ['1.3'],
      removed: [],
    });
  });

  it('refuses a policy with no step gaining one, and one with steps losing them all', () => {
    const none: PolicyContent = { sections: current.sections, steps: [] };

    expect(refuseContent(none, current)).toMatchObject({ reason: 'STEP_SET_FIXED', added: ['1.2', '1.6'] });
    expect(refuseContent(current, none)).toMatchObject({ reason: 'STEP_SET_FIXED', removed: ['1.2', '1.6'] });
  });

  it('refuses a question the person answered becoming one the system answers: the screen would tick it for them', () => {
    const next: PolicyContent = {
      ...current,
      steps: [step('1.2', [item('1.2-01', 'SYSTEM'), item('1.2-04', 'SYSTEM')]), current.steps[1]],
    };

    expect(refuseContent(current, next)).toEqual({ reason: 'SYSTEM_ITEM_UNKNOWN', items: ['1.2-04'] });
  });

  it('refuses a new question that claims to be answered by the system', () => {
    const next: PolicyContent = {
      ...current,
      steps: [
        step('1.2', [item('1.2-01', 'SYSTEM'), item('1.2-04', 'PERSON'), item('1.2-09', 'SYSTEM')]),
        current.steps[1],
      ],
    };

    expect(refuseContent(current, next)).toEqual({ reason: 'SYSTEM_ITEM_UNKNOWN', items: ['1.2-09'] });
  });

  it('judges the steps first when both are wrong', () => {
    const next: PolicyContent = { ...current, steps: [step('1.2', [item('1.2-04', 'SYSTEM')])] };

    expect(refuseContent(current, next)).toMatchObject({ reason: 'STEP_SET_FIXED' });
  });
});
