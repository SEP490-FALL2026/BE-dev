import { parseCsvRows } from '../../../core/csv';
import { ImportTemplateService } from '../../policies/import-template/import-template.service';
import { ImportTemplateContributions } from '../../policies/public/policies.extension-points';
import { judgeBatch } from './license-key.policy';
import { LICENSE_KEY_TEMPLATE } from './license-key-template.policy';

/** The template of a batch of keys is read back by the judge of the batch: every example line is a key it accepts (`QĐ-111as`). */
describe('the template of the license key batch', () => {
  it('has keys the batch judge accepts, none repeated', async () => {
    const sources = new ImportTemplateContributions();
    sources.add('test', { definitions: () => [LICENSE_KEY_TEMPLATE] });
    const file = await new ImportTemplateService(sources).build('license-keys', undefined, ['IT_ADMIN']);

    const [header, ...lines] = parseCsvRows(file.bytes.toString('utf8'), { maxRows: 100 });
    const judged = judgeBatch(lines.map((line) => line.cells[0] ?? ''));

    expect(header?.cells).toEqual(['license_key']);
    expect(judged.errors).toEqual([]);
    expect(judged.rows).toHaveLength(LICENSE_KEY_TEMPLATE.sampleRows.length);
  });
});
