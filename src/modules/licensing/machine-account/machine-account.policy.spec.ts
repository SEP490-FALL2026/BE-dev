import type { AssignmentRecord } from '../public/licensing.types';
import { machineAccountOutcome, machineAccountRefusal } from './machine-account.policy';

const seat = (extra: Partial<AssignmentRecord> = {}): AssignmentRecord => ({
  id: 'a1',
  source: 'REQUEST',
  kind: 'PERSONAL',
  planId: 'p1',
  subscriptionId: 's1',
  employeeId: 'e1',
  accountIdentifier: 'ci-bot',
  reason: null,
  costCenterId: null,
  owningDepartmentId: null,
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
  ...extra,
});
const on = { on: true, note: 'Release pipeline' } as const;
const off = { on: false, note: null } as const;

describe('machineAccountRefusal (QĐ-110m, R-9)', () => {
  it('lets the flag be turned on for an open personal seat of an IT Admin', () => {
    expect(machineAccountRefusal(seat(), true, on)).toBeNull();
  });

  it('refuses turning it on when the person who holds the seat is not an IT Admin who can act', () => {
    expect(machineAccountRefusal(seat(), false, on)).toBe('HOLDER_NOT_IT_ADMIN');
  });

  it('lets the flag be turned off whoever holds the seat now: a person who stopped being an IT Admin must be able to give the flag up', () => {
    expect(machineAccountRefusal(seat({ isMachineAccount: true, machineAccountNote: 'x' }), false, off)).toBeNull();
  });

  it('refuses a service account of the earlier releases, in either direction: it is not a personal seat', () => {
    const service = seat({ kind: 'SERVICE', reason: 'CI', costCenterId: 'cc1', owningDepartmentId: 'd1' });

    expect(machineAccountRefusal(service, true, on)).toBe('NOT_PERSONAL');
    expect(machineAccountRefusal(service, true, off)).toBe('NOT_PERSONAL');
  });

  it.each([
    ['ended', { validUntil: '2026-11-01' }],
    ['set to end', { validUntil: '2026-12-31' }],
    ['failed', { failedAt: new Date('2026-10-02T00:00:00.000Z') }],
    ['cancelled', { cancelledAt: new Date('2026-10-02T00:00:00.000Z') }],
  ] as const)('refuses a seat that is %s: only an open one changes', (_name, extra) => {
    expect(machineAccountRefusal(seat(extra), true, on)).toBe('NOT_OPEN');
    expect(machineAccountRefusal(seat(extra), true, off)).toBe('NOT_OPEN');
  });

  it('judges the kind of the seat before whether it is open, and whether it is open before who holds it', () => {
    expect(machineAccountRefusal(seat({ kind: 'SERVICE', validUntil: '2026-11-01' }), false, on)).toBe('NOT_PERSONAL');
    expect(machineAccountRefusal(seat({ validUntil: '2026-11-01' }), false, on)).toBe('NOT_OPEN');
  });
});

describe('machineAccountOutcome', () => {
  it.each([
    ['turns the flag on', seat(), on, 'FLAG_ON'],
    [
      'changes the note of a flagged seat',
      seat({ isMachineAccount: true, machineAccountNote: 'Old' }),
      on,
      'NOTE_CHANGED',
    ],
    [
      'changes nothing when the same note is given again',
      seat({ isMachineAccount: true, machineAccountNote: 'Release pipeline' }),
      on,
      'UNCHANGED',
    ],
    ['turns the flag off', seat({ isMachineAccount: true, machineAccountNote: 'Old' }), off, 'FLAG_OFF'],
    ['changes nothing when an unflagged seat is turned off', seat(), off, 'UNCHANGED'],
  ] as const)('%s', (_name, current, change, outcome) => {
    expect(machineAccountOutcome(current, change)).toBe(outcome);
  });
});
