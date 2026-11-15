import { ImportTemplateService } from '../../policies/import-template/import-template.service';
import { ImportTemplateContributions } from '../../policies/public/policies.extension-points';
import { readCsvReport } from './parse/csv-report.policy';
import type { ReadingSource } from './parse/vendor-import-parse.types';
import { USAGE_REPORT_TEMPLATE, USAGE_TEMPLATE_COLUMNS } from './vendor-import-template.policy';

const source: ReadingSource = {
  identifierType: 'EMAIL',
  reportShape: 'AGGREGATE',
  template: { columns: USAGE_TEMPLATE_COLUMNS, eventClasses: {} },
  capabilities: { memberList: true, lastActivity: true, eventDetail: false, maxHistoryDays: null },
};

/** The template of a usage report is read back by the reader of the import for a source that names the columns the template names (`QĐ-111as`). */
describe('the template of the usage report', () => {
  it('reads back with one row per example line, each with its identifier and last day of activity', async () => {
    const sources = new ImportTemplateContributions();
    sources.add('test', { definitions: () => [USAGE_REPORT_TEMPLATE] });
    const file = await new ImportTemplateService(sources).build('usage-csv', undefined, ['IT_ADMIN']);

    const report = readCsvReport(file.bytes.toString('utf8'), source);

    expect(report.rows.map((row) => [row.identifier, row.lastActivityDate])).toEqual(USAGE_REPORT_TEMPLATE.sampleRows);
  });
});
