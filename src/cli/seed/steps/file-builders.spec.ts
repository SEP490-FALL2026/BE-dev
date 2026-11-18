import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';
import { SHARED_DEMO_V4 as F } from '../fixture/shared-demo-v4';
import { fakeBm10Template } from './bm10-template.fake';
import { BALANCE_LINE, bm10Workbook, reserveOf, versionWorkbook } from './file-builders';
import { contractPdf, invoicePdf, receiptPdf, signaturePdf } from './pdf-builders';
import { fitLines } from './budget-files';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function reopen(bytes: Uint8Array): Promise<ExcelJS.Worksheet> {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(bytes) as unknown as ExcelJS.Buffer);

  return book.worksheets[0];
}

const header = {
  costCenterCode: 'CC-ENG',
  year: 2026,
  preparedBy: 'Lê Minh Cường',
  preparedOn: '2026-11-17',
  reservePercent: 10,
};
const lines = [
  { software: 'Jira', plan: 'Standard', seats: 20, monthlyPrice: 200000, months: 12, reason: 'Theo dõi công việc' },
  { software: 'GitHub', plan: 'Team', seats: 9, monthlyPrice: 100000, months: 12, reason: 'Mã nguồn' },
];
const linesTotal = 48_000_000 + 10_800_000;

const cellNumber = (cell: ExcelJS.Cell): number => {
  const value = cell.value as { result?: number } | number;

  return typeof value === 'number' ? value : (value.result ?? NaN);
};

/** The sheet of BM-10 from the real template: the head's file is filled in, not drawn again. */
describe('the BM-10 workbook of a head, filled from the template the API hands out', () => {
  const build = async (requestedAmount: number, rows = lines) => {
    const file = await bm10Workbook(
      await fakeBm10Template(),
      rows,
      { ...header, requestedAmount },
      'BM-10-ENG-2026.xlsx',
    );

    return { file, sheet: await reopen(file.bytes) };
  };
  const rowOf = (sheet: ExcelJS.Worksheet, label: string): number => {
    let found = -1;
    sheet.eachRow((row, number) => {
      const first = row.getCell(1).value;
      if (typeof first === 'string' && first.startsWith(label)) found = number;
    });

    return found;
  };

  it('is an xlsx with its name and type, not empty', async () => {
    const { file } = await build(58_800_000);

    expect(file).toMatchObject({ fileName: 'BM-10-ENG-2026.xlsx', contentType: XLSX_TYPE });
    expect(file.bytes.length).toBeGreaterThan(0);
    expect(Buffer.from(file.bytes.subarray(0, 4)).toString('latin1')).toBe('PK\u0003\u0004');
  });

  it('writes who, which year and when in the lines above the table', async () => {
    const { sheet } = await build(58_800_000);
    const valueOf = (label: string) => sheet.getRow(rowOf(sheet, label)).getCell(2).value;

    expect(valueOf('Phòng ban')).toBe('CC-ENG');
    expect(Number(valueOf('Năm ngân sách'))).toBe(2026);
    expect(valueOf('Người lập')).toBe('Lê Minh Cường');
    expect(valueOf('Ngày lập')).toBe('2026-11-17');
  });

  it('drops the example lines of the template and keeps the lines of the department, each amount a formula over its cells', async () => {
    const { sheet } = await build(58_800_000);
    const first = rowOf(sheet, 'Phần mềm') + 1;

    expect(sheet.getRow(first).getCell(1).value).toBe('Jira');
    expect(sheet.getRow(first).getCell(6).value).toEqual({
      formula: `C${first}*D${first}*E${first}`,
      result: 48_000_000,
    });
    expect(JSON.stringify(sheet.getSheetValues())).not.toContain('Thiết kế giao diện cho dự án khách hàng mới');
  });

  it('adds up to the amount asked for in the total cell, and adds one balancing line when the lines fall short', async () => {
    const { sheet } = await build(100_000_000);
    const total = rowOf(sheet, 'Tổng cộng');
    const balance = rowOf(sheet, BALANCE_LINE);

    expect(cellNumber(sheet.getRow(total).getCell(6))).toBe(100_000_000);
    expect(balance).toBeGreaterThan(0);
    expect(cellNumber(sheet.getRow(balance).getCell(6))).toBe(100_000_000 - linesTotal);
    expect(JSON.stringify(sheet.getRow(total).getCell(6).value)).toMatch(/"formula":"SUM\(F\d+:F\d+\)"/);
  });

  it('needs no balancing line when the lines already add up to the amount asked for', async () => {
    const { sheet } = await build(linesTotal);

    expect(rowOf(sheet, BALANCE_LINE)).toBe(-1);
    expect(cellNumber(sheet.getRow(rowOf(sheet, 'Tổng cộng')).getCell(6))).toBe(linesTotal);
  });

  it('refuses lines that add up to more than the amount asked for: that is a fault of the fixture', async () => {
    await expect(build(linesTotal - 1)).rejects.toThrow(/more than/);
  });

  it('writes the base, the reserve at the share passed in and the total below the total line (Q-E)', async () => {
    const { sheet } = await build(58_800_000);
    const base = rowOf(sheet, 'Ngân sách cơ sở đề xuất');
    const reserve = rowOf(sheet, 'Dự phòng đề xuất (10 %)');
    const both = rowOf(sheet, 'Tổng cơ sở + dự phòng đề xuất');

    expect([cellNumber(sheet.getRow(base).getCell(6)), cellNumber(sheet.getRow(reserve).getCell(6))]).toEqual([
      58_800_000, 5_880_000,
    ]);
    expect(cellNumber(sheet.getRow(both).getCell(6))).toBe(64_680_000);
    expect(rowOf(sheet, 'Tổng cơ sở')).toBe(reserve + 1);
  });

  it('uses the share it is given and rounds the reserve to a whole dong', async () => {
    const file = await bm10Workbook(
      await fakeBm10Template(),
      lines,
      { ...header, requestedAmount: 58_800_001, reservePercent: 60 },
      'x.xlsx',
    );
    const sheet = await reopen(file.bytes);
    const reserve = rowOf(sheet, 'Dự phòng đề xuất (60 %)');

    expect(cellNumber(sheet.getRow(reserve).getCell(6))).toBe(reserveOf(58_800_001, 60));
    expect(reserveOf(58_800_001, 60)).toBe(35_280_001);
  });
});

