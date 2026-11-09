import { CsvError, parseCsvRows } from '../../../../core/csv';
import { UsageImportFileError } from '../vendor-import.errors';
import { MAX_REPORT_ROWS } from '../vendor-import.types';
import type { RawReport, RawReportRow, ReadingSource } from './vendor-import-parse.types';

/** The separators of the days one cell may hold (`2026-06-01;2026-06-02`). */
const DATE_LIST_SEPARATOR = /[;|\s]+|,(?=\s*\d{4}-)/;

/** The columns the template names for this shape, by what each holds. */
function wantedColumns(source: ReadingSource): Array<{ key: string; name: string }> {
  const { columns } = source.template;
  const wanted = [{ key: 'identifier', name: columns.identifier }];
  for (const key of ['activeDates', 'lastActivityDate', 'date', 'eventType'] as const) {
    const name = columns[key];
    if (name) wanted.push({ key, name });
  }

  return wanted;
}

/**
 * Reads a CSV report by the template of its source: the header names the columns (case and spaces do not matter), each later line is
 * one subject (`AGGREGATE`) or one event (`EVENT`). A column the template names and the file lacks refuses the whole file; a column the
 * template does not name is not read. Throws UsageImportFileError.
 */
export function readCsvReport(text: string, source: ReadingSource): RawReport {
  let lines;
  try {
    lines = parseCsvRows(text, { maxRows: MAX_REPORT_ROWS + 2, maxColumns: 60, maxCellLength: 2000 });
  } catch (error) {
    if (error instanceof CsvError) {
      if (error.reason === 'TOO_MANY_ROWS') {
        throw new UsageImportFileError('FILE_TOO_MANY_ROWS', { maxRows: MAX_REPORT_ROWS });
      }
      throw new UsageImportFileError('FILE_UNREADABLE', {
        reason: error.reason,
        ...(error.row === undefined ? {} : { line: error.row }),
      });
    }
    throw error;
  }
  const [header, ...body] = lines.filter((line) => line.cells.some((cell) => cell.trim() !== ''));
  if (!header) throw new UsageImportFileError('FILE_EMPTY');
  if (body.length > MAX_REPORT_ROWS) throw new UsageImportFileError('FILE_TOO_MANY_ROWS', { maxRows: MAX_REPORT_ROWS });

  const index = new Map(header.cells.map((cell, position) => [cell.trim().toLowerCase(), position]));
  const wanted = wantedColumns(source);
  const missing = wanted.filter((column) => !index.has(column.name.trim().toLowerCase())).map((column) => column.name);
  if (missing.length > 0) throw new UsageImportFileError('FILE_MISSING_COLUMNS', { missing });
  const at = (key: string): number | null => {
    const column = wanted.find((candidate) => candidate.key === key);

    return column ? (index.get(column.name.trim().toLowerCase()) ?? null) : null;
  };
  const columnOf = {
    identifier: at('identifier') as number,
    activeDates: at('activeDates'),
    lastActivityDate: at('lastActivityDate'),
    date: at('date'),
    eventType: at('eventType'),
  };
  const cell = (cells: string[], position: number | null): string =>
    position === null ? '' : (cells[position] ?? '').trim();

  let pairs = 0;
  const rows: RawReportRow[] = body.map((line) => {
    const activeDates = cell(line.cells, columnOf.activeDates)
      .split(DATE_LIST_SEPARATOR)
      .filter((value) => value !== '');
    const lastActivityDate = cell(line.cells, columnOf.lastActivityDate);
    const date = cell(line.cells, columnOf.date);
    const eventType = cell(line.cells, columnOf.eventType);
    pairs += Math.max(1, activeDates.length + (lastActivityDate ? 1 : 0) + (date ? 1 : 0));

    return {
      lineNumber: line.line,
      identifier: cell(line.cells, columnOf.identifier),
      notAPerson: false,
      activeDates,
      lastActivityDate: lastActivityDate === '' ? null : lastActivityDate,
      events: date === '' && eventType === '' ? [] : [{ date, eventType }],
    };
  });

  return { rows, application: null, window: null, pairs };
}
