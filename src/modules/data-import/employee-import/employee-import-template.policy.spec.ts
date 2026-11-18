import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLACEMENT_REASON_CODES } from '../../organization/public/employee-placement.policy';
import { ImportTemplateService } from '../../policies/import-template/import-template.service';
import { ImportTemplateContributions } from '../../policies/public/policies.extension-points';
import { readUploadedEmployeeFile } from './preview/employee-import-xlsx.service';
import { judgeEmployeeRows, type EmployeeImportLookup } from './row-validation/employee-import-row-validation.policy';
import { EMPLOYEE_IMPORT_TEMPLATE } from './employee-import-template.policy';

const lookup: EmployeeImportLookup = {
  departments: new Map([['P-ENG', { id: 'department-1', active: true }]]),
  existing: new Map(),
  emailOwners: new Map(),
  own: null,
};

async function fileOf(format: 'xlsx' | 'csv' | undefined) {
  const sources = new ImportTemplateContributions();
  sources.add('test', { definitions: () => [EMPLOYEE_IMPORT_TEMPLATE] });

  return new ImportTemplateService(sources).build('employees', format, ['SUPER_ADMIN']);
}

/** The template of the people file is read back by the parser and the judge of the import, so it cannot drift from them (`QĐ-111as`). */
describe('the template of the people file', () => {
  it.each(EMPLOYEE_IMPORT_TEMPLATE.formats)(
    'reads back as %s with every example row valid and no header ignored',
    async (format) => {
      const file = await fileOf(format);

      const read = await readUploadedEmployeeFile({ fileName: file.fileName, bytes: file.bytes });

      expect(read.ignored).toEqual([]);
      expect(read.rows).toHaveLength(EMPLOYEE_IMPORT_TEMPLATE.sampleRows.length);
      const judged = judgeEmployeeRows(read.rows, lookup);
      expect(judged.map((row) => row.errors)).toEqual([[], [], []]);
      expect(judged.map((row) => row.outcome)).toEqual(['VALID', 'VALID', 'VALID']);
    },
  );

  it('puts the example row of a person without a department in the unplaced state, not in error', async () => {
    const read = await readUploadedEmployeeFile({ fileName: 'x.csv', bytes: (await fileOf('csv')).bytes });

    const unplaced = judgeEmployeeRows(read.rows, lookup)[2];

    expect(unplaced?.parsed?.departmentId).toBeNull();
  });

  it('gives the headers the parser reads, which are the columns of the file', () => {
    expect(EMPLOYEE_IMPORT_TEMPLATE.columns.map((column) => column.key)).toEqual([
      'employee_code',
      'full_name',
      'work_email',
      'employment_type',
      'hire_date',
      'department_code',
      'job_title',
    ]);
    expect(EMPLOYEE_IMPORT_TEMPLATE.columns.filter((column) => column.required).map((column) => column.key)).toEqual([
      'employee_code',
      'full_name',
      'employment_type',
      'hire_date',
    ]);
  });

  it('says on the instruction sheet every code the judge of the rows can answer with, and no other (LBF-03)', () => {
    // The codes are read from the sources that make them, so a new refusal of a row that the sheet does not say turns this red.
    const rowCodes = (file: string) =>
      [...readFileSync(file, 'utf8').matchAll(/code: '([A-Z_]+)'/g)].map((match) => match[1]);
    const validation = join(__dirname, 'row-validation', 'employee-import-row-validation.policy.ts');
    const answered = new Set([...rowCodes(validation), ...PLACEMENT_REASON_CODES]);
    const said = new Set(EMPLOYEE_IMPORT_TEMPLATE.columns.flatMap((column) => column.refusedWith ?? []));

    expect(answered.size).toBe(14);
    expect([...answered].filter((code) => !said.has(code)).sort()).toEqual([]);
    expect([...said].filter((code) => !answered.has(code)).sort()).toEqual([]);
  });

  it('says each code under the column the judge attaches it to', () => {
    const under = (key: string) =>
      EMPLOYEE_IMPORT_TEMPLATE.columns.find((column) => column.key === key)?.refusedWith ?? [];

    expect(under('work_email')).toContain('OWN_RECORD');
    expect(under('department_code')).toEqual(
      expect.arrayContaining(['DEPARTMENT_CODE_INVALID', 'DEPARTMENT_NOT_FOUND', 'DEPARTMENT_INACTIVE']),
    );
    expect(under('job_title')).toEqual(['JOB_TITLE_TOO_LONG']);
  });
});
