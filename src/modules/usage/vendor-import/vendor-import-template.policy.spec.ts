import { ImportTemplateService } from '../../policies/import-template/import-template.service';
import { ImportTemplateContributions } from '../../policies/public/policies.extension-points';
import { parseReport } from './parse/vendor-import-parse.policy';
import type { ReadingSource } from './parse/vendor-import-parse.types';
import { UsageImportFileError } from './vendor-import.errors';
import { USAGE_REPORT_TEMPLATE, USAGE_TEMPLATE_COLUMNS } from './vendor-import-template.policy';

const source: ReadingSource = {
  identifierType: 'EMAIL',
  reportShape: 'AGGREGATE',
  template: { columns: USAGE_TEMPLATE_COLUMNS, eventClasses: {} },
  capabilities: { memberList: true, lastActivity: true, eventDetail: false, maxHistoryDays: null },
};

const TODAY = '2026-11-15';
const WINDOW = { from: '2026-09-01', to: '2026-11-14' } as const;

async function csvOf(): Promise<string> {
  const sources = new ImportTemplateContributions();
  sources.add('test', { definitions: () => [USAGE_REPORT_TEMPLATE] });
  const file = await new ImportTemplateService(sources).build('usage-csv', undefined, ['IT_ADMIN']);

  return file.bytes.toString('utf8');
}

const parse = (text: string, declared: { from?: string; to?: string }) =>
  parseReport({
    format: 'CSV',
    text,
    source,
    declared: declared,
    today: TODAY,
    organizationTimeZone: 'Asia/Ho_Chi_Minh',
  });

/**
 * The template of a usage report is read back by the whole reader of the import (columns, identifiers, dates, window), for a source that names the
 * columns the template names (`QĐ-111as`, SPEC S16): no row has a fault and the reading says nothing against the file once the window is declared.
 */
describe('the template of the usage report', () => {
  it('reads back through the whole parser with one row per example line, no fault and no warning, when the window is declared', async () => {
    const report = parse(await csvOf(), WINDOW);

    expect(report.rows.map((row) => row.identifierRaw)).toEqual(USAGE_REPORT_TEMPLATE.sampleRows.map((row) => row[0]));
    expect(report.rows.map((row) => row.errors)).toEqual([[], [], []]);
    expect(report.warnings).toEqual([]);
    expect(report.rows.map((row) => row.days.length)).toEqual([1, 1, 1]);
  });

  it('is refused whole without a declared window, as the note of the template says (WINDOW_REQUIRED)', async () => {
    const text = await csvOf();

    expect(() => parse(text, {})).toThrow(UsageImportFileError);
    expect(() => parse(text, {})).toThrow(/cannot be imported/);
    try {
      parse(text, {});
    } catch (error) {
      expect((error as UsageImportFileError).problem).toBe('WINDOW_REQUIRED');
    }
  });

  it('tells the person, before they upload, that the window of the report must be given', () => {
    const notes = USAGE_REPORT_TEMPLATE.notes.join(' ');

    expect(notes).toContain('khoảng thời gian');
    expect(notes).toContain('366 ngày');
  });

  it('judges a last day of activity after the window as a fault of that row', async () => {
    const text = (await csvOf()).replace('2026-11-10', '2026-11-20');

    const report = parse(text, WINDOW);

    expect(report.rows[0]?.errors.map((error) => error.code)).toEqual(['DATE_AFTER_WINDOW']);
  });
});
