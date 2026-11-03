import ExcelJS from 'exceljs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { EmployeeRowClassifier } from '../row-validation/employee-import-row-validation.policy';
import { readUploadedEmployeeFile } from './employee-import-xlsx.service';

const columns = [
  'employee_code',
  'full_name',
  'work_email',
  'employment_type',
  'hire_date',
  'department_code',
  'job_title',
];
const excel = async (setup: (sheet: ExcelJS.Worksheet) => void) => {
  const book = new ExcelJS.Workbook();
  setup(book.addWorksheet('first'));
  return Buffer.from(await book.xlsx.writeBuffer());
};

describe('Excel employee files', () => {
  it('reads dates, numbers, blanks and cached formulas from the first sheet', async () => {
    const bytes = await excel((sheet) => {
      sheet.addRow(columns);
      sheet.addRow([
        123,
        'Name',
        null,
        'STAFF',
        new Date('2026-01-05T00:00:00Z'),
        'DS1-ENG',
        { formula: '1+1', result: 2 },
      ]);
      sheet.addRow([]);
    });
    const result = await readUploadedEmployeeFile({ fileName: 'employees.xlsx', bytes });
    expect(result.rows).toEqual([
      {
        lineNumber: 2,
        cells: {
          employee_code: '123',
          full_name: 'Name',
          work_email: '',
          employment_type: 'STAFF',
          hire_date: '2026-01-05',
          department_code: 'DS1-ENG',
          job_title: '2',
        },
      },
    ]);
  });
  it('rejects empty workbooks and corrupt or unsupported files', async () => {
    const bytes = await excel(() => undefined);
    await expect(readUploadedEmployeeFile({ fileName: 'empty.xlsx', bytes })).rejects.toMatchObject({
      problem: 'FILE_EMPTY',
    });
    await expect(
      readUploadedEmployeeFile({ fileName: 'broken.xlsx', bytes: Buffer.from('not zip') }),
    ).rejects.toMatchObject({ name: 'ImportFileUnreadableError' });
    await expect(
      readUploadedEmployeeFile({ fileName: 'old.xls', bytes: Buffer.from('not zip') }),
    ).rejects.toMatchObject({ problem: 'FILE_FORMAT_UNSUPPORTED' });
  });
});

describe('published employee examples', () => {
  it.each(['employee-template', 'employees-15', 'employees-invalid'])(
    'classifies CSV and XLSX %s as documented',
    async (name) => {
      const directory = resolve('docs/examples/employee-import');
      const expected = JSON.parse(await readFile(resolve(directory, 'expected-results.json'), 'utf8')) as Record<
        string,
        {
          totalRows: number;
          valid: number;
          errors: number;
          newUnplaced: number;
          rowErrors: { line: number; codes: string[] }[];
        }
      >;
      for (const extension of ['csv', 'xlsx']) {
        const fileName = `${name}.${extension}`;
        const { rows } = await readUploadedEmployeeFile({
          fileName,
          bytes: await readFile(resolve(directory, fileName)),
        });
        const classifier = new EmployeeRowClassifier({
          departments: new Map(['DS1-ENG', 'DS1-DES', 'DS1-OPS'].map((code) => [code, { id: code, active: true }])),
          existing: new Map(),
          emailOwners: new Map(),
        });
        const judged = rows.map((row) => classifier.classify(row.cells));
        expect({
          totalRows: rows.length,
          valid: judged.filter((row) => row.outcome === 'VALID').length,
          errors: judged.filter((row) => row.outcome === 'ERROR').length,
          newUnplaced: judged.filter((row) => row.outcome === 'VALID' && row.parsed?.departmentId === null).length,
          rowErrors: judged.flatMap((row, index) =>
            row.errors.length ? [{ line: rows[index].lineNumber, codes: row.errors.map((issue) => issue.code) }] : [],
          ),
        }).toEqual(expected[name]);
      }
    },
  );
});
