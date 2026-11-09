import { JsonColumnShapeError } from '../../../infrastructure/database/json-column.errors';
import { employeeImportCellsJson } from './employee-import-cells.json';

describe('employeeImportCellsJson (employee_import_rows.cells)', () => {
  it('reads the cells of a row by column, a column the row left out as absent', () => {
    expect(employeeImportCellsJson.decode({ employee_code: 'E-1', full_name: 'Ana Tran' })).toEqual({
      employee_code: 'E-1',
      full_name: 'Ana Tran',
    });
    expect(employeeImportCellsJson.decode({})).toEqual({});
  });

  it.each([
    ['a cell that is a number', { employee_code: 7 }],
    ['a column the people file does not have', { employee_code: 'E-1', salary: '100' }],
    ['a list of cells', ['E-1']],
    ['null', null],
  ])('refuses %s with the table and the column, and never the value', (_label, value) => {
    expect(() => employeeImportCellsJson.decode(value)).toThrow(JsonColumnShapeError);
    expect(() => employeeImportCellsJson.decode(value)).toThrow('employee_import_rows.cells');
    expect(() => employeeImportCellsJson.decode(value)).not.toThrow(/salary|E-1/);
  });

  it('writes the cells as they were read: the object itself', () => {
    const cells = { employee_code: 'E-1', work_email: 'ana@example.com', hire_date: '2026-09-01' };

    expect(employeeImportCellsJson.encode(cells)).toEqual({
      employee_code: 'E-1',
      work_email: 'ana@example.com',
      hire_date: '2026-09-01',
    });
  });
});
