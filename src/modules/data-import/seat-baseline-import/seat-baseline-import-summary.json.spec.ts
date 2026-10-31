import { JsonColumnShapeError } from '../../../infrastructure/database/json-column.errors';
import { seatBaselineImportSummaryJson } from './seat-baseline-import-summary.json';
import type { SeatImportSummary } from './seat-baseline-import.types';

const summary: SeatImportSummary = {
  target: {
    kind: 'SUBSCRIPTION',
    subscriptionId: '0b7a1f5e-0000-4000-8000-000000000001',
    planId: '0b7a1f5e-0000-4000-8000-000000000002',
    planName: 'Team',
    applicationName: 'Slack',
    provisioningType: 'MANUAL',
  },
  totalRows: 10,
  valid: 8,
  errors: 2,
  byCode: { OVERLAP: 1, EMPLOYEE_NOT_FOUND: 1 },
  seats: { purchased: 20, occupiedBefore: 5, freeBefore: 15, freeAfter: 7 },
  recordedOn: '2026-10-31',
};

describe('seatBaselineImportSummaryJson (seat_baseline_imports.summary)', () => {
  it('reads the summary of a preview as the domain type, for a subscription and for an internal plan with no seats bought', () => {
    expect(seatBaselineImportSummaryJson.decode(JSON.parse(JSON.stringify(summary)))).toEqual(summary);
    const internal = { ...summary, target: { ...summary.target, kind: 'PLAN', subscriptionId: null }, seats: null };

    expect(seatBaselineImportSummaryJson.decode(internal)).toEqual(internal);
  });

  it.each([
    ['a missing field', { ...summary, recordedOn: undefined }],
    ['a count that is text', { ...summary, valid: '8' }],
    ['a target of a kind that does not exist', { ...summary, target: { ...summary.target, kind: 'TEAM' } }],
    ['a date that is not a date', { ...summary, recordedOn: '2026-02-31' }],
    ['seats with a missing figure', { ...summary, seats: { purchased: 20 } }],
    ['null', null],
  ])('refuses %s with the table and the column, and never the value', (_label, value) => {
    expect(() => seatBaselineImportSummaryJson.decode(value)).toThrow(JsonColumnShapeError);
    expect(() => seatBaselineImportSummaryJson.decode(value)).toThrow('seat_baseline_imports.summary');
    expect(() => seatBaselineImportSummaryJson.decode(value)).not.toThrow(/Slack|2026-02-31/);
  });

  it('writes the summary as it has always been written: the object itself, key for key', () => {
    expect(seatBaselineImportSummaryJson.encode(summary)).toEqual({
      target: {
        kind: 'SUBSCRIPTION',
        subscriptionId: '0b7a1f5e-0000-4000-8000-000000000001',
        planId: '0b7a1f5e-0000-4000-8000-000000000002',
        planName: 'Team',
        applicationName: 'Slack',
        provisioningType: 'MANUAL',
      },
      totalRows: 10,
      valid: 8,
      errors: 2,
      byCode: { OVERLAP: 1, EMPLOYEE_NOT_FOUND: 1 },
      seats: { purchased: 20, occupiedBefore: 5, freeBefore: 15, freeAfter: 7 },
      recordedOn: '2026-10-31',
    });
  });
});
