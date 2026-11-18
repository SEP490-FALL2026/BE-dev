import { JsonColumnShapeError } from '../../../infrastructure/database/json-column.errors';
import { seatBaselineImportCellsJson } from './seat-baseline-import-cells.json';

describe('seatBaselineImportCellsJson (seat_baseline_import_rows.cells)', () => {
  it('reads the cells of a row by column, a column the row left out as absent', () => {
    expect(seatBaselineImportCellsJson.decode({ employee_code: 'E-1', account_identifier: 'ana@example.com' })).toEqual(
      {
        employee_code: 'E-1',
        account_identifier: 'ana@example.com',
      },
    );
    expect(seatBaselineImportCellsJson.decode({})).toEqual({});
  });

  it.each([
    ['a cell that is a number', { employee_code: 7 }],
    ['a column the seat file does not have', { employee_code: 'E-1', salary: '100' }],
    ['a list of cells', ['E-1']],
    ['null', null],
  ])('refuses %s with the table and the column, and never the value', (_label, value) => {
    expect(() => seatBaselineImportCellsJson.decode(value)).toThrow(JsonColumnShapeError);
    expect(() => seatBaselineImportCellsJson.decode(value)).toThrow('seat_baseline_import_rows.cells');
    expect(() => seatBaselineImportCellsJson.decode(value)).not.toThrow(/salary|E-1/);
  });

  it('writes the cells as they were read: the object itself', () => {
    expect(seatBaselineImportCellsJson.encode({ employee_code: 'E-1', granted_on: '2026-01-05' })).toEqual({
      employee_code: 'E-1',
      granted_on: '2026-01-05',
    });
  });
});