/** The file Finance attaches to a version (Q-E): the proposal, the version agreed and the difference, from the same figures. */
describe('the workbook Finance attaches to a version', () => {
  const figures = {
    costCenterCode: 'CC-FIN',
    year: 2026,
    versionNumber: 2,
    proposedBase: 50_000_000,
    proposedPercent: 10,
    agreedBase: 47_000_000,
    agreedReserve: 28_200_000,
    agreedPercent: 60,
    reason: '[SV-RESERVE] Dự phòng 60 % vì thực chi đang tăng',
  };

  it('has three rows, base, reserve and total, with the proposed, the agreed and the difference in three columns', async () => {
    const file = await versionWorkbook(figures, 'phien-ban-FIN-2026.xlsx');
    const sheet = await reopen(file.bytes);
    const row = (label: string) => {
      let found: ExcelJS.Row | undefined;
      sheet.eachRow((candidate) => {
        if (candidate.getCell(1).value === label) found = candidate;
      });

      return found!;
    };
    const numbers = (label: string) => [2, 3, 4].map((column) => cellNumber(row(label).getCell(column)));

    expect(file.contentType).toBe(XLSX_TYPE);
    expect(numbers('Ngân sách cơ sở')).toEqual([50_000_000, 47_000_000, -3_000_000]);
    expect(numbers('Dự phòng')).toEqual([5_000_000, 28_200_000, 23_200_000]);
    expect(numbers('Tổng cơ sở + dự phòng')).toEqual([55_000_000, 75_200_000, 20_200_000]);
    expect(JSON.stringify(sheet.getSheetValues())).toContain('Dự phòng 60 % vì thực chi đang tăng');
    expect(JSON.stringify(sheet.getSheetValues())).toContain('CC-FIN');
  });

  it('names the three columns of the figures', async () => {
    const sheet = await reopen((await versionWorkbook(figures, 'v.xlsx')).bytes);
    const found: string[] = [];
    sheet.eachRow((row) => {
      if (row.getCell(1).value === 'Chỉ tiêu')
        found.push(...[2, 3, 4].map((column) => JSON.stringify(row.getCell(column).value).replaceAll('"', '')));
    });

    expect(found).toEqual(['Đề xuất (BM-10)', 'Đã chốt (phiên bản)', 'Chênh lệch']);
  });
});

