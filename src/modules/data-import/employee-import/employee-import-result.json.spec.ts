import { Prisma } from '../../../generated/prisma/client';
import { JsonColumnShapeError } from '../../../infrastructure/database/json-column.errors';
import { employeeImportResultJson } from './employee-import-result.json';
import type { ImportResult } from './employee-import.types';

const result: ImportResult = {
  created: 9,
  existingSame: 1,
  existingDifferent: 1,
  errors: 1,
  createdByDepartment: [{ departmentCode: 'ENG', count: 9 }],
  departmentsWithoutHead: [{ code: 'ENG', name: 'Engineering' }],
};

describe('employeeImportResultJson (employee_imports.result)', () => {
  it('reads what a confirmation wrote as the domain type, and NULL as no result yet', () => {
    expect(employeeImportResultJson.decode(JSON.parse(JSON.stringify(result)))).toEqual(result);
    expect(employeeImportResultJson.decode(null)).toBeNull();
  });

  it.each([
    ['a missing field', { ...result, created: undefined }],
    ['a count that is text', { ...result, errors: '1' }],
    ['a list of departments that is a string', { ...result, createdByDepartment: 'ENG' }],
    ['an array', []],
  ])('refuses %s with the table and the column, and never the value', (_label, value) => {
    expect(() => employeeImportResultJson.decode(value)).toThrow(JsonColumnShapeError);
    expect(() => employeeImportResultJson.decode(value)).toThrow('employee_imports.result');
  });

  it('writes the result as it has always been written: the object itself, key for key; no result is the database NULL', () => {
    expect(employeeImportResultJson.encode(result)).toEqual({
      created: 9,
      existingSame: 1,
      existingDifferent: 1,
      errors: 1,
      createdByDepartment: [{ departmentCode: 'ENG', count: 9 }],
      departmentsWithoutHead: [{ code: 'ENG', name: 'Engineering' }],
    });
    expect(employeeImportResultJson.encode(null)).toBe(Prisma.DbNull);
  });
});
