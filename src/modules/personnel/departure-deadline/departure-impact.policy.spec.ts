import { addDays } from '../../../core/business-date';
import {
  commitmentToRelease,
  impactWindowEnd,
  revocationDueOn,
  rightToRevokeOf,
  type SeatFacts,
} from './departure-impact.policy';

const NONE: ReadonlySet<string> = new Set();

describe('the day the IT Admin has until to take every right away (QĐ-110c, T-MF2)', () => {
  it.each([
    [
      'planned: last day Wednesday 30/09, the first working day after is Thursday 01/10',
      '2026-09-30',
      1,
      NONE,
      '2026-10-01',
    ],
    ['blocked now on Thursday 12/11: last day 12/11, due Friday 13/11', '2026-11-12', 1, NONE, '2026-11-13'],
    ['last day on a Friday: the weekend does not count, due Monday', '2026-11-13', 1, NONE, '2026-11-16'],
    ['two working days: Wednesday 30/09 gives Friday 02/10', '2026-09-30', 2, NONE, '2026-10-02'],
    ['two working days over a weekend: Thursday 12/11 gives Monday 16/11', '2026-11-12', 2, NONE, '2026-11-16'],
    ['a day off right after the last day is skipped', '2026-09-30', 1, new Set(['2026-10-01']), '2026-10-02'],
  ])('%s', (_name, lastWorkingDay, days, nonWorking, expected) => {
    expect(revocationDueOn(lastWorkingDay, days, nonWorking)).toBe(expected);
  });

  it('asks for a window of days off that holds the working days of the deadline', () => {
    expect(impactWindowEnd('2026-11-12')).toBe(addDays('2026-11-13', 90));
  });
});

describe('what goes back to the budget', () => {
  it('adds what is held by currency, in the order of the currency code, as strings, and leaves out what holds nothing', () => {
    expect(
      commitmentToRelease([
        { requestId: 'a', currency: 'VND', heldMinor: 5_000_000n },
        { requestId: 'b', currency: 'USD', heldMinor: 12_345n },
        { requestId: 'c', currency: 'VND', heldMinor: 2_500_000n },
        { requestId: 'd', currency: 'EUR', heldMinor: 0n },
      ]),
    ).toEqual([
      { currency: 'USD', amountMinor: '12345' },
      { currency: 'VND', amountMinor: '7500000' },
    ]);
  });

  it('is empty when nothing is held', () => {
    expect(commitmentToRelease([])).toEqual([]);
  });
});

describe('a seat the departure would take away', () => {
  const seat = (extra: Partial<SeatFacts> = {}): SeatFacts => ({
    assignmentId: 'asg-1',
    planId: 'plan-1',
    planName: 'Team',
    applicationId: 'app-1',
    applicationName: 'Figma',
    provisioningType: 'K2',
    revocationNote: null,
    dataLossOnRemoval: false,
    revocation: null,
    ...extra,
  });

  it('says what the seat is, how it is taken away and whether a task already works on it', () => {
    expect(rightToRevokeOf(seat({ dataLossOnRemoval: true, revocationNote: 'Export first' }))).toEqual({
      assignmentId: 'asg-1',
      application: { id: 'app-1', name: 'Figma' },
      plan: { id: 'plan-1', name: 'Team' },
      provisioningType: 'K2',
      revocable: true,
      dataLossOnRemoval: true,
      revocationNote: 'Export first',
      revocationUnderWay: false,
    });
    expect(rightToRevokeOf(seat({ revocation: { taskId: 't', status: 'QUEUED', source: 'DEPARTURE' } }))).toMatchObject(
      { revocationUnderWay: true },
    );
  });

  it.each([
    ['K1', true],
    ['K2', true],
    ['K4', true],
    ['K5', true],
    ['K3', false],
  ])('a seat of kind %s is revocable: %s', (provisioningType, revocable) => {
    expect(rightToRevokeOf(seat({ provisioningType })).revocable).toBe(revocable);
  });
});
