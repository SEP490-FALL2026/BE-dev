import type { AssignmentRecord } from '../public/licensing.types';
import {
  carriedPast,
  effectiveFromLabel,
  nextPeriodStart,
  replacedByGrant,
  revocationOf,
  seatsToCarry,
  toAssignmentView,
  usableDayOf,
} from './assignment.policy';

const bot: AssignmentRecord = {
  id: 'a1',
  source: 'BASELINE',
  kind: 'SERVICE',
  planId: 'p1',
  subscriptionId: 's1',
  employeeId: 'e2',
  accountIdentifier: 'ci-bot',
  reason: 'CI pipeline',
  costCenterId: 'cc-des',
  owningDepartmentId: 'd-des',
  effectiveFrom: '2026-10-01',
  effectiveFromBasis: 'ACTUAL',
  validUntil: null,
  expectedEndDate: null,
  predecessorId: null,
  isMachineAccount: false,
  machineAccountNote: null,
  failedAt: null,
  cancelledAt: null,
  createdAt: new Date('2026-10-01T00:00:00.000Z'),
};

describe('effectiveFromLabel (AC-8, QĐ-43b: a recorded start is never shown as a grant date)', () => {
  it('says the real grant date is not known when the start is only the day of recording', () => {
    expect(effectiveFromLabel('RECORDED', '2026-10-01')).toBe('ghi nhận từ 01/10/2026 — ngày cấp thật chưa biết');
  });

  it('says nothing when the grant date is the real one', () => {
    expect(effectiveFromLabel('ACTUAL', '2025-03-15')).toBeNull();
  });
});

describe('toAssignmentView', () => {
  it('shows a real start as the grant date', () => {
    expect(toAssignmentView({ ...bot, effectiveFrom: '2025-03-15', effectiveFromBasis: 'ACTUAL' })).toMatchObject({
      effectiveFrom: '2025-03-15',
      grantedOn: '2025-03-15',
      effectiveFromLabel: null,
    });
  });

  it('shows no grant date and the label for a start that is only the day of recording', () => {
    expect(toAssignmentView({ ...bot, effectiveFrom: '2026-10-01', effectiveFromBasis: 'RECORDED' })).toMatchObject({
      effectiveFrom: '2026-10-01',
      effectiveFromBasis: 'RECORDED',
      grantedOn: null,
      effectiveFromLabel: 'ghi nhận từ 01/10/2026 — ngày cấp thật chưa biết',
    });
  });
});

describe('usableDayOf — M5-01 (FR-4.9 gate 4, QĐ-77n)', () => {
  const day = (instant: Date) => instant.toISOString().slice(0, 10);

  it('is null while a grant task of the first link is still open: the invitation waits', () => {
    expect(usableDayOf('2026-06-01', [{ status: 'QUEUED', completedAt: null }], day)).toBeNull();
    expect(usableDayOf('2026-06-01', [{ status: 'IN_PROGRESS', completedAt: null }], day)).toBeNull();
    expect(usableDayOf('2026-06-01', [{ status: 'FAILED', completedAt: null }], day)).toBeNull();
  });

  it('is the day the grant was completed when it is after valid_from', () => {
    expect(
      usableDayOf('2026-06-01', [{ status: 'COMPLETED', completedAt: new Date('2026-06-20T03:00:00Z') }], day),
    ).toBe('2026-06-20');
  });

  it('is valid_from when no grant task was made (a recorded or baseline seat) or the grant was done before it', () => {
    expect(usableDayOf('2026-06-01', [], day)).toBe('2026-06-01');
    expect(
      usableDayOf('2026-06-01', [{ status: 'COMPLETED', completedAt: new Date('2026-05-20T03:00:00Z') }], day),
    ).toBe('2026-06-01');
  });
});

describe('the right a grant replaces on the same subscription (R-49, QĐ-110q)', () => {
  const old: AssignmentRecord = { ...bot, id: 'old', kind: 'PERSONAL', employeeId: 'e1', effectiveFrom: '2026-10-01' };
  const grant = (over: Partial<Parameters<typeof replacedByGrant>[1]> = {}) => ({
    employeeId: 'e1',
    target: { planId: 'p1', subscriptionId: 's1' },
    today: '2026-11-18',
    revocationUnderWay: false,
    ...over,
  });

  it('is ended by the grant of the same person on the same subscription, the day of the grant', () => {
    expect(replacedByGrant(old, grant())).toBe(true);
  });

  it('is the same seat target for an internal plan with no subscription: the plan is the target', () => {
    expect(
      replacedByGrant({ ...old, subscriptionId: null }, grant({ target: { planId: 'p1', subscriptionId: null } })),
    ).toBe(true);
    expect(
      replacedByGrant({ ...old, subscriptionId: null }, grant({ target: { planId: 'p2', subscriptionId: null } })),
    ).toBe(false);
  });

  it.each([
    [
      'another subscription of the plan (no overlap to settle: the grace ends it)',
      { target: { planId: 'p1', subscriptionId: 's2' } },
    ],
    ['another person', { employeeId: 'e9' }],
    ['a revocation under way: it takes the right away itself', { revocationUnderWay: true }],
  ])('is not touched for %s', (_name, over) => {
    expect(replacedByGrant(old, grant(over))).toBe(false);
  });

  it.each([
    ['a service account', { kind: 'SERVICE' as const }],
    ['a seat used for a machine account', { isMachineAccount: true }],
    ['a right that ended', { validUntil: '2026-11-17' }],
    ['a grant that failed', { failedAt: new Date('2026-10-02T00:00:00.000Z') }],
    ['a grant that was cancelled', { cancelledAt: new Date('2026-10-02T00:00:00.000Z') }],
    ['a right that begins the day of the grant: it would end the day it begins', { effectiveFrom: '2026-11-18' }],
    ['a right that begins after the day of the grant', { effectiveFrom: '2026-11-19' }],
  ])('is not touched when it is %s', (_name, over) => {
    expect(replacedByGrant({ ...old, ...over }, grant())).toBe(false);
  });
});

