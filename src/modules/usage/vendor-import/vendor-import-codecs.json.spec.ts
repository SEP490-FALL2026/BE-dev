import { JsonColumnShapeError } from '../../../infrastructure/database/json-column.errors';
import { usageImportResultJson } from './vendor-import-result.json';
import { usageImportRowCellsJson } from './vendor-import-row-cells.json';
import { usageImportRowErrorsJson } from './vendor-import-row-errors.json';
import { usageImportSummaryJson } from './vendor-import-summary.json';
import type { ImportResult, ImportSummary, RowCells } from './vendor-import.types';

const summary: ImportSummary = {
  window: { from: '2026-06-01', to: '2026-08-31', basis: 'DECLARED' },
  totalRows: 10,
  matched: 7,
  unmatched: 1,
  ambiguous: 1,
  notAPerson: 0,
  invalid: 1,
  byCode: { DATE_AFTER_WINDOW: 1 },
  distinctIdentifiers: 10,
  affectedSeats: 7,
  detectableGroups: ['G1', 'G2', 'G3', 'G4'],
  activityDefinition: 'mở và sửa file',
  warnings: [],
  unmappedEventTypes: [],
  trackingNoticeRequired: true,
  recordedOn: '2026-09-02',
};
const result: ImportResult = {
  daysWritten: 40,
  matched: 7,
  unmatched: 1,
  ambiguous: 1,
  notAPerson: 0,
  invalid: 1,
  mappingsCreated: 7,
  daysSuperseded: 0,
  findingsOpened: 1,
  findingsClosed: 0,
  noticesSent: 70,
};
const cells: RowCells = { days: [{ date: '2026-06-02', eventClass: 'VALUE', basis: 'ACTIVE_DATE' }] };

describe('the codecs of the vendor usage import columns', () => {
  it('read what they write: summary, result, cells and errors', () => {
    expect(usageImportSummaryJson.decode(JSON.parse(JSON.stringify(usageImportSummaryJson.encode(summary))))).toEqual(
      summary,
    );
    expect(usageImportResultJson.decode(JSON.parse(JSON.stringify(usageImportResultJson.encode(result))))).toEqual(
      result,
    );
    expect(usageImportRowCellsJson.decode(JSON.parse(JSON.stringify(usageImportRowCellsJson.encode(cells))))).toEqual(
      cells,
    );
    expect(usageImportRowErrorsJson.decode([{ code: 'DATE_AFTER_WINDOW', detail: '2026-09-30' }])).toEqual([
      { code: 'DATE_AFTER_WINDOW', detail: '2026-09-30' },
    ]);
  });

  it('result is null until the import is confirmed', () => {
    expect(usageImportResultJson.decode(null)).toBeNull();
  });

  it.each([
    [
      'summary: a window that is not a date',
      () => usageImportSummaryJson.decode({ ...summary, window: { ...summary.window, from: 'x' } }),
      'usage_imports.summary',
    ],
    ['summary: null', () => usageImportSummaryJson.decode(null), 'usage_imports.summary'],
    [
      'result: a count that is text',
      () => usageImportResultJson.decode({ ...result, daysWritten: '40' }),
      'usage_imports.result',
    ],
    [
      'cells: a class that does not exist',
      () => usageImportRowCellsJson.decode({ days: [{ date: '2026-06-02', eventClass: 'X', basis: 'ACTIVE_DATE' }] }),
      'usage_import_rows.cells',
    ],
    ['errors: an object, not a list', () => usageImportRowErrorsJson.decode({}), 'usage_import_rows.errors'],
  ])('refuses %s with the table and the column', (_label, decode, column) => {
    expect(decode).toThrow(JsonColumnShapeError);
    expect(decode).toThrow(column);
  });
});