describe('the PDFs of the contracts, invoices, signed records and receipts', () => {
  const contract = {
    number: 'SV-HD-001',
    name: 'Hợp đồng khung Atlassian',
    vendor: 'Atlassian',
    effectiveFrom: '2026-05-01',
    effectiveTo: '2027-05-01',
  };
  const invoice = {
    vendorInvoiceNumber: 'SV-INV-001',
    vendorName: 'Atlassian',
    issuedOn: '2026-11-17',
    servicePeriodMonth: '2026-11',
    quantity: 10,
    unitPrice: '200000',
    netAmount: '2000000',
  };

  it.each([
    ['contract', () => contractPdf(contract), 'SV-HD-001', 'Hợp đồng'],
    ['invoice', () => invoicePdf(invoice), 'SV-INV-001', 'Hóa đơn'],
    [
      'signed record',
      () =>
        signaturePdf({ assetCode: 'SV-LT-004', holder: 'Phùng Thị Nga', noticeVersion: 'v1', signedOn: '2026-11-17' }),
      'SV-LT-004',
      'Phùng Thị Nga',
    ],
    [
      'receipt',
      () =>
        receiptPdf({
          number: 'bien-nhan-jira',
          vendor: 'Atlassian',
          amount: '200000',
          issuedOn: '2026-11-17',
          note: 'Biên nhận',
        }),
      'bien-nhan-jira',
      'Biên nhận',
    ],
  ])('builds a one-page PDF of a %s that opens again, titled by its number', async (_name, build, number, accented) => {
    const file = await build();
    const document = await PDFDocument.load(file.bytes);

    expect(file.contentType).toBe('application/pdf');
    expect(file.fileName.endsWith('.pdf')).toBe(true);
    expect(Buffer.from(file.bytes.subarray(0, 5)).toString('latin1')).toBe('%PDF-');
    expect(document.getPageCount()).toBe(1);
    expect(document.getTitle()).toBe(number);
    expect(file.lines.join('\n')).toContain(number);
    expect(file.lines.join('\n')).toContain(accented);
  });

  it('prints the vendor and the dates of a contract', async () => {
    const text = (await contractPdf(contract)).lines.join('\n');

    expect(text).toContain('Hợp đồng khung Atlassian');
    expect(text).toContain('Atlassian');
    expect(text).toContain('2026-05-01');
    expect(text).toContain('2027-05-01');
  });

  it('prints the figures of an invoice, the amount grouped by thousands', async () => {
    const text = (await invoicePdf(invoice)).lines.join('\n');

    expect(text).toContain('2.000.000');
    expect(text).toContain('200.000');
    expect(text).toContain('2026-11');
    expect(text).toContain('10');
  });

  it('prints the amount and the vendor of a receipt', async () => {
    const text = (
      await receiptPdf({ number: 'r-1', vendor: 'Atlassian', amount: '200000', issuedOn: '2026-11-17', note: 'x' })
    ).lines.join('\n');

    expect(text).toContain('200.000');
    expect(text).toContain('Atlassian');
  });

  it('keeps the font the PDFs embed in the repository, where jest and the built command both find it', () => {
    const font = join(__dirname, '../assets/fonts/NotoSans-Regular.ttf');

    expect(existsSync(font)).toBe(true);
    expect(readFileSync(font).length).toBeGreaterThan(100_000);
    expect(existsSync(join(__dirname, '../assets/fonts/OFL.txt'))).toBe(true);
  });
});

describe('the budget lines of the fixture', () => {
  it('fit within the amount a department asks for, this year or next, once cut to it', () => {
    const asked = [
      ...F.budgets.map((budget) => ({ department: budget.department, amount: Number(budget.base) })),
      ...F.nextYear.map((next) => ({ department: next.department, amount: Number(next.requestedAmount) })),
    ];
    for (const { department, amount } of asked) {
      const rows = F.budgetLines[department] ?? [];
      const sum = fitLines(rows, amount).reduce(
        (total, line) => total + line.seats * line.monthlyPrice * line.months,
        0,
      );

      expect(rows.length).toBeGreaterThan(0);
      expect(sum).toBeLessThanOrEqual(amount);
    }
  });

  it('make the base of a department meant to sit under, so its balancing line stays a small part of BM-10', () => {
    for (const budget of F.budgets.filter((entry) => entry.light === 'UNDER')) {
      const sum = (F.budgetLines[budget.department] ?? []).reduce(
        (total, line) => total + line.seats * line.monthlyPrice * line.months,
        0,
      );

      expect(sum).toBeLessThanOrEqual(Number(budget.base));
      expect(sum).toBeGreaterThanOrEqual(Number(budget.base) * 0.9);
    }
  });
});