describe('revocationOf (QĐ-111p: the revocation a seat has, from the task that is open for it)', () => {
  const task = { id: 't1', status: 'QUEUED' as const, notBefore: null };

  it('names the task and its state, and is claimable at once when no reason asks for a day not before', () => {
    expect(revocationOf(task, '2026-11-15')).toEqual({ taskId: 't1', status: 'QUEUED', claimableNow: true });
  });

  it('is not claimable while the day not before is still ahead, and is on that day', () => {
    expect(revocationOf({ ...task, notBefore: '2026-11-20' }, '2026-11-19').claimableNow).toBe(false);
    expect(revocationOf({ ...task, notBefore: '2026-11-20' }, '2026-11-20').claimableNow).toBe(true);
    expect(revocationOf({ ...task, notBefore: '2026-11-20' }, '2026-11-25').claimableNow).toBe(true);
  });

  it('carries the state of a task that is being worked or has failed', () => {
    expect(revocationOf({ ...task, status: 'IN_PROGRESS' }, '2026-11-15').status).toBe('IN_PROGRESS');
    expect(revocationOf({ ...task, status: 'FAILED' }, '2026-11-15').status).toBe('FAILED');
  });
});

describe('the seats carried to the new period (QĐ-35c, US-11-03 AC-2)', () => {
  const seat = (id: string, extra: object) => ({
    assignmentId: id,
    validFrom: '2026-01-05',
    validUntil: null as string | null,
    expectedEndDate: null as string | null,
    ...extra,
  });

  it('are those held on its first day', () => {
    const carried = seatsToCarry(
      [
        seat('open', {}),
        seat('ends-before', { validUntil: '2026-12-15' }),
        seat('ends-later', { validUntil: '2027-02-01' }),
        seat('expected-before', { expectedEndDate: '2026-12-31' }),
        seat('expected-on', { expectedEndDate: '2027-01-01' }),
        seat('starts-on', { validFrom: '2027-01-01' }),
      ],
      '2027-01-01',
    );

    expect(carried.map((s) => s.assignmentId)).toEqual(['open', 'ends-later', 'expected-on']);
  });
});

describe('the next period a seat granted today goes on into (FX2-R1, QĐ-35c)', () => {
  it('is an active period recorded ahead of its start', () => {
    expect(nextPeriodStart({ status: 'ACTIVE', startDate: '2027-01-01' }, '2026-11-15')).toBe('2027-01-01');
  });

  it('is none when it has begun, begins today, is a draft, has no start, or there is no next period', () => {
    expect(nextPeriodStart({ status: 'ACTIVE', startDate: '2026-11-15' }, '2026-11-15')).toBeNull();
    expect(nextPeriodStart({ status: 'ACTIVE', startDate: '2026-11-01' }, '2026-11-15')).toBeNull();
    expect(nextPeriodStart({ status: 'DRAFT', startDate: '2027-01-01' }, '2026-11-15')).toBeNull();
    expect(nextPeriodStart({ status: 'ACTIVE', startDate: null }, '2026-11-15')).toBeNull();
    expect(nextPeriodStart(undefined, '2026-11-15')).toBeNull();
  });
});

describe('the seats that go on into the new period when the renewal day ends some (R2-2, QĐ-106i(2))', () => {
  const seat = (id: string, validUntil: string | null, expectedEndDate: string | null) => ({
    id,
    validFrom: '2026-01-05',
    validUntil,
    expectedEndDate,
  });

  it('leaves on the old period a seat whose last day is the renewal day or before, and carries the others', () => {
    const seats = [
      seat('open', null, null),
      seat('ends-on-renewal-expected', null, '2026-12-31'),
      seat('ends-on-renewal-until', '2027-01-01', null),
      seat('ends-after', null, '2027-01-01'),
      seat('until-after', '2027-01-03', null),
      seat('expected-before', null, '2026-12-30'),
    ];

    expect(carriedPast(seats, '2026-12-31').map((s) => s.id)).toEqual(['open', 'ends-after', 'until-after']);
  });

  it('counts the earlier of the day before the end of the right and the expected end', () => {
    expect(carriedPast([seat('both', '2027-01-10', '2026-12-31')], '2026-12-31')).toEqual([]);
    expect(carriedPast([seat('both', '2027-01-01', '2027-02-01')], '2026-12-31')).toEqual([]);
    expect(carriedPast([seat('both', '2027-01-02', '2027-02-01')], '2026-12-31')).toHaveLength(1);
  });
});
