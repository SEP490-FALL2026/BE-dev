import { renewalNamedItAdminOf } from './renewal-it-admin.policy';

/** The two IT Admins a renewal names (the one responsible for the subscription, the one in charge of the owner department), and who of them is usable. */
const named = (input: {
  responsible: string | null;
  inCharge: string | null;
  usable: readonly string[];
}): string | null =>
  renewalNamedItAdminOf({
    responsibleItAdminEmployeeId: input.responsible,
    departmentItAdminEmployeeId: input.inCharge,
    usableItAdminEmployeeIds: new Set(input.usable),
  });

describe('the IT Admin a renewal names (QĐ-111g, BB-9, CO-6)', () => {
  it.each([
    // responsible, in charge, usable ⟹ expected
    ['the responsible IT Admin is usable', 'it-sub', 'it-dept', ['it-sub', 'it-dept'], 'it-sub'],
    ['the responsible IT Admin is usable and the department names none', 'it-sub', null, ['it-sub'], 'it-sub'],
    ['both are usable, the responsible one still wins', 'it-sub', 'it-dept', ['it-dept', 'it-sub'], 'it-sub'],
    ['the responsible one is usable and the one in charge is not', 'it-sub', 'it-dept', ['it-sub'], 'it-sub'],
    ['the subscription names none and the one in charge is usable', null, 'it-dept', ['it-dept'], 'it-dept'],
    ['the responsible one is not usable and the one in charge is', 'it-gone', 'it-dept', ['it-dept'], 'it-dept'],
  ] as const)('is the right one when %s', (_case, responsible, inCharge, usable, expected) => {
    expect(named({ responsible, inCharge, usable })).toBe(expected);
  });

  it.each([
    ['the one in charge has left and is not locked yet (not usable)', null, 'it-left', []],
    ['both have left or lost the role', 'it-gone', 'it-left', []],
    ['the department names none and the subscription names none', null, null, []],
    ['the responsible one is not usable and the department names none', 'it-gone', null, []],
    ['the one in charge is not usable although another usable id is known', null, 'it-left', ['somebody-else']],
  ] as const)(
    'is nobody named, so the caller reads the first usable IT Admin, when %s',
    (_case, responsible, inCharge, usable) => {
      expect(named({ responsible, inCharge, usable })).toBeNull();
    },
  );

  it('never returns an IT Admin the usable set does not hold, whatever they are named for', () => {
    expect(named({ responsible: 'it-sub', inCharge: 'it-dept', usable: [] })).toBeNull();
    expect(named({ responsible: 'it-sub', inCharge: 'it-dept', usable: ['unrelated'] })).toBeNull();
  });
});
