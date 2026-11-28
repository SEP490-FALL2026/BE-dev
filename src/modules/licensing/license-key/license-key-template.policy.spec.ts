import { parseCsvRows } from '../../../core/csv';
import { ImportTemplateService } from '../../policies/import-template/import-template.service';
import { ImportTemplateContributions } from '../../policies/public/policies.extension-points';
import { judgeBatch } from './license-key.policy';
import { LICENSE_KEY_TEMPLATE } from './license-key-template.policy';

/** The template of a batch of keys is read back by the judge of the batch: every example line is a key it accepts (`QĐ-111as`). */
describe('the template of the license key batch', () => {
  it('has example keys the batch judge accepts, and a header it refuses instead of keeping as a key (LB3-02)', async () => {
    const sources = new ImportTemplateContributions();
    sources.add('test', { definitions: () => [LICENSE_KEY_TEMPLATE] });
    const file = await new ImportTemplateService(sources).build('license-keys', undefined, ['IT_ADMIN']);

    const lines = parseCsvRows(file.bytes.toString('utf8'), { maxRows: 100 }).map((line) => line.cells[0] ?? '');
    // The front end may send every line of the file, the header included: the header must not be a key the vault would keep.
    const judged = judgeBatch(lines);

    expect(lines[0]).toBe(LICENSE_KEY_TEMPLATE.columns[0]?.key);
    expect(LICENSE_KEY_TEMPLATE.title).toBe('Lô khóa K4');
    expect(judged.errors).toEqual([{ line: 1, code: 'INVALID_FORMAT' }]);
    expect(judged.rows.map((row) => row.key)).toEqual(LICENSE_KEY_TEMPLATE.sampleRows.map((row) => row[0]));
    expect(judged.rows.map((row) => row.key)).not.toContain(lines[0]);
  });
});
