import {
  SeatImportFileInvalidError,
  SeatImportFileMissingColumnsError,
  SeatImportFileUnreadableError,
} from './seat-baseline-import.errors';
import { MAX_DATA_ROWS, readSeatFile } from './seat-baseline-file';

const file = (text: string) => Buffer.from(text, 'utf8');

describe('readSeatFile', () => {
  it('reads the rows of a file into named cells, with the line each begins on (the header is line 1)', () => {
    const { rows, ignored } = readSeatFile(
      file('employee_code,account_identifier,kind\nE1,e1@congty.vn,\nE2,ci-bot,service\n'),
    );

    expect(ignored).toEqual([]);
    expect(rows).toEqual([
      { lineNumber: 2, cells: { employee_code: 'E1', account_identifier: 'e1@congty.vn', kind: '' } },
      { lineNumber: 3, cells: { employee_code: 'E2', account_identifier: 'ci-bot', kind: 'service' } },
    ]);
  });

  it('reads a file with a byte order mark, semicolons, quotes and loose headers', () => {
    const { rows } = readSeatFile(
      file('﻿Employee Code;Account-Identifier;Reason\n"E1";"e1@congty.vn";"CI, nightly"\n'),
    );

    expect(rows).toEqual([
      { lineNumber: 2, cells: { employee_code: 'E1', account_identifier: 'e1@congty.vn', reason: 'CI, nightly' } },
    ]);
  });

  it('reports the headers that no column uses, and keeps them out of the cells', () => {
    const { rows, ignored } = readSeatFile(file('employee_code,account_identifier,notes\nE1,e1@congty.vn,hi\n'));

    expect(ignored).toEqual(['notes']);
    expect(rows[0].cells).toEqual({ employee_code: 'E1', account_identifier: 'e1@congty.vn' });
  });

  it('refuses a file with no bytes, no text or no row under the header', () => {
    expect(() => readSeatFile(Buffer.alloc(0))).toThrow(SeatImportFileInvalidError);
    expect(() => readSeatFile(Buffer.from([0x50, 0x4b, 0x00, 0x03]))).toThrow(SeatImportFileInvalidError);
    expect(() => readSeatFile(file('employee_code,account_identifier\n'))).toThrow(SeatImportFileInvalidError);
    expect(() => readSeatFile(file('\n\n'))).toThrow(SeatImportFileInvalidError);
  });

  it('names the required columns the file lacks', () => {
    expect.assertions(2);
    try {
      readSeatFile(file('employee_code,kind\nE1,personal\n'));
    } catch (error) {
      expect(error).toBeInstanceOf(SeatImportFileMissingColumnsError);
      expect((error as SeatImportFileMissingColumnsError).missing).toEqual(['account_identifier']);
    }
  });

  it('refuses a table that cannot be read, with the line where it went wrong', () => {
    expect.assertions(2);
    try {
      readSeatFile(file('employee_code,account_identifier\nE1,"e1@congty.vn\n'));
    } catch (error) {
      expect(error).toBeInstanceOf(SeatImportFileUnreadableError);
      expect((error as SeatImportFileUnreadableError).reason).toBe('UNTERMINATED_QUOTE');
    }
  });

  it('takes up to the limit of rows and refuses one more', () => {
    const header = 'employee_code,account_identifier\n';
    const rows = (count: number) =>
      Array.from({ length: count }, (_, index) => `E${index},e${index}@congty.vn`).join('\n');

    expect(readSeatFile(file(header + rows(MAX_DATA_ROWS))).rows).toHaveLength(MAX_DATA_ROWS);
    expect(() => readSeatFile(file(header + rows(MAX_DATA_ROWS + 1)))).toThrow(SeatImportFileInvalidError);
  });
});
