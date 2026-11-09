import ExcelJS from 'exceljs';
import { inflateRawSync } from 'node:zlib';
import { EMPLOYEE_COLUMNS } from '../employee-import-row.types';
import { ImportFileInvalidError, ImportFileUnreadableError } from '../employee-import.errors';
import { employeeTableToRows, MAX_DATA_ROWS, readEmployeeFile } from './employee-import-file.policy';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const MAX_UNCOMPRESSED_ZIP_BYTES = 20 * 1024 * 1024; // 20 MB

const SIGNATURE_LOCAL_HEADER = 0x04034b50;
const SIGNATURE_CENTRAL_HEADER = 0x02014b50;
const SIGNATURE_END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const SIGNATURE_ZIP64_LOCATOR = 0x07064b50;
const METHOD_STORED = 0;
const METHOD_DEFLATED = 8;
// Bit 0 encrypted, bit 6 strong encryption, bit 13 masked local headers: none is allowed in a workbook.
const ENCRYPTION_FLAGS = 0x2041;
const ZIP64_MARKER_16 = 0xffff;
const ZIP64_MARKER_32 = 0xffffffff;

const invalidXlsx = () => new ImportFileUnreadableError('INVALID_XLSX', undefined);

function findEocdOffset(bytes: Buffer): number {
  const minEocdOffset = Math.max(0, bytes.length - 65535 - 22);
  for (let i = bytes.length - 22; i >= minEocdOffset; i--) {
    if (bytes.readUInt32LE(i) === SIGNATURE_END_OF_CENTRAL_DIRECTORY) return i;
  }
  return -1;
}

interface ZipEntry {
  readonly method: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly localHeaderOffset: number;
}

interface EndRecord {
  readonly count: number;
  readonly directoryOffset: number;
  readonly directoryEnd: number;
}

/** The end-of-directory record, refused unless it describes a plain single-disk archive whose directory ends where the record starts. */
function readEndRecord(bytes: Buffer): EndRecord {
  const eocd = findEocdOffset(bytes);
  if (eocd === -1) throw invalidXlsx();
  if (eocd >= 20 && bytes.readUInt32LE(eocd - 20) === SIGNATURE_ZIP64_LOCATOR) throw invalidXlsx();

  const count = bytes.readUInt16LE(eocd + 10);
  const directorySize = bytes.readUInt32LE(eocd + 12);
  const directoryOffset = bytes.readUInt32LE(eocd + 16);
  const onOtherDisk = bytes.readUInt16LE(eocd + 4) !== 0 || bytes.readUInt16LE(eocd + 6) !== 0;
  if (onOtherDisk || bytes.readUInt16LE(eocd + 8) !== count) throw invalidXlsx();
  if (count === 0 || count === ZIP64_MARKER_16) throw invalidXlsx();
  if (directorySize === ZIP64_MARKER_32 || directoryOffset === ZIP64_MARKER_32) throw invalidXlsx();
  // The directory ends where the end record starts: bytes in between (or before the first entry) would make the
  // offsets this guard reads differ from the ones the library applies.
  if (directoryOffset + directorySize !== eocd) throw invalidXlsx();

  return { count, directoryOffset, directoryEnd: eocd };
}

/** One record of the central directory at `offset`, with the length it takes; refused when it needs ZIP64, encryption or a method a workbook never uses. */
function readEntryRecord(bytes: Buffer, offset: number, directoryEnd: number): { entry: ZipEntry; length: number } {
  if (offset + 46 > directoryEnd) throw invalidXlsx();
  const flags = bytes.readUInt16LE(offset + 8);
  const method = bytes.readUInt16LE(offset + 10);
  const compressedSize = bytes.readUInt32LE(offset + 20);
  const uncompressedSize = bytes.readUInt32LE(offset + 24);
  const length =
    46 + bytes.readUInt16LE(offset + 28) + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32);
  const localHeaderOffset = bytes.readUInt32LE(offset + 42);
  if (offset + length > directoryEnd) throw invalidXlsx();
  if ((flags & ENCRYPTION_FLAGS) !== 0 || (method !== METHOD_STORED && method !== METHOD_DEFLATED)) throw invalidXlsx();
  if (bytes.readUInt16LE(offset + 34) !== 0) throw invalidXlsx();
  if ([compressedSize, uncompressedSize, localHeaderOffset].includes(ZIP64_MARKER_32)) throw invalidXlsx();

  return { entry: { method, compressedSize, uncompressedSize, localHeaderOffset }, length };
}

