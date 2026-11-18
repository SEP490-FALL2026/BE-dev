import ExcelJS from 'exceljs';

/**
 * The files the seed uploads, built from the templates the API hands out and from the same figures the steps write into the system
 * (SPEC S23): every builder is a function of its inputs, so a unit test reads a file back and compares it cell by cell.
 */
export interface BuiltFile {
  fileName: string;
  contentType: string;
  bytes: Uint8Array;
}

export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** The columns of the CSV templates (`GET /import-templates/<kind>?format=csv`); a test compares them with the policy of each template. */
export const SEAT_BASELINE_COLUMNS = [
  'employee_code',
  'account_identifier',
  'kind',
  'granted_on',
  'expected_end_date',
] as const;
export const USAGE_REPORT_COLUMNS = { identifier: 'email', lastActivityDate: 'last_active_date' } as const;
export const EMPLOYEE_IMPORT_COLUMNS = [
  'employee_code',
  'full_name',
  'work_email',
  'employment_type',
  'hire_date',
  'department_code',
  'job_title',
] as const;

/** One CSV cell: quoted when it holds a comma, a quote or a line break. */
export const csvCell = (value: string): string => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/** The share of an amount, in whole dong (the half goes up, as `Math.round` does). */
export const reserveOf = (amount: number, percent: number): number => Math.round((amount * percent) / 100);

const NUMBER_FORMAT = '#,##0';
/** The columns of the table of `BM-10`: software, plan, seats, price, months, amount (= C×D×E), reason. */
const AMOUNT_COLUMN = 6;

/** A line of the table of `BM-10`. */
export interface BudgetLine {
  software: string;
  plan: string;
  seats: number;
  monthlyPrice: number;
  months: number;
  reason: string;
}

export interface Bm10Header {
  costCenterCode: string;
  year: number;
  preparedBy: string;
  preparedOn: string;
  /** The amount the head asks for the year: the total of the table is this number. */
  requestedAmount: number;
  /** The default share of reserve (`BUDGET_RESERVE_DEFAULT_PERCENT`), read from the API, never guessed. */
  reservePercent: number;
}

/** The name of the line that makes the table add up to the amount asked for. */
export const BALANCE_LINE = 'Nhu cầu phát sinh dự kiến';

const amountOf = (line: BudgetLine): number => line.seats * line.monthlyPrice * line.months;

/** The lines of the fixture plus one balancing line for what they leave short; lines that add up to more are a fault of the fixture. */
function withBalance(lines: readonly BudgetLine[], requestedAmount: number): BudgetLine[] {
  const listed = lines.reduce((sum, line) => sum + amountOf(line), 0);
  if (listed > requestedAmount) {
    throw new Error(`The lines of BM-10 add up to ${listed}, more than the ${requestedAmount} asked: fix the fixture`);
  }
  if (listed === requestedAmount) return [...lines];

  return [
    ...lines,
    {
      software: BALANCE_LINE,
      plan: '',
      seats: 1,
      monthlyPrice: requestedAmount - listed,
      months: 1,
      reason: 'Khoản dự kiến chưa gắn với một phần mềm cụ thể.',
    },
  ];
}

function rowNumberOf(sheet: ExcelJS.Worksheet, startsWith: string): number {
  for (let number = 1; number <= sheet.rowCount; number++) {
    const label = sheet.getRow(number).getCell(1).value;
    if (typeof label === 'string' && label.startsWith(startsWith)) return number;
  }
  throw new Error(`The template of BM-10 has no row that starts with "${startsWith}"`);
}

/** The value of each line of who-made-it above the table: the label is in the first column, the value goes beside it. */
function fillHeading(sheet: ExcelJS.Worksheet, header: Bm10Header): void {
  const values: [string, string | number][] = [
    ['Phòng ban', header.costCenterCode],
    ['Năm ngân sách', header.year],
    ['Người lập', header.preparedBy],
    ['Ngày lập', header.preparedOn],
  ];
  for (const [label, value] of values) sheet.getRow(rowNumberOf(sheet, label)).getCell(2).value = value;
}

function writeLine(sheet: ExcelJS.Worksheet, number: number, line: BudgetLine): void {
  const row = sheet.getRow(number);
  row.values = [
    line.software,
    line.plan,
    line.seats,
    line.monthlyPrice,
    line.months,
    { formula: `C${number}*D${number}*E${number}`, result: amountOf(line) },
    line.reason,
  ];
  row.font = { bold: false };
  for (const column of [3, 4, 5, AMOUNT_COLUMN]) row.getCell(column).numFmt = NUMBER_FORMAT;
  row.commit();
}

function writeSummary(
  sheet: ExcelJS.Worksheet,
  from: { first: number; last: number; requested: number; percent: number },
): void {
  const { last } = from;
  const total = last + 1;
  const reserve = reserveOf(from.requested, from.percent);
  const entries: [string, ExcelJS.CellValue][] = [
    [
      'Tổng cộng (khớp số tiền đề nghị nhập ở màn nộp BM-10)',
      { formula: `SUM(F${from.first}:F${last})`, result: from.requested },
    ],
    ['Ngân sách cơ sở đề xuất', { formula: `F${total}`, result: from.requested }],
    [`Dự phòng đề xuất (${from.percent} %)`, { formula: `ROUND(F${total}*${from.percent}/100,0)`, result: reserve }],
    ['Tổng cơ sở + dự phòng đề xuất', { formula: `F${total + 1}+F${total + 2}`, result: from.requested + reserve }],
  ];
  entries.forEach(([label, value], index) => {
    const row = sheet.getRow(total + index);
    row.getCell(1).value = label;
    row.getCell(AMOUNT_COLUMN).value = value;
    row.getCell(AMOUNT_COLUMN).numFmt = NUMBER_FORMAT;
    row.font = { bold: true };
    row.commit();
  });
}

