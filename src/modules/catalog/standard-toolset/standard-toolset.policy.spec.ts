import {
  ToolsetPlanDuplicateError,
  ToolsetReasonRequiredError,
  ToolsetTooManyPlansError,
} from './standard-toolset.errors';
import { MAX_TOOLSET_PLANS, cleanToolsetInput, sameToolset } from './standard-toolset.policy';

const A = '0b2f6a1e-1111-4111-8111-000000000001';
const B = '0b2f6a1e-2222-4222-8222-000000000002';
const ids = (count: number) =>
  Array.from({ length: count }, (_, i) => `0b2f6a1e-0000-4000-8000-${String(i).padStart(12, '0')}`);

describe('cleanToolsetInput (US-04-10 AC-2, AC-9)', () => {
  it('trims the reason, lower-cases and sorts the plan ids', () => {
    expect(cleanToolsetInput({ planIds: [B, A.toUpperCase()], reason: '  theo đề xuất của trưởng phòng ' })).toEqual({
      planIds: [A, B],
      reason: 'theo đề xuất của trưởng phòng',
    });
  });

  it.each([
    ['an empty reason', ''],
    ['a reason of spaces', '   '],
    ['a reason of tabs and line breaks', '\t\n '],
  ])('refuses %s: every change says why (AC-2)', (_name, reason) => {
    expect(() => cleanToolsetInput({ planIds: [A], reason })).toThrow(ToolsetReasonRequiredError);
  });

  it('accepts an empty list: the toolset may be emptied', () => {
    expect(cleanToolsetInput({ planIds: [], reason: 'bỏ hết' })).toEqual({ planIds: [], reason: 'bỏ hết' });
  });

  it('refuses a plan twice, also when the ids differ only in case', () => {
    expect(() => cleanToolsetInput({ planIds: [A, A], reason: 'x' })).toThrow(ToolsetPlanDuplicateError);
    expect(() => cleanToolsetInput({ planIds: [A, A.toUpperCase()], reason: 'x' })).toThrow(ToolsetPlanDuplicateError);
  });

  it('takes up to 50 plans and refuses 51', () => {
    expect(cleanToolsetInput({ planIds: ids(MAX_TOOLSET_PLANS), reason: 'x' }).planIds).toHaveLength(MAX_TOOLSET_PLANS);
    expect(() => cleanToolsetInput({ planIds: ids(MAX_TOOLSET_PLANS + 1), reason: 'x' })).toThrow(
      ToolsetTooManyPlansError,
    );
  });

  it('checks the reason first, then the number of plans, then the duplicates', () => {
    expect(() => cleanToolsetInput({ planIds: ids(51), reason: '' })).toThrow(ToolsetReasonRequiredError);
    expect(() => cleanToolsetInput({ planIds: [...ids(50), A], reason: 'x' })).toThrow(ToolsetTooManyPlansError);
  });
});

describe('sameToolset', () => {
  it('is true for the same plans, whatever the order they were given in, and false when one differs', () => {
    expect(sameToolset(cleanToolsetInput({ planIds: [B, A], reason: 'x' }).planIds, [A, B])).toBe(true);
    expect(sameToolset([A], [A, B])).toBe(false);
    expect(sameToolset([A], [B])).toBe(false);
    expect(sameToolset([], [])).toBe(true);
  });
});
