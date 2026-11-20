import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BM10_FIELDS, BM10_HEADERS, BM10_TOTAL } from './bm10-template.fake';
import { EMPLOYEE_IMPORT_COLUMNS, SEAT_BASELINE_COLUMNS, USAGE_REPORT_COLUMNS } from './file-builders';

/**
 * A seed test cannot import the policy of a template (`composition-root-public-door`), so it reads the source of the policy as text: when a column is
 * renamed or the form BM-10 changes its words, this fails before a run of the seed does (SPEC S23 section 5).
 */
const SRC = join(__dirname, '../../../modules');
const sourceOf = (path: string): string => readFileSync(join(SRC, path), 'utf8');
const keysIn = (source: string): string[] => [...source.matchAll(/^\s+key: '([a-z_]+)',?$/gm)].map((match) => match[1]);

describe('the words the seed uses to fill the templates the API hands out', () => {
  it('writes the seat file with the columns of the seat template, in its order', () => {
    expect(keysIn(sourceOf('data-import/seat-baseline-import/seat-baseline-template.policy.ts'))).toEqual([
      ...SEAT_BASELINE_COLUMNS,
    ]);
  });

  it('writes the employee file with the columns of the employee template, in its order', () => {
    expect(keysIn(sourceOf('data-import/employee-import/employee-import-template.policy.ts'))).toEqual([
      ...EMPLOYEE_IMPORT_COLUMNS,
    ]);
  });

  it('writes the usage report with the two columns the usage template names', () => {
    const source = sourceOf('usage/vendor-import/vendor-import-template.policy.ts');

    expect(source).toContain(`identifier: '${USAGE_REPORT_COLUMNS.identifier}'`);
    expect(source).toContain(`lastActivityDate: '${USAGE_REPORT_COLUMNS.lastActivityDate}'`);
  });

  it('keeps the lines, the headers and the total of BM-10 the way the form words them', () => {
    const source = sourceOf('budgets/proposal/budget-proposal-template.policy.ts');

    for (const field of BM10_FIELDS) expect(source).toContain(`'${field}'`);
    for (const header of BM10_HEADERS) {
      expect(source).toContain(`label: '${header}'`);
    }
    expect(source).toContain(`totalLabel: '${BM10_TOTAL}'`);
  });
});
