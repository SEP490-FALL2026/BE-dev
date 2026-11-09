import {
  decideG1,
  decideG2,
  g1ActionOf,
  type ChainRecommendation,
  type SeatFacts,
  type VacancyFacts,
} from './internal-rules.policy';

const vacancy = (patch: Partial<VacancyFacts> = {}): VacancyFacts => ({
  provisioningType: 'K2',
  pricingModel: 'PER_SEAT',
  purchased: 100,
  occupied: 88,
  free: 12,
  ...patch,
});

describe('G1 (gate 1)', () => {
  it('US-10-01 AC-1: makes a G1 of the free seats of a PER_SEAT subscription that counts toward the cost of free seats for K2', () => {
    expect(decideG1(vacancy(), null)).toEqual({
      skip: null,
      step: { kind: 'CREATE', freeSeats: 12, countsTowardVacantCost: true, action: 'REGRANT_OR_REDUCE' },
    });
    expect(decideG1(vacancy({ provisioningType: 'K1' }), null).step).toMatchObject({ countsTowardVacantCost: false });
  });

  it('keeps the action of a K4 key pool apart: regrant before buying more (Q-12)', () => {
    expect(g1ActionOf('K4')).toBe('REGRANT_BEFORE_PURCHASE');
    expect(g1ActionOf('K2')).toBe('REGRANT_OR_REDUCE');
  });

  it('TẠM CHỌN: a K4 pool is not supported yet, so no G1 is made for it', () => {
    expect(decideG1(vacancy({ provisioningType: 'K4' }), null)).toEqual({ skip: null, step: { kind: 'NONE' } });
  });

  it('US-10-01 AC-7: leaves a plan that is not PER_SEAT out with the gate and closes a G1 it had', () => {
    expect(decideG1(vacancy({ pricingModel: 'FLAT_RATE' }), null)).toEqual({
      skip: { gate: 'PER_SEAT', detail: { pricingModel: 'FLAT_RATE', provisioningType: 'K2' } },
      step: { kind: 'NONE' },
    });
    expect(decideG1(vacancy({ pricingModel: null }), { freeSeats: 3 }).step).toEqual({
      kind: 'CLOSE',
      reason: 'OUT_OF_SCOPE',
    });
  });

  it('US-10-01 AC-8: leaves internal software (K5) out as INTERNAL_SOFTWARE', () => {
    expect(decideG1(vacancy({ provisioningType: 'K5', pricingModel: null }), null).skip).toEqual({
      gate: 'INTERNAL_SOFTWARE',
      detail: { provisioningType: 'K5' },
    });
  });

  it('follows the free seats of an open G1: unchanged does nothing, a new number updates it, none closes it', () => {
    expect(decideG1(vacancy(), { freeSeats: 12 }).step).toEqual({ kind: 'NONE' });
    expect(decideG1(vacancy({ free: 10 }), { freeSeats: 12 }).step).toEqual({ kind: 'UPDATE', freeSeats: 10 });
    expect(decideG1(vacancy({ free: 0 }), { freeSeats: 12 }).step).toEqual({
      kind: 'CLOSE',
      reason: 'FREE_SEATS_GONE',
    });
    expect(decideG1(vacancy({ free: 0 }), null).step).toEqual({ kind: 'NONE' });
  });

  it('closes a G1 whose subscription no longer grants seats, and does nothing when there was none', () => {
    expect(decideG1(null, { freeSeats: 4 }).step).toEqual({ kind: 'CLOSE', reason: 'OUT_OF_SCOPE' });
    expect(decideG1(null, null).step).toEqual({ kind: 'NONE' });
  });
});

const seat = (patch: Partial<SeatFacts> = {}): SeatFacts => ({
  kind: 'PERSONAL',
  provisioningType: 'K2',
  pricingModel: 'PER_SEAT',
  holderLeft: true,
  liveRevocation: null,
  terminatingUntil: null,
  ...patch,
});
const chain = (patch: Partial<ChainRecommendation>): ChainRecommendation => ({
  id: 'rec-1',
  group: 'G2',
  state: 'OPEN',
  revocationTaskId: null,
  holderLeftOn: null,
  ...patch,
});

