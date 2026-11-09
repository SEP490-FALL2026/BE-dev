import { ghostSeatEvidenceJson } from '../ghost-seat/ghost-seat-evidence.json';
import { thresholdsOf } from './usage-assessment.policy';
import { snapshotOf } from './usage-evidence-snapshot.policy';

describe('the evidence of a G3/G4 (TC-3, FR-4.14, QĐ-101i)', () => {
  const source = {
    kind: 'VENDOR' as const,
    sourceId: '2f8c2b6c-7a64-4a35-9d0b-0f3f6f2f6a10',
    name: 'Figma',
    coverage: { from: '2026-06-01', to: '2026-09-01' },
    windows: [{ from: '2026-06-01', to: '2026-09-01' }],
    ageDays: 1,
    stale: false,
    strictness: 'STRICT' as const,
    activityDefinition: 'open a file',
    canConcludeAbsence: true,
    detectableGroups: ['G3', 'G4'] as Array<'G3' | 'G4'>,
    // The rows carry days only; the snapshot must never copy them.
    employees: [
      {
        employeeId: 'x',
        activeDates: ['2026-06-01'],
        appeared: true,
        lastAuthOnlyDate: null,
        weakestMethod: null,
        mappingChangedOn: null,
      },
    ],
  };

  it('is complete, passes the codec, and carries no volume, session, token or event row', () => {
    const evidence = snapshotOf({
      group: 'G4',
      employeeId: '2f8c2b6c-7a64-4a35-9d0b-0f3f6f2f6a11',
      planId: '8d9b1f6e-4a52-4c8e-8f43-6c0d7b9d4f20',
      sources: [
        source,
        { ...source, kind: 'COLLECTOR', sourceId: null, name: 'collector', strictness: null, activityDefinition: null },
      ],
      matchMethod: 'EXACT_EMAIL',
      assessment: {
        status: 'INACTIVE',
        lastActiveDate: '2026-06-28',
        inactiveDays: 65,
        coverageDays: 91,
        tier: 'REVIEW',
      },
      thresholds: thresholdsOf(null, null),
      confidence: { level: 'MEDIUM', reasons: ['x'] },
      expectedEndDate: null,
      potentialSaving: null,
      previousDecision: null,
    });

    expect(ghostSeatEvidenceJson.decode(ghostSeatEvidenceJson.encode(evidence))).toEqual(evidence);
    expect(evidence.labels).toEqual(['P-05']);
    expect(JSON.stringify(evidence)).not.toMatch(/tokens|sessions|events|volume|responses|employees|activeDates/);
  });
});
