import type { OffboardingState } from '../offboarding.types';
import { departureDetailFacts } from './offboarding-detail.policy';

const seat = (assignmentId: string, revocation: unknown = null) => ({ assignmentId, revocation });
const record = (extra: { state?: OffboardingState; closedAt?: Date | null } = {}) => ({
  accessBlockMode: 'WITH_LAST_DAY' as const,
  state: 'HANDING_OVER' as OffboardingState,
  accountLockAt: null as Date | null,
  closedAt: null as Date | null,
  ...extra,
});

describe('what the detail of a departure is read against (US-03-04 AC-7, AC-20, QĐ-62i)', () => {
  const live = {
    live: true,
    seats: [seat('a'), seat('b', { taskId: 't-1' }), seat('c')],
    terminating: new Set(['c']),
    duties: [
      { status: 'OPEN', flaggedUnconfirmed: false },
      { status: 'OPEN', flaggedUnconfirmed: true },
      { status: 'CONFIRMED', flaggedUnconfirmed: false },
    ],
    opened: ['a', 'x'],
    registered: { WORKSPACE: 1 },
  };

  it('counts the rights held, the ones whose access runs on to the end of the paid period, and the ones still open', () => {
    const facts = departureDetailFacts(record(), live);

    expect(facts).toMatchObject({ heldRights: 3, accessRunsOn: 1 });
  });

  it('fills the checklist from the duties that wait without being gone on, the seats without a task, and the seats given back', () => {
    expect(departureDetailFacts(record(), live).checklist).toMatchObject({
      dataHandover: { state: 'PENDING', pendingDuties: 1 },
      accountLock: { state: 'PENDING', urgent: false },
      revokeAccess: { state: 'IN_PROGRESS', heldRights: 3, withoutTask: 2, accessRunsOn: 1 },
      seatsReleased: { opened: 2, released: 1 },
    });
  });

  it('keeps the case open on the open rights, the access that runs on and what the flows that come after register, until it is closed', () => {
    expect(departureDetailFacts(record({ state: 'LEFT' }), live).blockers).toEqual({
      ACCOUNT_LOCK_NOT_RECORDED: 1,
      PERSONAL_RIGHTS_OPEN: 2,
      ACCESS_RUNS_ON: 1,
      WORKSPACE: 1,
    });
    expect(departureDetailFacts(record({ state: 'LEFT', closedAt: new Date() }), live).blockers).toEqual({});
  });

  it('has no checklist, no rights and nothing registered for a case that was cancelled', () => {
    const facts = departureDetailFacts(record({ state: 'CANCELLED' }), {
      live: false,
      seats: [],
      terminating: new Set<string>(),
      duties: [],
      opened: [],
      registered: {},
    });

    expect(facts).toMatchObject({ heldRights: 0, accessRunsOn: 0, checklist: null, blockers: {} });
  });
});
