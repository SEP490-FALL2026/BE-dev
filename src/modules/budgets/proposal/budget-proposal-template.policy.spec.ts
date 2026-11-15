import ExcelJS from 'exceljs';
import { definitionProblems } from '../../policies/import-template/import-template.policy';
import { ImportTemplateService } from '../../policies/import-template/import-template.service';
import { ImportTemplateContributions } from '../../policies/public/policies.extension-points';
import { BUDGET_PROPOSAL_TEMPLATE } from './budget-proposal-template.policy';

const SEATS = 2;
const PRICE = 3;
const MONTHS = 4;
const AMOUNT = 5;

/** The form BM-10 is not parsed, so what the spec holds is that it is well formed and its example lines add up (`QĐ-111ab`, `QĐ-111as`). */
describe('the form BM-10', () => {
  it('is a well formed template with an example line', () => {
    expect(definitionProblems(BUDGET_PROPOSAL_TEMPLATE)).toEqual([]);
    expect(BUDGET_PROPOSAL_TEMPLATE.columns.map((column) => column.key)).toEqual([
      'software',
      'plan',
      'seats',
      'monthly_price_vnd',
      'months',
      'amount_vnd',
      'reason',
    ]);
  });

  it('has example lines whose amount is the seats times the price of a month times the months, in whole dong', () => {
    for (const row of BUDGET_PROPOSAL_TEMPLATE.sampleRows) {
      expect(Number(row[SEATS]) * Number(row[PRICE]) * Number(row[MONTHS])).toBe(Number(row[AMOUNT]));
      expect(Number(row[MONTHS])).toBeLessThanOrEqual(12);
    }
  });

  it('asks for no bank statement, no name and no figure in a currency but dong', () => {
    const text = JSON.stringify(BUDGET_PROPOSAL_TEMPLATE).toLowerCase();

    expect(text).not.toContain('sao kê');
    expect(text).not.toContain('usd');
  });

  it('is a form a head can fill in and print: title, who made it, headers in plain words, numbers, a formula and a total (LB3-06)', async () => {
    const sources = new ImportTemplateContributions();
    sources.add('test', { definitions: () => [BUDGET_PROPOSAL_TEMPLATE] });
    const file = await new ImportTemplateService(sources).build('budget-proposal', undefined, ['MANAGER']);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Uint8Array.from(file.bytes).buffer);
    const sheet = book.getWorksheet('BM-10')!;

    expect(sheet.getCell('A1').value).toBe('BM-10 — Đề nghị ngân sách phần mềm năm của phòng');
    expect(['A2', 'A3', 'A4', 'A5'].map((cell) => sheet.getCell(cell).value)).toEqual([
      'Phòng ban / Cost Center:',
      'Năm ngân sách:',
      'Người lập:',
      'Ngày lập:',
    ]);
    expect(sheet.getRow(7).getCell(1).value).toBe('Phần mềm');
    expect(sheet.getRow(7).getCell(4).value).toBe('Đơn giá / seat / tháng (VND, chưa thuế)');
    expect(sheet.getCell('C8').value).toBe(6);
    expect(sheet.getCell('D8').value).toBe(375000);
    expect(sheet.getCell('D8').numFmt).toBe('#,##0');
    expect(sheet.getCell('F8').value).toEqual({ formula: 'C8*D8*E8', result: 27000000 });
    expect(sheet.getCell('F10').value).toEqual({ formula: 'SUM(F8:F9)', result: 70200000 });
  });
});
