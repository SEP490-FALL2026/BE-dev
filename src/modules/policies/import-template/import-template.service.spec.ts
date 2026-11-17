import ExcelJS from 'exceljs';
import type { ImportTemplateDefinition } from '../public/policies.types';
import { ImportTemplateContributions } from '../public/policies.extension-points';
import { ImportTemplateService } from './import-template.service';

const text = (key: string, example: string) => ({
  key,
  description: key,
  required: true,
  format: 'văn bản',
  example,
  constraint: '',
});

const people: ImportTemplateDefinition = {
  kind: 'employees',
  title: 'Danh sách nhân viên',
  formats: ['xlsx', 'csv'],
  columns: [text('employee_code', '000123'), text('hire_date', '2026-01-05')],
  sampleRows: [['000123', '2026-01-05']],
  notes: ['Tối đa 1.000 dòng.'],
};

const form: ImportTemplateDefinition = {
  kind: 'budget-proposal',
  title: 'Biểu mẫu BM-10',
  formats: ['xlsx'],
  form: {
    title: 'BM-10 — Đề nghị ngân sách phần mềm năm của phòng',
    fields: ['Phòng ban', 'Năm ngân sách'],
    totalLabel: 'Tổng cộng',
  },
  columns: [
    { ...text('software', 'Figma'), label: 'Phần mềm' },
    { ...text('seats', '6'), label: 'Số seat', kind: 'integer' },
    { ...text('price', '375000'), label: 'Đơn giá (VND)', kind: 'vnd' },
    { ...text('amount', '2250000'), label: 'Thành tiền (VND)', kind: 'vnd', formula: 'B{row}*C{row}' },
  ],
  sampleRows: [
    ['Figma', '6', '375000', '2250000'],
    ['Jira', '2', '180000', '360000'],
  ],
  notes: [],
};

async function workbookOf(definition: ImportTemplateDefinition, format?: 'xlsx' | 'csv') {
  const sources = new ImportTemplateContributions();
  sources.add('test', { definitions: () => [definition] });
  const file = await new ImportTemplateService(sources).build(definition.kind, format, ['SUPER_ADMIN', 'MANAGER']);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Uint8Array.from(file.bytes).buffer);

  return book;
}

describe('the workbook of a template (LB3-05, LB3-06)', () => {
  it('formats every cell of a text column as text, the cells a person types later included, so 000123 stays 000123', async () => {
    const sheet = (await workbookOf(people)).getWorksheet('Dữ liệu')!;

    expect(sheet.getCell('A2').value).toBe('000123');
    expect(sheet.getCell('A2').numFmt).toBe('@');
    // A row nobody wrote yet: it takes the format of its column.
    expect(sheet.getCell('A40').numFmt).toBe('@');
    expect(sheet.getCell('B40').numFmt).toBe('@');
  });

  it('puts the instruction sheet second, with the columns and what the parser answers', async () => {
    const book = await workbookOf(people);

    expect(book.worksheets.map((sheet) => sheet.name)).toEqual(['Dữ liệu', 'Hướng dẫn']);
    expect(book.getWorksheet('Hướng dẫn')!.getRow(1).getCell(1).value).toBe('Cột');
  });

  describe('a form for people (BM-10)', () => {
    it('opens with its title and the lines of who made it, then the headers in the reader’s words', async () => {
      const sheet = (await workbookOf(form)).worksheets[0];

      expect(sheet.getCell('A1').value).toBe('BM-10 — Đề nghị ngân sách phần mềm năm của phòng');
      expect([sheet.getCell('A2').value, sheet.getCell('A3').value]).toEqual(['Phòng ban', 'Năm ngân sách']);
      expect([1, 2, 3, 4].map((column) => sheet.getRow(5).getCell(column).value)).toEqual([
        'Phần mềm',
        'Số seat',
        'Đơn giá (VND)',
        'Thành tiền (VND)',
      ]);
    });

    it('keeps seats and money as numbers formatted by the thousand, and the amount of a line as a formula over its cells', async () => {
      const sheet = (await workbookOf(form)).worksheets[0];

      expect(sheet.getCell('B6').value).toBe(6);
      expect(sheet.getCell('C6').value).toBe(375000);
      expect(sheet.getCell('C6').numFmt).toBe('#,##0');
      expect(sheet.getCell('D6').value).toEqual({ formula: 'B6*C6', result: 2250000 });
    });

    it('ends with a total that adds the lines, to compare with the amount asked for', async () => {
      const sheet = (await workbookOf(form)).worksheets[0];

      expect(sheet.getCell('A8').value).toBe('Tổng cộng');
      expect(sheet.getCell('D8').value).toEqual({ formula: 'SUM(D6:D7)', result: 2610000 });
    });

    it('freezes the rows above the first line, so the headers stay in view', async () => {
      const sheet = (await workbookOf(form)).worksheets[0];

      expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 5 });
    });
  });
});
