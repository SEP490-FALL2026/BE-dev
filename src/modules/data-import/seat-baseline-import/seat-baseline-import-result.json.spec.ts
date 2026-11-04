import { Prisma } from '../../../generated/prisma/client';
import { JsonColumnShapeError } from '../../../infrastructure/database/json-column.errors';
import { seatBaselineImportResultJson } from './seat-baseline-import-result.json';

const result = { created: 8, errors: 2, occupied: 13, free: 7 };

describe('seatBaselineImportResultJson (seat_baseline_imports.result)', () => {
  it('reads what a confirmation wrote, the seats of an internal plan as null, and NULL as no result yet', () => {
    expect(seatBaselineImportResultJson.decode(result)).toEqual(result);
    expect(seatBaselineImportResultJson.decode({ ...result, occupied: null, free: null })).toEqual({
      created: 8,
      errors: 2,
      occupied: null,
      free: null,
    });
    expect(seatBaselineImportResultJson.decode(null)).toBeNull();
  });

  it.each([
    ['a missing field', { created: 8, errors: 2, occupied: 13 }],
    ['a count that is text', { ...result, created: '8' }],
    ['an array', []],
  ])('refuses %s with the table and the column, and never the value', (_label, value) => {
    expect(() => seatBaselineImportResultJson.decode(value)).toThrow(JsonColumnShapeError);
    expect(() => seatBaselineImportResultJson.decode(value)).toThrow('seat_baseline_imports.result');
  });

  it('writes the result as it has always been written: the object itself; no result is the database NULL', () => {
    expect(seatBaselineImportResultJson.encode(result)).toEqual({ created: 8, errors: 2, occupied: 13, free: 7 });
    expect(seatBaselineImportResultJson.encode(null)).toBe(Prisma.DbNull);
  });
});
