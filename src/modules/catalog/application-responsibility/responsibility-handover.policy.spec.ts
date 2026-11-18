import { handoverRefusal } from './responsibility-handover.policy';

describe('responsibility-handover.policy (QĐ-111g, R-8, R-26: one handing over of every subscription and application)', () => {
  const base = { fromEmployeeId: 'it-leaving', toEmployeeId: 'it-staying', toIsUsableItAdmin: true };

  it('lets the responsibilities go to another IT Admin who works', () => {
    expect(handoverRefusal(base)).toBeNull();
  });

  it('refuses a person who is not an IT Admin who works now (left, locked, or never held the role)', () => {
    expect(handoverRefusal({ ...base, toIsUsableItAdmin: false })).toBe('TARGET_NOT_IT_ADMIN');
  });

  it('refuses handing them to the one who gives them up', () => {
    expect(handoverRefusal({ ...base, toEmployeeId: base.fromEmployeeId })).toBe('SAME_EMPLOYEE');
  });

  it('judges the same person before the role: naming oneself is the problem whatever the account says', () => {
    expect(handoverRefusal({ ...base, toEmployeeId: base.fromEmployeeId, toIsUsableItAdmin: false })).toBe(
      'SAME_EMPLOYEE',
    );
  });
});
