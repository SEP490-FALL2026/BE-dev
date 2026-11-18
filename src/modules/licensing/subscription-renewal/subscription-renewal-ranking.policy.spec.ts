import { heldOn, rankSeats, type RankInput } from './subscription-renewal-ranking.policy';
import type { HeldSeat } from './subscription-renewal.types';

const seat = (id: string, validFrom: string, extra: Partial<HeldSeat> = {}): HeldSeat => ({
  assignmentId: id,
  employeeId: `E-${id}`,
  kind: 'PERSONAL',
  validFrom,
  validUntil: null,
  expectedEndDate: null,
  liveRevocationSources: [],
  hasOpenTask: false,
  ...extra,
});
const input = (s: HeldSeat, extra: Partial<RankInput> = {}): RankInput => ({
  seat: s,
  holderLeft: false,
  usage: null,
  ...extra,
});

describe('the ranking of the seats a reduction is chosen from (QĐ-66x, US-11-02 AC-20)', () => {
  it('puts a decided revocation first, then a holder who left, then a flagged seat, then the oldest activity', () => {
    const ranked = rankSeats([
      input(seat('s6', '2026-01-01'), { usage: { lastActivityOn: '2026-06-01', flagged: false } }),
      input(seat('s5', '2026-01-01'), { usage: { lastActivityOn: '2026-03-01', flagged: false } }),
      input(seat('s3', '2026-01-01'), { usage: { lastActivityOn: '2026-09-01', flagged: true } }),
      input(seat('s2', '2026-01-01'), { holderLeft: true }),
      input(seat('s1', '2026-01-01', { liveRevocationSources: ['GHOST_SEAT'] })),
    ]);

    expect(ranked.map((r) => [r.assignmentId, r.group, r.position])).toEqual([
      ['s1', 'REVOCATION_DECIDED', 1],
      ['s2', 'HOLDER_LEFT', 2],
      ['s3', 'USAGE_FLAGGED', 3],
      ['s5', 'OTHER', 4],
      ['s6', 'OTHER', 5],
    ]);
  });

  it('without evidence of use flags nothing and falls to the oldest seat, never guessing a use', () => {
    const ranked = rankSeats([
      input(seat('b', '2026-05-01')),
      input(seat('a', '2026-02-01')),
      input(seat('c', '2026-02-01')),
    ]);

    expect(ranked.map((r) => r.assignmentId)).toEqual(['a', 'c', 'b']);
    expect(ranked.every((r) => r.group === 'OTHER' && r.lastActivityOn === null)).toBe(true);
  });

  it('offers only personal seats', () => {
    expect(rankSeats([input(seat('svc', '2026-01-01', { kind: 'SERVICE' }))])).toEqual([]);
  });

  it('holds a seat from its first day until the day it ends', () => {
    const s = seat('x', '2026-02-01', { validUntil: '2026-03-01' });
    expect(heldOn(s, '2026-01-31')).toBe(false);
    expect(heldOn(s, '2026-02-01')).toBe(true);
    expect(heldOn(s, '2026-03-01')).toBe(false);
  });
});
