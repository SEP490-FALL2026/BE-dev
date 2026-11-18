import { Prisma } from '../../../generated/prisma/client';
import { JsonColumnShapeError } from '../../../infrastructure/database/json-column.errors';
import { employeeImportDifferencesJson } from './employee-import-differences.json';

const stored = [{ column: 'job_title', current: 'Engineer', incoming: 'Senior Engineer' }];

describe('employeeImportDifferencesJson (employee_import_rows.differences)', () => {
  it('reads how a row differs from the person who exists, and NULL as no difference', () => {
    expect(employeeImportDifferencesJson.decode(stored)).toEqual(stored);
    expect(employeeImportDifferencesJson.decode(null)).toBeNull();
    expect(employeeImportDifferencesJson.decode([])).toEqual([]);
  });

  it.each([
    ['a difference with no incoming value', [{ column: 'job_title', current: 'Engineer' }]],
    ['a column the people file does not have', [{ column: 'salary', current: '1', incoming: '2' }]],
    ['a value that is a number', [{ column: 'job_title', current: 1, incoming: 'x' }]],
    ['an object instead of a list', { column: 'job_title' }],
  ])('refuses %s with the table and the column, and never the value', (_label, value) => {
    expect(() => employeeImportDifferencesJson.decode(value)).toThrow(JsonColumnShapeError);
    expect(() => employeeImportDifferencesJson.decode(value)).toThrow('employee_import_rows.differences');
    expect(() => employeeImportDifferencesJson.decode(value)).not.toThrow(/Engineer|salary/);
  });

  it('writes the differences as they have always been written: the list itself; none is the database NULL', () => {
    expect(
      employeeImportDifferencesJson.encode([{ column: 'job_title', current: 'Engineer', incoming: 'Senior Engineer' }]),
    ).toEqual(stored);
    expect(employeeImportDifferencesJson.encode(null)).toBe(Prisma.DbNull);
  });
});
