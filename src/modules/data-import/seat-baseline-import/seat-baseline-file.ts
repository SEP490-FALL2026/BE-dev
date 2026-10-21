import { CsvError, parseCsvRows } from '../../../core/csv';
import {
  SeatImportFileInvalidError,
  SeatImportFileMissingColumnsError,
  SeatImportFileUnreadableError,
} from './seat-baseline-import.errors';
import { SEAT_COLUMNS, type SeatCells } from './seat-baseline-import.types';
import { mapSeatColumns } from './seat-baseline-rows';

/** The seat file is read whole, so it has a ceiling: more rows than this belong in several files. */
export const MAX_DATA_ROWS = 1000;

/** One data row of the file: the line it begins on (the header is line 1) and its cells by column. */
export interface SeatFileRow {
  lineNumber: number;
  cells: SeatCells;
}

/**
 * Reads the uploaded bytes of a seat baseline file into rows of named cells (`US-02-05`), or throws why the file cannot be
 * used as a whole: empty, not text, unreadable as a table, too many rows, a required column missing, or a header with
 * no row under it. Headers that no column uses are returned as ignored. Reads nothing else.
 */
export function readSeatFile(bytes: Buffer): { rows: SeatFileRow[]; ignored: string[] } {
  if (bytes.length === 0) throw new SeatImportFileInvalidError('FILE_EMPTY');
  if (bytes.includes(0)) throw new SeatImportFileInvalidError('FILE_NOT_TEXT');

  let table;
  try {
    table = parseCsvRows(bytes.toString('utf8'), { maxRows: MAX_DATA_ROWS + 1 });
  } catch (error) {
    if (error instanceof CsvError) {
      if (error.reason === 'TOO_MANY_ROWS') {
        throw new SeatImportFileInvalidError('FILE_TOO_MANY_ROWS', { maxRows: MAX_DATA_ROWS });
      }
      throw new SeatImportFileUnreadableError(error.reason, error.row);
    }
    throw error;
  }
  if (table.length === 0) throw new SeatImportFileInvalidError('FILE_EMPTY');

  const [header, ...data] = table;
  const columns = mapSeatColumns(header.cells);
  if (columns.missing.length > 0) throw new SeatImportFileMissingColumnsError(columns.missing);
  if (data.length === 0) throw new SeatImportFileInvalidError('FILE_EMPTY');

  return {
    ignored: columns.ignored,
    rows: data.map((row) => ({
      lineNumber: row.line,
      cells: Object.fromEntries(
        SEAT_COLUMNS.flatMap((column) => {
          const index = columns.indexOf[column];

          return index === undefined ? [] : [[column, row.cells[index] ?? '']];
        }),
      ),
    })),
  };
}
