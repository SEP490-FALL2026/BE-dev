import { JsonColumnShapeError } from '../../../infrastructure/database/json-column.errors';
import { renewalDecisionSnapshotJson } from './subscription-renewal-decision-snapshot.json';
import type { DecisionSnapshot } from './subscription-renewal.types';

const connected: DecisionSnapshot = {
  source: 'CONNECTED',
  financial: {
    status: 'BUDGET',
    costCenterId: 'cc-1',
    fiscalYear: 2027,
    currency: 'VND',
    budget: '120000000',
    spent: '30000000',
    committed: '10000000',
    remaining: '80000000',
    pendingRequests: null,
    periodEffectiveCost: '24000000',
    periodDeductibleTax: '2400000',
    asOf: '2026-10-23',
  },
};

describe('renewalDecisionSnapshotJson (subscription_renewals.decision_snapshot)', () => {
  it('reads what a decision froze as the domain type, for both kinds of snapshot', () => {
    expect(renewalDecisionSnapshotJson.decode(connected)).toEqual(connected);
    expect(renewalDecisionSnapshotJson.decode({ source: 'NOT_CONNECTED', takenAt: '2026-10-23' })).toEqual({
      source: 'NOT_CONNECTED',
      takenAt: '2026-10-23',
    });
  });

  it.each([
    ['a source that is neither connected nor not connected', { source: 'GUESSED', takenAt: '2026-10-23' }],
    ['a connected snapshot with no figures', { source: 'CONNECTED' }],
    [
      'a status the budget never reports',
      { source: 'CONNECTED', financial: { ...(connected as { financial: object }).financial, status: 'FREE' } },
    ],
    [
      'a figure that is a number, not the decimal string',
      { source: 'CONNECTED', financial: { ...(connected as { financial: object }).financial, budget: 120000000 } },
    ],
    ['no snapshot at all, under a decision', null],
  ])('refuses %s with the table and the column, and never the value', (_label, value) => {
    expect(() => renewalDecisionSnapshotJson.decode(value)).toThrow(JsonColumnShapeError);
    expect(() => renewalDecisionSnapshotJson.decode(value)).toThrow('subscription_renewals.decision_snapshot');
    expect(() => renewalDecisionSnapshotJson.decode(value)).not.toThrow(/GUESSED|120000000/);
  });

  it('writes the snapshot as it has always been written', () => {
    expect(renewalDecisionSnapshotJson.encode(connected)).toEqual(connected);
    expect(renewalDecisionSnapshotJson.encode({ source: 'NOT_CONNECTED', takenAt: '2026-10-23' })).toEqual({
      source: 'NOT_CONNECTED',
      takenAt: '2026-10-23',
    });
  });
});
