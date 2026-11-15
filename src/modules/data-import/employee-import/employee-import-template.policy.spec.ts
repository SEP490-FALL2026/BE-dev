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

async function fileOf(format: 'xlsx' | 'csv') {
  const sources = new ImportTemplateContributions();
  sources.add('test', { definitions: () => [EMPLOYEE_IMPORT_TEMPLATE] });

  return new ImportTemplateService(sources).build('employees', format, ['SUPER_ADMIN']);
}

/** The template of the people file is read back by the parser and the judge of the import, so it cannot drift from them (`QĐ-111as`). */
describe('the template of the people file', () => {
  it.each(['xlsx', 'csv'] as const)(
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
});
