import { draftValuesOf, publishValuesOf } from './library.policy';
import type { DraftValues } from './library.types';

const base: DraftValues = {
  title: 'Chính sách cấp phát',
  content: { sections: [{ heading: 'Mục đích', body: 'a' }], steps: [] },
  applicableRoles: ['MANAGER'],
};

describe('draftValuesOf', () => {
  it('copies the draft in hand when nothing is changed', () => {
    expect(draftValuesOf(base, {})).toEqual(base);
  });

  it('puts the given title and content over the base and keeps the roles of the base', () => {
    const content = { sections: [{ heading: 'Phạm vi', body: 'b' }], steps: [] };

    expect(draftValuesOf(base, { title: 'Mới', content })).toEqual({
      title: 'Mới',
      content,
      applicableRoles: ['MANAGER'],
    });
  });

  it('changes only what is given', () => {
    expect(draftValuesOf(base, { title: 'Chỉ đổi tên' })).toEqual({ ...base, title: 'Chỉ đổi tên' });
  });
});

describe('publishValuesOf', () => {
  const input = {
    changeNote: 'Quyết định số 05',
    applicableRoles: ['MANAGER' as const],
    requiresReacknowledgement: false,
  };

  it('numbers the version after the last one', () => {
    expect(publishValuesOf(2, input).versionNumber).toBe(3);
  });

  it('keeps the choice of whether a new acknowledgement is asked', () => {
    expect(publishValuesOf(2, input).requiresReacknowledgement).toBe(false);
    expect(publishValuesOf(2, { ...input, requiresReacknowledgement: true }).requiresReacknowledgement).toBe(true);
  });

  it('asks the first version of everyone whatever the choice (R-34)', () => {
    expect(publishValuesOf(0, input)).toMatchObject({ versionNumber: 1, requiresReacknowledgement: true });
  });
});
