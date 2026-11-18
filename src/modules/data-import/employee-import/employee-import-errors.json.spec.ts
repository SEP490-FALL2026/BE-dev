import { JsonColumnShapeError } from '../../../infrastructure/database/json-column.errors';
import { employeeImportErrorsJson } from './employee-import-errors.json';

describe('employeeImportErrorsJson (employee_import_rows.errors)', () => {
  it('reads what is wrong with a row, and an empty list for a row with nothing wrong', () => {
    expect(
      employeeImportErrorsJson.decode([
        { column: 'work_email', code: 'EMAIL_INVALID' },
        { column: 'hire_date', code: 'DATE_INVALID' },
      ]),
    ).toEqual([
      { column: 'work_email', code: 'EMAIL_INVALID' },
      { column: 'hire_date', code: 'DATE_INVALID' },
    ]);
    expect(employeeImportErrorsJson.decode([])).toEqual([]);
  });

  it.each([
    ['an issue with no code', [{ column: 'work_email' }]],
    ['a column the people file does not have', [{ column: 'salary', code: 'X' }]],
    ['a code that is a number', [{ column: 'work_email', code: 7 }]],
    ['an object instead of a list', { column: 'work_email', code: 'X' }],
    ['null', null],
  ])('refuses %s with the table and the column, and never the value', (_label, value) => {
    expect(() => employeeImportErrorsJson.decode(value)).toThrow(JsonColumnShapeError);
    expect(() => employeeImportErrorsJson.decode(value)).toThrow('employee_import_rows.errors');
    expect(() => employeeImportErrorsJson.decode(value)).not.toThrow(/salary/);
  });

  it('writes the issues as they have always been written: the list itself', () => {
    expect(employeeImportErrorsJson.encode([{ column: 'work_email', code: 'EMAIL_INVALID' }])).toEqual([
      { column: 'work_email', code: 'EMAIL_INVALID' },
    ]);
    expect(employeeImportErrorsJson.encode([])).toEqual([]);
  });
});
