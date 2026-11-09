import { Prisma } from '../../../generated/prisma/client';
import { JsonColumnShapeError } from '../../../infrastructure/database/json-column.errors';
import { historyAfterJson, historyBeforeJson } from './version-history-snapshot.json';

const fields = { baseMinor: '1,000.00', reserveMinor: null, reason: 'Re-forecast' };
const lines = [
  { position: 1, name: 'Slack', amount: '120.00' },
  { position: 2, name: 'Figma', amount: null },
];

describe('historyBeforeJson (budget_version_history.before)', () => {
  it('reads the fields before an edit, and NULL as an entry that adds lines', () => {
    expect(historyBeforeJson.decode(fields)).toEqual(fields);
    expect(historyBeforeJson.decode(null)).toBeNull();
  });

  it.each([
    ['a list', lines],
    ['a bare string', 'Re-forecast'],
    ['a value that is not JSON', { when: new Date() }],
  ])('refuses %s with the table and the column, and never the value', (_label, value) => {
    expect(() => historyBeforeJson.decode(value)).toThrow(JsonColumnShapeError);
    expect(() => historyBeforeJson.decode(value)).toThrow('budget_version_history.before');
    expect(() => historyBeforeJson.decode(value)).not.toThrow(/Re-forecast|Slack/);
  });

  it('writes the fields as they have always been written; no fields is the database NULL', () => {
    expect(historyBeforeJson.encode(fields)).toEqual({
      baseMinor: '1,000.00',
      reserveMinor: null,
      reason: 'Re-forecast',
    });
    expect(historyBeforeJson.encode(null)).toBe(Prisma.DbNull);
  });
});

describe('historyAfterJson (budget_version_history.after)', () => {
  it('reads the fields after an edit, or the list of lines an entry added', () => {
    expect(historyAfterJson.decode(fields)).toEqual(fields);
    expect(historyAfterJson.decode(lines)).toEqual(lines);
    expect(historyAfterJson.decode([])).toEqual([]);
  });

  it.each([
    ['null', null],
    ['a bare string', 'Re-forecast'],
    ['a number', 7],
  ])('refuses %s with the table and the column, and never the value', (_label, value) => {
    expect(() => historyAfterJson.decode(value)).toThrow(JsonColumnShapeError);
    expect(() => historyAfterJson.decode(value)).toThrow('budget_version_history.after');
    expect(() => historyAfterJson.decode(value)).not.toThrow(/Re-forecast/);
  });

  it('writes the fields or the lines as they have always been written', () => {
    expect(historyAfterJson.encode(fields)).toEqual({
      baseMinor: '1,000.00',
      reserveMinor: null,
      reason: 'Re-forecast',
    });
    expect(historyAfterJson.encode(lines)).toEqual([
      { position: 1, name: 'Slack', amount: '120.00' },
      { position: 2, name: 'Figma', amount: null },
    ]);
  });
});
