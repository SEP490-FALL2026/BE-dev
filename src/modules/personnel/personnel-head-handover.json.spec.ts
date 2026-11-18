import { Prisma } from '../../generated/prisma/client';
import { JsonColumnShapeError } from '../../infrastructure/database/json-column.errors';
import { offboardingHeadHandoverJson, transferHeadHandoverJson } from './personnel-head-handover.json';
import type { HeadHandoverFacts as OffboardingHandover } from './offboarding/offboarding.types';
import type { HeadHandoverFacts as TransferHandover } from './transfer/transfer.types';

const stored = {
  endedPeriodId: '0b7a1f5e-0000-4000-8000-0000000000a1',
  endedPeriodValidTo: '2026-11-30',
  createdPeriodId: '0b7a1f5e-0000-4000-8000-0000000000a2',
  successor: 'EMPLOYEE',
  successorEmployeeId: '0b7a1f5e-0000-4000-8000-0000000000a3',
};

describe.each([
  ['transferHeadHandoverJson', transferHeadHandoverJson, 'department_transfers.head_handover'],
  ['offboardingHeadHandoverJson', offboardingHeadHandoverJson, 'offboarding_cases.head_handover'],
])('%s (%s)', (_name, codec, where) => {
  it('reads what a handover of the head moved as the domain type, and NULL as no handover', () => {
    expect(codec.decode(stored)).toEqual(stored);
    expect(
      codec.decode({
        ...stored,
        endedPeriodValidTo: null,
        createdPeriodId: null,
        successor: 'NONE',
        successorEmployeeId: null,
      }),
    ).toEqual({
      endedPeriodId: stored.endedPeriodId,
      endedPeriodValidTo: null,
      createdPeriodId: null,
      successor: 'NONE',
      successorEmployeeId: null,
    });
    expect(codec.decode(null)).toBeNull();
  });

  it.each([
    ['a missing field', { ...stored, endedPeriodId: undefined }],
    ['a successor that is neither EMPLOYEE nor NONE', { ...stored, successor: 'BOTH' }],
    ['a date that is not a date', { ...stored, endedPeriodValidTo: '2026-02-31' }],
    ['an id that is a number', { ...stored, createdPeriodId: 7 }],
    ['a list', [stored]],
  ])('refuses %s with the table and the column, and never the value', (_label, value) => {
    expect(() => codec.decode(value)).toThrow(JsonColumnShapeError);
    expect(() => codec.decode(value)).toThrow(where);
    expect(() => codec.decode(value)).not.toThrow(/BOTH|2026-02-31/);
  });

  it('writes the five facts as the handover has always been written, and no handover as the database NULL', () => {
    const facts: OffboardingHandover & TransferHandover = {
      endedPeriodId: 'p-1',
      endedPeriodValidTo: '2026-11-30',
      createdPeriodId: null,
      successor: 'NONE',
      successorEmployeeId: null,
    };

    expect(codec.encode(facts)).toEqual({
      endedPeriodId: 'p-1',
      endedPeriodValidTo: '2026-11-30',
      createdPeriodId: null,
      successor: 'NONE',
      successorEmployeeId: null,
    });
    expect(codec.encode(null)).toBe(Prisma.DbNull);
  });
});
