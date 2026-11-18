import { ImportTemplateService } from '../../policies/import-template/import-template.service';
import { ImportTemplateContributions } from '../../policies/public/policies.extension-points';
import { readSeatFile } from './seat-baseline-file.policy';
import { judgeSeatRows, type SeatFacts } from './seat-baseline-rows.policy';
import { SEAT_BASELINE_TEMPLATE } from './seat-baseline-template.policy';
import { SEAT_COLUMNS, SEAT_ROW_ERROR_CODES } from './seat-baseline-import.types';

const unit = { departmentId: 'department-1', costCenter: { id: 'cc-1', code: 'CC-ENG', status: 'ACTIVE' } };
const person = (id: string, hireDate: string) => ({
  id,
  status: 'ACTIVE',
  employmentType: 'STAFF',
  hireDate,
  owningUnit: unit,
});

const facts: SeatFacts = {
  target: { kind: 'SUBSCRIPTION', purchasedQuantity: 10 },
  recordedOn: '2026-11-15',
  employees: new Map([
    ['NV0101', person('e1', '2025-03-01')],
    ['NV0102', person('e2', '2024-09-16')],
  ]),
  companyDomains: ['congty.example'],
  existing: [],
};

async function fileOf(format: 'xlsx' | 'csv' | undefined) {
  const sources = new ImportTemplateContributions();
  sources.add('test', { definitions: () => [SEAT_BASELINE_TEMPLATE] });

  return new ImportTemplateService(sources).build('seat-baseline', format, ['IT_ADMIN']);
}

/** The template of the seat baseline file is read back by the reader and the judge of the import (`QĐ-111as`). */
describe('the template of the seat baseline file', () => {
  it.each(SEAT_BASELINE_TEMPLATE.formats)(
    'reads back as %s, a format the reader reads, with every example row valid',
    async (format) => {
      const read = readSeatFile((await fileOf(format)).bytes);

      expect(read.ignored).toEqual([]);
      expect(read.rows).toHaveLength(SEAT_BASELINE_TEMPLATE.sampleRows.length);
      const judged = judgeSeatRows(read.rows, facts);
      expect(judged.map((row) => row.errors)).toEqual([[], []]);
      expect(judged.map((row) => row.outcome)).toEqual(['VALID', 'VALID']);
    },
  );

  it('is the file in the format the reader reads when the caller names none', async () => {
    const file = await fileOf(undefined);

    expect(file.fileName).toBe('mau-seat-baseline.csv');
    expect(SEAT_BASELINE_TEMPLATE.formats).toEqual(['csv']);
  });

  it('has the columns the reader reads, in its order', () => {
    expect(SEAT_BASELINE_TEMPLATE.columns.map((column) => column.key)).toEqual([...SEAT_COLUMNS]);
    expect(SEAT_BASELINE_TEMPLATE.columns.filter((column) => column.required).map((column) => column.key)).toEqual([
      'employee_code',
      'account_identifier',
    ]);
  });

  it('says on the instruction sheet every code the parser can answer a row with (LB3-04)', () => {
    const said = new Set(SEAT_BASELINE_TEMPLATE.columns.flatMap((column) => column.refusedWith ?? []));

    expect([...SEAT_ROW_ERROR_CODES].filter((code) => !said.has(code))).toEqual([]);
    expect([...said].filter((code) => !(SEAT_ROW_ERROR_CODES as readonly string[]).includes(code))).toEqual([]);
  });
});
