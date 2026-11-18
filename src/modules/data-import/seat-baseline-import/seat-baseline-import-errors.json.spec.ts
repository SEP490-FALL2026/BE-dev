import { JsonColumnShapeError } from '../../../infrastructure/database/json-column.errors';
import { seatBaselineImportErrorsJson } from './seat-baseline-import-errors.json';
import { RETIRED_SEAT_ROW_ERROR_CODES, SEAT_ROW_ERROR_CODES } from './seat-baseline-import.types';

describe('seatBaselineImportErrorsJson (seat_baseline_import_rows.errors)', () => {
  it('reads why a row cannot be written, and an empty list for a row with nothing wrong', () => {
    expect(seatBaselineImportErrorsJson.decode([{ code: 'OVERLAP' }, { code: 'SEAT_LIMIT_EXCEEDED' }])).toEqual([
      { code: 'OVERLAP' },
      { code: 'SEAT_LIMIT_EXCEEDED' },
    ]);
    expect(seatBaselineImportErrorsJson.decode([])).toEqual([]);
  });

  // The preview wrote these from 20/10/2026 until 23/10/2026 and no migration rewrote the rows: an old import must still open.
  it('still reads a row written before 23/10/2026, with a code the preview has since retired', () => {
    const stored = [{ code: 'COST_CENTER_REQUIRED' }, { code: 'OVERLAP' }, { code: 'COST_CENTER_NOT_COMPANY' }];

    expect(seatBaselineImportErrorsJson.decode(stored)).toEqual(stored);
    expect(
      RETIRED_SEAT_ROW_ERROR_CODES.every((code) => !(SEAT_ROW_ERROR_CODES as readonly string[]).includes(code)),
    ).toBe(true);
  });

  it.each([
    ['an error with no code', [{}]],
    ['a code the preview never wrote', [{ code: 'SALARY_TOO_HIGH' }]],
    ['a code that is a number', [{ code: 7 }]],
    ['an object instead of a list', { code: 'OVERLAP' }],
    ['null', null],
  ])('refuses %s with the table and the column, and never the value', (_label, value) => {
    expect(() => seatBaselineImportErrorsJson.decode(value)).toThrow(JsonColumnShapeError);
    expect(() => seatBaselineImportErrorsJson.decode(value)).toThrow('seat_baseline_import_rows.errors');
    expect(() => seatBaselineImportErrorsJson.decode(value)).not.toThrow(/SALARY/);
  });

  it('writes the errors as they have always been written: the list itself', () => {
    expect(seatBaselineImportErrorsJson.encode([{ code: 'OVERLAP' }])).toEqual([{ code: 'OVERLAP' }]);
    expect(seatBaselineImportErrorsJson.encode([])).toEqual([]);
  });

  it('never writes a retired code again, though it reads one', () => {
    expect(() => seatBaselineImportErrorsJson.encode([{ code: 'COST_CENTER_REQUIRED' }])).toThrow(JsonColumnShapeError);
    expect(() => seatBaselineImportErrorsJson.encode([{ code: 'COST_CENTER_REQUIRED' }])).toThrow(
      'seat_baseline_import_rows.errors',
    );
  });
});
