import { occupies, peakOccupancy, type SeatPeriod } from './seat-occupancy.policy';

const open = (from: string): SeatPeriod => ({ from, until: null });
const closed = (from: string, until: string): SeatPeriod => ({ from, until });

describe('occupies (a half-open period: the first day counts, the day it ends does not)', () => {
  it('counts the start day and the days after it for an open period', () => {
    expect(occupies(open('2026-10-01'), '2026-09-30')).toBe(false);
    expect(occupies(open('2026-10-01'), '2026-10-01')).toBe(true);
    expect(occupies(open('2027-10-01'), '2027-12-31')).toBe(true);
  });

  it('stops counting on the day the period ends', () => {
    const period = closed('2026-10-01', '2026-10-15');

    expect(occupies(period, '2026-10-14')).toBe(true);
    expect(occupies(period, '2026-10-15')).toBe(false);
  });
});

describe('peakOccupancy (INV-01: the most seats taken on any day of a period)', () => {
  it('is the count on the first day when nothing else starts inside the period', () => {
    const all = [open('2026-01-01'), open('2026-02-01'), open('2026-10-01')];

    expect(peakOccupancy(all, open('2026-10-01'))).toBe(3);
  });

  it('counts a seat that starts later inside the period: the count can only rise on a day a seat starts', () => {
    const all = [open('2026-10-01'), open('2026-11-01')];

    expect(peakOccupancy(all, open('2026-10-01'))).toBe(2);
    expect(peakOccupancy(all, closed('2026-10-01', '2026-11-01'))).toBe(1);
  });

  it('does not count a seat that has ended or that has not started', () => {
    const all = [closed('2026-01-01', '2026-02-01'), open('2026-10-01'), open('2027-01-01')];

    expect(peakOccupancy(all, closed('2026-10-01', '2026-12-01'))).toBe(1);
    expect(peakOccupancy(all, open('2026-10-01'))).toBe(2);
  });

  it('keeps the count constant across a handover: the old seat ends the day the new one begins', () => {
    const all = [
      closed('2026-10-01', '2026-10-15'),
      open('2026-10-15'),
      ...Array.from({ length: 7 }, () => open('2026-09-01')),
    ];

    expect(peakOccupancy(all, open('2026-10-01'))).toBe(8);
    expect(peakOccupancy(all, open('2026-10-15'))).toBe(8);
  });

  it('is zero for no periods', () => {
    expect(peakOccupancy([], open('2026-10-01'))).toBe(0);
  });
});
