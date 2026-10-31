import { JsonColumnShapeError } from '../../../infrastructure/database/json-column.errors';
import { employeeImportSummaryJson } from './employee-import-summary.json';
import type { ImportSummary } from './employee-import.types';

const summary: ImportSummary = {
  totalRows: 12,
  valid: 9,
  errors: 1,
  existingSame: 1,
  existingDifferent: 1,
  newPeopleByDepartment: [{ departmentCode: 'ENG', count: 9 }],
  departmentsWithoutHead: [{ code: 'ENG', name: 'Engineering' }],
  reviewQueue: { total: 1, items: [{ employeeCode: 'E-7', fullName: 'Ana Tran', seats: 2 }] },
  duplicateOf: {
    importId: '0b7a1f5e-0000-4000-8000-000000000001',
    fileName: 'people.csv',
    confirmedAt: '2026-10-01T00:00:00.000Z',
  },
};

describe('employeeImportSummaryJson (employee_imports.summary)', () => {
  it('reads the summary of a preview as the domain type', () => {
    expect(employeeImportSummaryJson.decode(JSON.parse(JSON.stringify(summary)))).toEqual(summary);
  });

  it('gives a preview kept before the review queue existed an empty one', () => {
    const legacy = JSON.parse(JSON.stringify({ ...summary, reviewQueue: undefined })) as unknown;

    expect(legacy).not.toHaveProperty('reviewQueue');
    expect(employeeImportSummaryJson.decode(legacy).reviewQueue).toEqual({ total: 0, items: [] });
  });

  it.each([
    ['a missing field', { ...summary, totalRows: undefined }],
    ['a count that is text', { ...summary, valid: '9' }],
    ['a department list that is an object', { ...summary, newPeopleByDepartment: { ENG: 9 } }],
    ['a duplicate that has no file name', { ...summary, duplicateOf: { importId: 'x', confirmedAt: 'y' } }],
    ['null', null],
    ['an array', []],
  ])('refuses %s with the table and the column, and never the value', (_label, value) => {
    expect(() => employeeImportSummaryJson.decode(value)).toThrow(JsonColumnShapeError);
    expect(() => employeeImportSummaryJson.decode(value)).toThrow('employee_imports.summary');
    expect(() => employeeImportSummaryJson.decode(value)).not.toThrow(/Ana Tran|people\.csv/);
  });

  it('writes the summary as it has always been written: the object itself, key for key', () => {
    expect(employeeImportSummaryJson.encode(summary)).toEqual({
      totalRows: 12,
      valid: 9,
      errors: 1,
      existingSame: 1,
      existingDifferent: 1,
      newPeopleByDepartment: [{ departmentCode: 'ENG', count: 9 }],
      departmentsWithoutHead: [{ code: 'ENG', name: 'Engineering' }],
      reviewQueue: { total: 1, items: [{ employeeCode: 'E-7', fullName: 'Ana Tran', seats: 2 }] },
      duplicateOf: {
        importId: '0b7a1f5e-0000-4000-8000-000000000001',
        fileName: 'people.csv',
        confirmedAt: '2026-10-01T00:00:00.000Z',
      },
    });
    expect(employeeImportSummaryJson.encode({ ...summary, duplicateOf: null })).toMatchObject({ duplicateOf: null });
  });
});