/**
 * `BM-10` as a head fills it in (`QĐ-111ab`, SPEC S23 section 2, Q-E): opens the template the API handed out, writes the lines above the table, drops the
 * example lines, writes the lines of the department with the amount of each as a formula over its cells, one balancing line when they fall short,
 * the total, and below it the base, the reserve and their sum as the head proposes them. The total is the amount asked, to the dong.
 */
export async function bm10Workbook(
  template: Uint8Array,
  lines: readonly BudgetLine[],
  header: Bm10Header,
  fileName: string,
): Promise<BuiltFile> {
  const all = withBalance(lines, header.requestedAmount);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(Buffer.from(template) as unknown as ExcelJS.Buffer);
  const sheet = book.worksheets[0];
  fillHeading(sheet, header);
  const headerRow = rowNumberOf(sheet, 'Phần mềm');
  const totalRow = rowNumberOf(sheet, 'Tổng cộng');
  // The example lines and the total are cleared in place (`spliceRows` leaves a sheet with merged cells as it was).
  for (let number = headerRow + 1; number <= totalRow; number++) sheet.getRow(number).values = [];
  all.forEach((line, index) => writeLine(sheet, headerRow + 1 + index, line));
  writeSummary(sheet, {
    first: headerRow + 1,
    last: headerRow + all.length,
    requested: header.requestedAmount,
    percent: header.reservePercent,
  });

  return { fileName, contentType: XLSX_TYPE, bytes: new Uint8Array(await book.xlsx.writeBuffer()) };
}

/** The figures of the file Finance attaches to a version: the head's proposal, what the version agreed and the reason they differ. */
export interface VersionFigures {
  costCenterCode: string;
  year: number;
  versionNumber: number;
  proposedBase: number;
  /** The default share the proposal's reserve was worked out with (`BUDGET_RESERVE_DEFAULT_PERCENT`). */
  proposedPercent: number;
  /** What `GET /budget-versions/{id}` says right before the file is built. */
  agreedBase: number;
  agreedReserve: number;
  agreedPercent: number;
  reason: string;
}

/**
 * The explanation Finance attaches to a version (SPEC S23 section 3, Q-E): one sheet, one row each for the base, the reserve and the total, in three
 * columns: proposed (`BM-10`), agreed (the version) and the difference.
 */
export async function versionWorkbook(figures: VersionFigures, fileName: string): Promise<BuiltFile> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Phiên bản');
  sheet.columns = [{ width: 46 }, { width: 24 }, { width: 24 }, { width: 22 }];
  sheet.addRow([`Phiên bản số ${figures.versionNumber} — giải thích số cơ sở và dự phòng`]).font = {
    bold: true,
    size: 14,
  };
  const facts: [string, string | number][] = [
    ['Phòng ban / Cost Center:', figures.costCenterCode],
    ['Năm ngân sách:', figures.year],
    ['Phiên bản số:', figures.versionNumber],
    ['Tỷ lệ dự phòng đã chốt (%):', figures.agreedPercent],
    ['Lý do chênh lệch:', figures.reason],
  ];
  for (const [label, value] of facts) sheet.addRow([label, value]).getCell(1).font = { bold: true };
  sheet.addRow([]);
  const head = sheet.addRow(['Chỉ tiêu', 'Đề xuất (BM-10)', 'Đã chốt (phiên bản)', 'Chênh lệch']);
  head.font = { bold: true };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7ECF3' } };
  const proposedReserve = reserveOf(figures.proposedBase, figures.proposedPercent);
  const rows: [string, number, number][] = [
    ['Ngân sách cơ sở', figures.proposedBase, figures.agreedBase],
    ['Dự phòng', proposedReserve, figures.agreedReserve],
  ];
  for (const [label, proposed, agreed] of rows) addFigureRow(sheet, label, proposed, agreed);
  const base = head.number + 1;
  const total = sheet.addRow([
    'Tổng cơ sở + dự phòng',
    { formula: `B${base}+B${base + 1}`, result: figures.proposedBase + proposedReserve },
    { formula: `C${base}+C${base + 1}`, result: figures.agreedBase + figures.agreedReserve },
    {
      formula: `C${base + 2}-B${base + 2}`,
      result: figures.agreedBase + figures.agreedReserve - figures.proposedBase - proposedReserve,
    },
  ]);
  total.font = { bold: true };
  for (const column of [2, 3, 4]) total.getCell(column).numFmt = NUMBER_FORMAT;

  return { fileName, contentType: XLSX_TYPE, bytes: new Uint8Array(await book.xlsx.writeBuffer()) };
}

function addFigureRow(sheet: ExcelJS.Worksheet, label: string, proposed: number, agreed: number): void {
  const number = sheet.rowCount + 1;
  const row = sheet.addRow([label, proposed, agreed, { formula: `C${number}-B${number}`, result: agreed - proposed }]);
  for (const column of [2, 3, 4]) row.getCell(column).numFmt = NUMBER_FORMAT;
}
