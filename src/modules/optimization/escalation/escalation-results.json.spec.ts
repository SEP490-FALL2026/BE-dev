import { JsonColumnShapeError } from '../../../infrastructure/database/json-column.errors';
import { escalationResultsJson } from './escalation-results.json';
import type { EscalationItemResult } from './escalation.types';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';

describe('escalation results codec', () => {
  it('writes and reads the pushed and the skipped, in order', () => {
    const results: EscalationItemResult[] = [
      { recommendationId: ID, outcome: 'ESCALATED', state: 'AWAITING_DECISION', departmentId: ID },
      { recommendationId: ID, outcome: 'SKIPPED', reason: 'MACHINE_ACCOUNT' },
    ];

    expect(escalationResultsJson.decode(escalationResultsJson.encode(results))).toEqual(results);
    expect(escalationResultsJson.decode([])).toEqual([]);
  });

  it('refuses a reason it does not know, a state a push cannot end in, and a key it does not know', () => {
    expect(() =>
      escalationResultsJson.decode([{ recommendationId: ID, outcome: 'SKIPPED', reason: 'BECAUSE' }]),
    ).toThrow(JsonColumnShapeError);
    expect(() =>
      escalationResultsJson.decode([
        { recommendationId: ID, outcome: 'ESCALATED', state: 'RECLAIM_DECIDED', departmentId: ID },
      ]),
    ).toThrow(JsonColumnShapeError);
    expect(() =>
      escalationResultsJson.decode([{ recommendationId: ID, outcome: 'SKIPPED', reason: 'NOT_FOUND', extra: 1 }]),
    ).toThrow(JsonColumnShapeError);
  });
});
