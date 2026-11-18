import ExcelJS from 'exceljs';

/**
 * The template of BM-10 as `GET /import-templates/budget-proposal?format=xlsx` hands it out, rebuilt for the unit tests (a seed test may not reach into
 * the module that makes it: `composition-root-public-door`). The layout is the one of `budget-proposal-template.policy.ts` and `import-template.service.ts`:
 * a merged title, four lines to fill in, a blank line, the headers, two example lines and the total; `budget-template-source.spec.ts` keeps the words
 * of this copy equal to the words of the policy.
 */
export const BM10_FIELDS = ['Phòng ban / Cost Center:', 'Năm ngân sách:', 'Người lập:', 'Ngày lập:'] as const;
export const BM10_HEADERS = [
  'Phần mềm',
  'Gói',
  'Số seat',
  'Đơn giá / seat / tháng (VND, chưa thuế)',
  'Số tháng',
  'Thành tiền (VND, chưa thuế)',
  'Lý do cần',
] as const;
export const BM10_TOTAL = 'Tổng cộng (khớp số tiền đề nghị nhập ở màn nộp BM-10)';

export async function fakeBm10Template(): Promise<Uint8Array> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('BM-10');
  sheet.columns = BM10_HEADERS.map((label) => ({ width: Math.max(18, label.length + 4) }));
  sheet.addRow(['BM-10 — Đề nghị ngân sách phần mềm năm của phòng']).font = { bold: true, size: 14 };
  sheet.mergeCells(1, 1, 1, BM10_HEADERS.length);
  for (const field of BM10_FIELDS) sheet.addRow([field]).getCell(1).font = { bold: true };
  sheet.addRow([]);
  sheet.addRow([...BM10_HEADERS]).font = { bold: true };
  sheet.addRow([
    'Figma',
    'Professional',
    6,
    375000,
    12,
    { formula: 'C8*D8*E8', result: 27000000 },
    'Thiết kế giao diện cho dự án khách hàng mới',
  ]);
  sheet.addRow([
    'Jira',
    'Standard',
    20,
    180000,
    12,
    { formula: 'C9*D9*E9', result: 43200000 },
    'Theo dõi công việc nhóm kỹ thuật',
  ]);
  sheet.addRow([BM10_TOTAL, null, null, null, null, { formula: 'SUM(F8:F9)', result: 70200000 }]).font = { bold: true };
  book.addWorksheet('Hướng dẫn').addRow(['Cột', 'Bắt buộc']);

  return new Uint8Array(await book.xlsx.writeBuffer());
}