describe('G2 (gates 1 and 8)', () => {
  it('US-10-01 AC-2: makes an open G2 for the seat of a person who left, replacing nothing', () => {
    expect(decideG2(seat(), null)).toEqual({
      skip: null,
      step: { kind: 'CREATE', state: 'OPEN', revocationTaskId: null, terminatingUntil: null, supersedes: null },
    });
  });

  it('does nothing for a holder who has not left, a service account or a seat that is not PER_SEAT', () => {
    expect(decideG2(seat({ holderLeft: false }), null).step).toEqual({ kind: 'NONE' });
    expect(decideG2(seat({ kind: 'SERVICE' }), null)).toEqual({ skip: null, step: { kind: 'NONE' } });
    expect(decideG2(seat({ pricingModel: 'FLAT_RATE' }), null).skip?.gate).toBe('PER_SEAT');
    expect(decideG2(seat({ provisioningType: 'K5', pricingModel: null }), null).skip?.gate).toBe('INTERNAL_SOFTWARE');
  });

  it('US-10-01 AC-4, gate 8: leaves a seat that has a G2 not closed alone, naming it', () => {
    expect(decideG2(seat(), chain({ state: 'OPEN' }))).toEqual({
      skip: { gate: 'OPEN_RECOMMENDATION', detail: { recommendationId: 'rec-1' } },
      step: { kind: 'NONE' },
    });
    expect(decideG2(seat(), chain({ state: 'RECLAIM_DECIDED' })).step).toEqual({ kind: 'NONE' });
  });

  it('QĐ-108i, Q-82: replaces a paused recommendation and an undecided G3/G4 by a G2', () => {
    expect(decideG2(seat(), chain({ group: 'G3', state: 'PAUSED' })).step).toMatchObject({
      kind: 'CREATE',
      supersedes: 'rec-1',
    });
    expect(decideG2(seat(), chain({ group: 'G4', state: 'OPEN' })).step).toMatchObject({
      kind: 'CREATE',
      supersedes: 'rec-1',
    });
  });

  it('DA6-04: makes no G2 where a head decided the reclaim; marks the day the holder left once', () => {
    expect(decideG2(seat(), chain({ group: 'G4', state: 'RECLAIM_DECIDED' })).step).toEqual({
      kind: 'MARK_HOLDER_LEFT',
      recommendationId: 'rec-1',
    });
    expect(decideG2(seat(), chain({ group: 'G4', state: 'RECLAIM_DECIDED', holderLeftOn: '2026-11-09' }))).toEqual({
      skip: null,
      step: { kind: 'NONE' },
    });
  });

  it('DA6-03: a seat whose revocation is under way makes a G2 that is decided and holds the task', () => {
    expect(decideG2(seat({ liveRevocation: { taskId: 'task-1' } }), null).step).toEqual({
      kind: 'CREATE',
      state: 'RECLAIM_DECIDED',
      revocationTaskId: 'task-1',
      terminatingUntil: null,
      supersedes: null,
    });
  });

  it('US-07-05 AC-12: an open G2 learns of a revocation that began after it was made', () => {
    expect(decideG2(seat({ liveRevocation: { taskId: 'task-1' } }), chain({ state: 'OPEN' })).step).toEqual({
      kind: 'LINK_TASK',
      recommendationId: 'rec-1',
      taskId: 'task-1',
    });
    expect(decideG2(seat({ liveRevocation: { taskId: 'task-1' } }), chain({ state: 'RECLAIM_DECIDED' })).step).toEqual({
      kind: 'NONE',
    });
  });

  it('DA6-27: a K1 seat whose access runs on to a day makes one decided G2 with that day', () => {
    expect(decideG2(seat({ provisioningType: 'K1', terminatingUntil: '2026-11-30' }), null).step).toEqual({
      kind: 'CREATE',
      state: 'RECLAIM_DECIDED',
      revocationTaskId: null,
      terminatingUntil: '2026-11-30',
      supersedes: null,
    });
  });
});
