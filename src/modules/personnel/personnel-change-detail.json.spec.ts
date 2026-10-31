import { Prisma } from '../../generated/prisma/client';
import { JsonColumnShapeError } from '../../infrastructure/database/json-column.errors';
import { offboardingChangeDetailJson } from './personnel-change-detail.json';

describe('offboardingChangeDetailJson (offboarding_case_changes.detail)', () => {
  it('reads the detail of an event as an object of JSON values whatever its keys, and NULL as no detail', () => {
    const revocations = { assignmentIds: ['a-1', 'a-2'], count: 2, created: true, reasonAdded: null, source: 'HELD' };

    expect(offboardingChangeDetailJson.decode(revocations)).toEqual(revocations);
    expect(offboardingChangeDetailJson.decode({})).toEqual({});
    expect(offboardingChangeDetailJson.decode(null)).toBeNull();
  });

  it.each([
    ['a list', ['a-1']],
    ['a bare string', 'REVOCATIONS_OPENED'],
    ['a number', 7],
    ['a value that is not JSON', { when: new Date(), secret: undefined }],
  ])('refuses %s with the table and the column, and never the value', (_label, value) => {
    expect(() => offboardingChangeDetailJson.decode(value)).toThrow(JsonColumnShapeError);
    expect(() => offboardingChangeDetailJson.decode(value)).toThrow('offboarding_case_changes.detail');
    expect(() => offboardingChangeDetailJson.decode(value)).not.toThrow(/REVOCATIONS_OPENED|a-1/);
  });

  it('writes the detail as it has always been written: the object itself; no detail is the database NULL', () => {
    expect(
      offboardingChangeDetailJson.encode({ abrupt: true, departureEffectiveOn: '2026-11-30', headSuccessor: null }),
    ).toEqual({
      abrupt: true,
      departureEffectiveOn: '2026-11-30',
      headSuccessor: null,
    });
    expect(offboardingChangeDetailJson.encode(null)).toBe(Prisma.DbNull);
  });
});
