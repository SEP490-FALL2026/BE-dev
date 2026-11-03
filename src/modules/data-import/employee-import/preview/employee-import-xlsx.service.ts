import ExcelJS from 'exceljs';
import { EMPLOYEE_COLUMNS } from '../employee-import-row.types';
import {
  ImportFileInvalidError,
  ImportFileMissingColumnsError,
  ImportFileUnreadableError,
} from '../employee-import.errors';
import { employeeTableToRows, MAX_DATA_ROWS, readEmployeeFile } from './employee-import-file.policy';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if ('formula' in value || 'sharedFormula' in value) return cellText(value.result ?? null);
  if ('text' in value) return value.text;
  if ('richText' in value) return value.richText.map((part) => part.text).join('');
  return '';
}

export async function readUploadedEmployeeFile(file: { fileName: string; mimeType?: string; bytes: Buffer }) {
  const extension = file.fileName.toLowerCase();
  if (extension.endsWith('.xls')) throw new ImportFileInvalidError('FILE_FORMAT_UNSUPPORTED');
  const xlsx = extension.endsWith('.xlsx') || file.mimeType === XLSX_MIME;
  if (!xlsx) {
    if (!extension.endsWith('.csv')) throw new ImportFileInvalidError('FILE_FORMAT_UNSUPPORTED');
    return readEmployeeFile(file.bytes);
  }
  if (file.bytes.length < 4 || !file.bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
    throw new ImportFileUnreadableError('INVALID_XLSX', undefined);
  }
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Uint8Array.from(file.bytes).buffer);
  } catch {
    throw new ImportFileUnreadableError('INVALID_XLSX', undefined);
  }
  return readSheet(workbook.worksheets[0]);
}

function readSheet(sheet: ExcelJS.Worksheet | undefined) {
  if (!sheet || sheet.rowCount === 0) throw new ImportFileInvalidError('FILE_EMPTY');
  let lastNonEmpty = 0;
  sheet.eachRow((row, index) => {
    if (row.hasValues) lastNonEmpty = index;
  });
  if (!lastNonEmpty) throw new ImportFileInvalidError('FILE_EMPTY');
  if (lastNonEmpty > MAX_DATA_ROWS + 1)
    throw new ImportFileInvalidError('FILE_TOO_MANY_ROWS', { maxRows: MAX_DATA_ROWS });
  const rows = [];
  for (let index = 1; index <= lastNonEmpty; index++) {
    const row = sheet.getRow(index);
    const cells: string[] = [];
    for (let col = 1; col <= Math.max(row.cellCount, EMPLOYEE_COLUMNS.length); col++)
      cells.push(cellText(row.getCell(col).value));
    rows.push({ line: index, cells });
  }
  while (rows.length > 1 && rows[rows.length - 1].cells.every((cell) => cell.trim() === '')) rows.pop();
  const header = rows[0].cells;
  const missing = EMPLOYEE_COLUMNS.filter((column) => !header.includes(column));
  if (missing.length) throw new ImportFileMissingColumnsError([...missing]);
  return employeeTableToRows(rows);
}
