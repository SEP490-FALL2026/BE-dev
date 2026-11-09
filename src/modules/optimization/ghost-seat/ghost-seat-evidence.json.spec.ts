import { JsonColumnShapeError } from '../../../infrastructure/database/json-column.errors';
import { ghostSeatEvidenceJson } from './ghost-seat-evidence.json';

const EMPLOYEE = '2f8c2b6c-7a64-4a35-9d0b-0f3f6f2f6a10';
const PLAN = '8d9b1f6e-4a52-4c8e-8f43-6c0d7b9d4f20';

describe('ghost seat evidence codec', () => {
  it('writes and reads a G1 evidence with the same shape', () => {
    const evidence = {
      group: 'G1',
      purchased: 100,
      occupied: 88,
      free: 12,
      asOf: '2026-11-09',
      action: 'REGRANT_OR_REDUCE',
    } as const;

    expect(ghostSeatEvidenceJson.encode(evidence)).toEqual(evidence);
    expect(ghostSeatEvidenceJson.decode(evidence)).toEqual(evidence);
  });

  it('reads a G2 evidence with and without the end of a K1 access', () => {
    const base = {
      group: 'G2',
      employeeId: EMPLOYEE,
      leftOn: null,
      planId: PLAN,
      provisioningType: 'K1',
      terminatingAccess: null,
    } as const;

    expect(ghostSeatEvidenceJson.decode(base)).toEqual(base);
    expect(ghostSeatEvidenceJson.decode({ ...base, terminatingAccess: { until: '2026-11-30' } })).toEqual({
      ...base,
      terminatingAccess: { until: '2026-11-30' },
    });
  });

  it('reads the evidence of a G3 or a G4 with every field, and refuses one that lacks a field (TC-3)', () => {
    const evidence = {
      group: 'G4',
      employeeId: EMPLOYEE,
      planId: PLAN,
      sources: [],
      matchMethod: null,
      activityStatus: 'INACTIVE',
      lastActiveDate: '2026-06-28',
      inactiveDays: 65,
      coverageDays: 91,
      thresholds: { values: { monitor: 30, review: 60, action: 90 }, origin: 'DEFAULT' },
      confidence: { level: 'HIGH', reasons: [] },
      labels: [],
      timeBound: null,
      potentialSaving: null,
    } as const;

    expect(ghostSeatEvidenceJson.decode(evidence)).toEqual(evidence);
    expect(() => ghostSeatEvidenceJson.decode({ group: 'G4', lastUsedOn: '2026-08-01' })).toThrow(JsonColumnShapeError);
  });

  it('refuses a shape of another group, an unknown key and a missing group, naming the column and no value', () => {
    expect(() => ghostSeatEvidenceJson.decode({ group: 'G1', employeeId: EMPLOYEE })).toThrow(JsonColumnShapeError);
    expect(() => ghostSeatEvidenceJson.decode({ purchased: 1 })).toThrow(JsonColumnShapeError);
    expect(() =>
      ghostSeatEvidenceJson.decode({
        group: 'G2',
        employeeId: EMPLOYEE,
        leftOn: null,
        planId: PLAN,
        provisioningType: 'K2',
        extra: 1,
      }),
    ).toThrow(JsonColumnShapeError);
    expect(() => ghostSeatEvidenceJson.decode({ group: 'G1', purchased: 1, occupied: 1, free: -1 })).toThrow(
      /ghost_seat_recommendations/,
    );
  });
});