/**
 * Reads the central directory the way the library that opens the file later does: from the end-of-directory record,
 * record after record while the signature matches. The count the archive declares is only trusted when it equals what
 * was walked, so a lying count cannot hide records from this guard. ZIP64, several disks, encryption and any method
 * but stored/deflated are refused as `INVALID_XLSX`: a workbook never needs them.
 */
function readCentralDirectory(bytes: Buffer): { entries: ZipEntry[]; directoryOffset: number } {
  const { count, directoryOffset, directoryEnd } = readEndRecord(bytes);
  const entries: ZipEntry[] = [];
  let offset = directoryOffset;
  while (offset + 4 <= directoryEnd && bytes.readUInt32LE(offset) === SIGNATURE_CENTRAL_HEADER) {
    const { entry, length } = readEntryRecord(bytes, offset, directoryEnd);
    entries.push(entry);
    offset += length;
  }
  if (entries.length !== count) throw invalidXlsx();

  return { entries, directoryOffset };
}

function compressedBytesOf(bytes: Buffer, entry: ZipEntry, directoryOffset: number): Buffer {
  const header = entry.localHeaderOffset;
  if (header + 30 > directoryOffset || bytes.readUInt32LE(header) !== SIGNATURE_LOCAL_HEADER) throw invalidXlsx();
  const start = header + 30 + bytes.readUInt16LE(header + 26) + bytes.readUInt16LE(header + 28);
  const end = start + entry.compressedSize;
  if (end > directoryOffset) throw invalidXlsx();
  return bytes.subarray(start, end);
}

/**
 * Refuses a zip bomb before the workbook library sees the bytes. The sizes the archive declares are not believed:
 * every entry is inflated once, here, with a hard output limit, and must come out exactly as long as declared. After
 * this the library's own inflation is bounded by `maxBytes` too.
 *
 * @throws {ImportFileUnreadableError} `UNCOMPRESSED_SIZE_EXCEEDED` when the entries add up to more than `maxBytes`, as
 *   declared or as really inflated; `INVALID_XLSX` for any archive that is malformed or not a plain single-disk zip.
 */
export function assertZipUncompressedSize(bytes: Buffer, maxBytes = MAX_UNCOMPRESSED_ZIP_BYTES): void {
  const { entries, directoryOffset } = readCentralDirectory(bytes);
  const declaredTotal = entries.reduce((sum, entry) => sum + entry.uncompressedSize, 0);
  if (declaredTotal > maxBytes) throw new ImportFileUnreadableError('UNCOMPRESSED_SIZE_EXCEEDED', undefined);

  let remaining = maxBytes;
  for (const entry of entries) {
    const compressed = compressedBytesOf(bytes, entry, directoryOffset);
    if (entry.method === METHOD_STORED) {
      if (entry.compressedSize !== entry.uncompressedSize) throw invalidXlsx();
    } else if (entry.compressedSize > 0 || entry.uncompressedSize > 0) {
      let inflated: Buffer;
      try {
        inflated = inflateRawSync(compressed, { maxOutputLength: remaining + 1 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ERR_BUFFER_TOO_LARGE') {
          throw new ImportFileUnreadableError('UNCOMPRESSED_SIZE_EXCEEDED', undefined);
        }
        throw invalidXlsx();
      }
      if (inflated.length !== entry.uncompressedSize) throw invalidXlsx();
    }
    remaining -= entry.uncompressedSize;
  }
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if ('formula' in value || 'sharedFormula' in value) return cellText(value.result ?? null);
  // A hyperlink's text may itself be rich text: read it like any other value, never hand an object on.
  if ('text' in value) return cellText(value.text);
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
  assertZipUncompressedSize(file.bytes);
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
  // Blank rows are skipped, as the CSV reader skips them; the header goes through the same column mapping as CSV
  // (aliases, optional work_email, department_code and job_title).
  return employeeTableToRows(rows.filter((row, index) => index === 0 || row.cells.some((cell) => cell.trim() !== '')));
}
