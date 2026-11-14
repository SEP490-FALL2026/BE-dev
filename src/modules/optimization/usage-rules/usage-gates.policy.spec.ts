import type { EvidenceSource } from '../../usage/public/usage-evidence.types';
import { coverageGateOf, endsWithinMonth, seatGateOf, unmatchedGateOf, verdictOfSources } from './usage-gates.policy';

const base = {
  kind: 'PERSONAL' as const,
  isMachineAccount: false,
  today: '2026-09-02',
  handingOver: false,
  onLongLeave: false,
  usableOn: '2026-01-05' as string | null,
  graceDays: 14,
  expectedEndDate: null as string | null,
  exemptUntil: null as string | null,
  liveRevocation: false,
};
const source = (over: Partial<EvidenceSource>): EvidenceSource => ({
  kind: 'VENDOR',
  sourceId: 's1',
  name: 'Figma',
  coverage: { from: '2026-06-01', to: '2026-09-01' },
  windows: [],
  ageDays: 1,
  stale: false,
  strictness: 'STRICT',
  activityDefinition: 'x',
  canConcludeAbsence: true,
  detectableGroups: ['G1', 'G2', 'G3', 'G4'],
  employees: [],
  ...over,
});

describe('gates 2 to 8 in their order (FR-4.9)', () => {
  it('passes a plain seat', () => expect(seatGateOf(base)).toBeNull());

  it.each([
    ['gate 2: a seat flagged as a machine account (QĐ-110m)', { isMachineAccount: true }, 'SERVICE_ACCOUNT'],
    ['gate 2: a service account of the earlier releases', { kind: 'SERVICE' as const }, 'SERVICE_ACCOUNT'],
    ['gate 3: handing over', { handingOver: true }, 'LEAVE_OR_HANDOVER'],
    ['gate 3: on long leave today', { onLongLeave: true }, 'LEAVE_OR_HANDOVER'],
    ['gate 4: the grant waits', { usableOn: null }, 'NOT_USABLE'],
    ['gate 4: usable 10 days ago', { usableOn: '2026-08-23' }, 'NEW_ASSIGNMENT'],
    ['gate 7: exempted to 31/12', { exemptUntil: '2026-12-31' }, 'EXEMPT'],
    ['gate 8: a revocation is under way', { liveRevocation: true }, 'REVOCATION_IN_PROGRESS'],
  ])('%s', (_name, over, gate) => {
    expect(seatGateOf({ ...base, ...over })).toMatchObject({ gate, status: 'EXCLUDED' });
  });

  it('a seat usable exactly the grace days ago is judged; a newer one is left out until then', () => {
    expect(seatGateOf({ ...base, usableOn: '2026-08-19' })).toBeNull();
    expect(seatGateOf({ ...base, usableOn: '2026-08-20' })).toMatchObject({
      gate: 'NEW_ASSIGNMENT',
      detail: { until: '2026-09-03' },
    });
  });

  it('gate 2 comes first, whatever else is true', () => {
    expect(seatGateOf({ ...base, kind: 'SERVICE', handingOver: true, exemptUntil: '2026-12-31' })?.gate).toBe(
      'SERVICE_ACCOUNT',
    );
    expect(
      seatGateOf({ ...base, isMachineAccount: true, handingOver: true, exemptUntil: '2026-12-31', usableOn: null })
        ?.gate,
    ).toBe('SERVICE_ACCOUNT');
  });

  it('says a machine account in the reason of the skip, and leaves the personal seat of the same IT Admin to be judged', () => {
    expect(seatGateOf({ ...base, isMachineAccount: true })).toMatchObject({ detail: { reason: 'machine account' } });
    expect(seatGateOf({ ...base, isMachineAccount: false })).toBeNull();
  });
});

describe('R-J01 and US-10-06 AC-17: a right that ends within a month', () => {
  it.each([
    ['31/12 seen on 15/09', '2026-12-31', '2026-09-15', false],
    ['31/12 seen on 20/12', '2026-12-31', '2026-12-20', true],
    ['01/01 seen on 01/12: exactly a month', '2027-01-01', '2026-12-01', true],
    ['no end date', null, '2026-12-01', false],
  ])('%s', (_name, end, today, expected) => {
    expect(endsWithinMonth(end, today)).toBe(expected);
    expect(seatGateOf({ ...base, today, expectedEndDate: end })?.gate === 'TIME_BOUND_ENDING').toBe(expected);
  });
});

describe('what the sources of an application allow (US-10-03 AC-3, QĐ-101b, FR-4.14a)', () => {
  it('no source is NO_DATA', () => expect(verdictOfSources([])).toEqual({ kind: 'NO_DATA' }));

  it('a fresh vendor that tells the negative is usable', () => {
    expect(verdictOfSources([source({})]).kind).toBe('USABLE');
  });

  it('every vendor stale is STALE, even with a fresh collector', () => {
    const collector = source({ kind: 'COLLECTOR', sourceId: null, canConcludeAbsence: false, stale: false });

    expect(verdictOfSources([source({ stale: true, ageDays: 9 }), collector]).kind).toBe('STALE');
  });

  it.each([
    ['only a member list', source({ canConcludeAbsence: false, detectableGroups: ['G1', 'G2'] })],
    ['positive only', source({ canConcludeAbsence: false })],
    ['only the collector', source({ kind: 'COLLECTOR', sourceId: null, canConcludeAbsence: false })],
  ])('%s is insufficient, with a reason', (_name, one) => {
    const verdict = verdictOfSources([one]);

    expect(verdict.kind).toBe('INSUFFICIENT');
    expect('reason' in verdict && verdict.reason.length > 0).toBe(true);
  });
});

describe('INV-12, TC-2: an identity that cannot be told', () => {
  const open = { status: 'OPEN' as const, lastActivityDate: null, candidateEmployeeIds: [] as string[] };

  it('a holder not seen while an identifier is tied to no one is not concluded on; with none they never appeared', () => {
    expect(unmatchedGateOf({ employeeId: 'e2', appeared: false, unmatched: [open] })).toMatchObject({
      gate: 'UNMATCHED_IDENTITY',
      status: 'UNMATCHED_IDENTITY',
    });
    expect(unmatchedGateOf({ employeeId: 'e2', appeared: false, unmatched: [] })).toBeNull();
  });

  it('a candidate of an open ambiguous identifier is not concluded on even when seen', () => {
    expect(
      unmatchedGateOf({
        employeeId: 'e6',
        appeared: true,
        unmatched: [{ ...open, candidateEmployeeIds: ['e6', 'e9'] }],
      })?.gate,
    ).toBe('UNMATCHED_IDENTITY');
    expect(unmatchedGateOf({ employeeId: 'e6', appeared: true, unmatched: [open] })).toBeNull();
  });
});

describe('gate 5: coverage', () => {
  it('covered for fewer days than the review threshold is left out, with the days', () => {
    expect(coverageGateOf(48, 60)).toMatchObject({
      gate: 'COVERAGE',
      status: 'INSUFFICIENT_EVIDENCE',
      detail: { coverageDays: 48, requiredDays: 60 },
    });
    expect(coverageGateOf(78, 60)).toBeNull();
  });
});
