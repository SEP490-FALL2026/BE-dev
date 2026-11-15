import { ImportTemplateService } from '../../policies/import-template/import-template.service';
import { ImportTemplateContributions } from '../../policies/public/policies.extension-points';
import { readSeatFile } from './seat-baseline-file.policy';
import { judgeSeatRows, type SeatFacts } from './seat-baseline-rows.policy';
import { SEAT_BASELINE_TEMPLATE } from './seat-baseline-template.policy';
import { SEAT_COLUMNS } from './seat-baseline-import.types';

const unit = { departmentId: 'department-1', costCenter: { id: 'cc-1', code: 'CC-ENG', status: 'ACTIVE' } };
const person = (id: string, hireDate: string) => ({
  id,
  status: 'ACTIVE',
  employmentType: 'STAFF',
  hireDate,
  owningUnit: unit,
});

const facts: SeatFacts = {
  target: { kind: 'SUBSCRIPTION', purchasedQuantity: 10, ownerDepartmentId: null },
  recordedOn: '2026-11-15',
  employees: new Map([
    ['NV0101', person('e1', '2025-03-01')],
    ['NV0102', person('e2', '2024-09-16')],
  ]),
  companyDomains: ['congty.example'],
  existing: [],
};

async function csvOf() {
  const sources = new ImportTemplateContributions();
  sources.add('test', { definitions: () => [SEAT_BASELINE_TEMPLATE] });

  return new ImportTemplateService(sources).build('seat-baseline', 'csv', ['IT_ADMIN']);
}

/** The template of the seat baseline file is read back by the reader and the judge of the import (`QĐ-111as`). */
describe('the template of the seat baseline file', () => {
  it('reads back with no header ignored and every example row valid', async () => {
    const read = readSeatFile((await csvOf()).bytes);

    expect(read.ignored).toEqual([]);
    expect(read.rows).toHaveLength(SEAT_BASELINE_TEMPLATE.sampleRows.length);
    const judged = judgeSeatRows(read.rows, facts);
    expect(judged.map((row) => row.errors)).toEqual([[], []]);
    expect(judged.map((row) => row.outcome)).toEqual(['VALID', 'VALID']);
  });

  it('has the columns the reader reads, in its order', () => {
    expect(SEAT_BASELINE_TEMPLATE.columns.map((column) => column.key)).toEqual([...SEAT_COLUMNS]);
    expect(SEAT_BASELINE_TEMPLATE.columns.filter((column) => column.required).map((column) => column.key)).toEqual([
      'employee_code',
      'account_identifier',
    ]);
  });
});
