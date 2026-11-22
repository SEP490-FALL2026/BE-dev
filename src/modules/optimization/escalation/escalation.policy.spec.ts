import { escalationVerdictOf } from './escalation.policy';
import type { EscalationFacts } from './escalation.types';

const WATCH = { group: 'G4', tier: 'MONITOR', state: 'OPEN', employeeId: 'e1', seatChainId: 'c1' } as const;
const GOOD: EscalationFacts = {
  record: WATCH,
  seat: { isMachineAccount: false },
  inTransfer: false,
  onLeaveOrHandover: false,
  placementDepartmentId: 'd1',
};
const verdict = (over: Partial<EscalationFacts>) => escalationVerdictOf({ ...GOOD, ...over });
const record = (over: Partial<typeof WATCH> | Record<string, unknown>) =>
  ({ ...WATCH, ...over }) as EscalationFacts['record'];

describe('who the IT Admin may push early from the watch tier to the review tier (QĐ-111ay)', () => {
  it('pushes a G4 of the watch tier that is open, on a seat that holds a seat, of a person in a department', () => {
    expect(verdict({})).toEqual({ kind: 'ESCALATE' });
  });

  it('says NOT_FOUND for a recommendation the caller named and nobody made', () => {
    expect(verdict({ record: null })).toEqual({ kind: 'SKIP', reason: 'NOT_FOUND' });
  });

  it.each([
    ['a G1', { group: 'G1', tier: null, employeeId: null, seatChainId: null }],
    ['a G2 (the IT Admin opens its reclaim, nobody asks a head)', { group: 'G2', tier: 'ACTION' }],
    ['a G4 already of the review tier', { tier: 'REVIEW' }],
    ['a G3 or G4 of the action tier', { group: 'G3', tier: 'ACTION' }],
    ['one a head was asked about', { state: 'AWAITING_DECISION' }],
    ['one that waits for a head', { state: 'WAITING_FOR_HEAD' }],
    ['one whose reclaim is decided', { state: 'RECLAIM_DECIDED' }],
    ['a closed one', { state: 'CLOSED' }],
    ['one with no holder', { employeeId: null }],
    ['one with no seat chain', { seatChainId: null }],
  ])('refuses %s as NOT_WATCH: only a watch that is still open can be pushed', (_name, over) => {
    expect(verdict({ record: record(over) })).toEqual({ kind: 'SKIP', reason: 'NOT_WATCH' });
  });

  it('refuses a holder on long leave today or handing over before leaving (LEAVE_OR_HANDOVER, FR-4.12: the early push still passes the eight gates of FR-4.9)', () => {
    expect(verdict({ onLeaveOrHandover: true })).toEqual({ kind: 'SKIP', reason: 'LEAVE_OR_HANDOVER' });
  });

  it('judges the transfer before the leave, and the leave before the department', () => {
    expect(verdict({ inTransfer: true, onLeaveOrHandover: true })).toEqual({ kind: 'SKIP', reason: 'TRANSFER_GRACE' });
    expect(verdict({ onLeaveOrHandover: true, placementDepartmentId: null })).toEqual({
      kind: 'SKIP',
      reason: 'LEAVE_OR_HANDOVER',
    });
  });

  it('refuses a seat that no longer holds a seat (SEAT_ENDED): the next run closes the recommendation', () => {
    expect(verdict({ seat: null })).toEqual({ kind: 'SKIP', reason: 'SEAT_ENDED' });
  });

  it('refuses a seat used for a machine account whoever holds it (QĐ-110m)', () => {
    expect(verdict({ seat: { isMachineAccount: true } })).toEqual({ kind: 'SKIP', reason: 'MACHINE_ACCOUNT' });
  });

  it('refuses a holder in the grace of a transfer, whether the pass already paused the recommendation or not yet (QĐ-110p)', () => {
    expect(verdict({ inTransfer: true })).toEqual({ kind: 'SKIP', reason: 'TRANSFER_GRACE' });
    expect(verdict({ record: record({ state: 'PAUSED' }) })).toEqual({ kind: 'SKIP', reason: 'TRANSFER_GRACE' });
  });

  it('refuses a holder who has no department today: the queue of no head can take it', () => {
    expect(verdict({ placementDepartmentId: null })).toEqual({ kind: 'SKIP', reason: 'NO_DEPARTMENT' });
  });

  it('refuses a caller who is not permitted to act for the holder department (NOT_IN_CHARGE)', () => {
    expect(verdict({ inChargeAllowed: false })).toEqual({
      kind: 'SKIP',
      reason: 'NOT_IN_CHARGE',
    });
  });

  it('says the machine account before the transfer when both hold, and the seat that ended before either', () => {
    expect(verdict({ seat: { isMachineAccount: true }, inTransfer: true })).toEqual({
      kind: 'SKIP',
      reason: 'MACHINE_ACCOUNT',
    });
    expect(verdict({ seat: null, inTransfer: true })).toEqual({ kind: 'SKIP', reason: 'SEAT_ENDED' });
    expect(verdict({ placementDepartmentId: null, inChargeAllowed: false })).toEqual({
      kind: 'SKIP',
      reason: 'NO_DEPARTMENT',
    });
  });
});
