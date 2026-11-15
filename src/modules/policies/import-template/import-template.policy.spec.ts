import type { ImportTemplateDefinition } from '../public/policies.types';
import {
  canDownloadTemplate,
  definitionProblems,
  guideRowsOf,
  templateCsvOf,
  templateFileName,
} from './import-template.policy';

const code = {
  key: 'employee_code',
  description: 'Mã nhân viên',
  required: true,
  format: 'chữ và số',
  example: 'NV001',
  constraint: 'duy nhất',
};
const name = {
  key: 'full_name',
  description: 'Họ tên',
  required: true,
  format: 'văn bản',
  example: 'Nguyễn, Văn A',
  constraint: 'tối đa 200 ký tự',
};

const definition: ImportTemplateDefinition = {
  kind: 'employees',
  title: 'Danh sách nhân viên',
  formats: ['xlsx', 'csv'],
  columns: [code, name],
  sampleRows: [
    ['NV001', 'Nguyễn, Văn A'],
    ['NV002', 'Trần "Thị" B'],
  ],
  notes: ['Tối đa 1.000 dòng.'],
};

describe('templateCsvOf', () => {
  const csv = templateCsvOf(definition);

  it('starts with the byte order mark so a spreadsheet opens it as UTF-8', () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('writes the header the parser reads and then the example rows', () => {
    const lines = csv.slice(1).split('\r\n');

    expect(lines[0]).toBe('employee_code,full_name');
    expect(lines).toHaveLength(4);
  });

  it('quotes a cell that holds a comma or a quote, so it reads back as one cell', () => {
    expect(csv).toContain('NV001,"Nguyễn, Văn A"');
    expect(csv).toContain('NV002,"Trần ""Thị"" B"');
  });

  it('ends with a line break', () => {
    expect(csv.endsWith('\r\n')).toBe(true);
  });
});

describe('guideRowsOf', () => {
  it('has a header and one row per column, with whether it is required', () => {
    const rows = guideRowsOf(definition);

    expect(rows[0]).toEqual(['Cột', 'Bắt buộc', 'Mô tả', 'Định dạng', 'Ví dụ', 'Ràng buộc', 'Mã lỗi khi từ chối']);
    expect(rows[1]).toEqual(['employee_code', 'Có', 'Mã nhân viên', 'chữ và số', 'NV001', 'duy nhất', '']);
    expect(guideRowsOf({ ...definition, columns: [{ ...code, refusedWith: ['A', 'B'] }] })[1]?.[6]).toBe('A, B');
    expect(rows).toHaveLength(3);
  });

  it('says Không for an optional column', () => {
    const optional = { ...definition, columns: [{ ...code, required: false }] };

    expect(guideRowsOf(optional)[1]?.[1]).toBe('Không');
  });
});

describe('definitionProblems', () => {
  it('accepts a definition whose rows have one cell per column', () => {
    expect(definitionProblems(definition)).toEqual([]);
  });

  it('names a row that is too short or too long', () => {
    expect(definitionProblems({ ...definition, sampleRows: [['NV001']] })).toEqual(['row 1 has 1 cells for 2 columns']);
  });

  it('names a header written twice and a template with no example row', () => {
    expect(definitionProblems({ ...definition, columns: [code, code], sampleRows: [['a', 'b']] })).toEqual([
      'column employee_code is written twice',
    ]);
    expect(definitionProblems({ ...definition, sampleRows: [] })).toEqual(['no example row']);
    expect(definitionProblems({ ...definition, formats: [] })).toEqual(['no format']);
  });
});

describe('canDownloadTemplate', () => {
  it('lets the people who do the import download it, and nobody else', () => {
    expect(canDownloadTemplate('employees', ['SUPER_ADMIN'])).toBe(true);
    expect(canDownloadTemplate('employees', ['IT_ADMIN'])).toBe(false);
    expect(canDownloadTemplate('seat-baseline', ['IT_ADMIN', 'EMPLOYEE'])).toBe(true);
    expect(canDownloadTemplate('budget-proposal', ['MANAGER'])).toBe(true);
    expect(canDownloadTemplate('budget-proposal', ['FINANCE'])).toBe(true);
    expect(canDownloadTemplate('budget-proposal', ['SPENDING_APPROVER'])).toBe(false);
  });
});

describe('templateFileName', () => {
  it('names the kind and the format', () => {
    expect(templateFileName('seat-baseline', 'csv')).toBe('mau-seat-baseline.csv');
    expect(templateFileName('budget-proposal', 'xlsx')).toBe('mau-budget-proposal.xlsx');
  });
});
