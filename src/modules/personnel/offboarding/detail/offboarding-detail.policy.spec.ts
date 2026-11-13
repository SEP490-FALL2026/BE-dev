import type { OffboardingState } from '../offboarding.types';
import { departureDetailFacts } from './offboarding-detail.policy';

const seat = (assignmentId: string, revocation: { status: string } | null = null) => ({ assignmentId, revocation });
const record = (
  extra: {
    state?: OffboardingState;
    closedAt?: Date | null;
    accountLockAt?: Date | null;
    mailboxLockAt?: Date | null;
  } = {},
) => ({
  accessBlockMode: 'WITH_LAST_DAY' as const,
  state: 'HANDING_OVER' as OffboardingState,
  accountLockAt: null as Date | null,
  mailboxLockAt: null as Date | null,
  closedAt: null as Date | null,
  ...extra,
});

describe('what the detail of a departure is read against (US-03-04 AC-7, AC-20, QĐ-62i)', () => {
  const live = {
    live: true,
    seats: [seat('a'), seat('b', { status: 'QUEUED' }), seat('c')],
    withoutCompletedTask: 3,
    terminating: new Set(['c']),
    opened: ['a', 'x'],
  };

  it('counts the rights held, the ones whose access runs on to the end of the paid period, and the ones still open', () => {
    const facts = departureDetailFacts(record(), live);

    expect(facts).toMatchObject({ heldRights: 3, accessRunsOn: 1 });
  });

  it('takes the rights left without a completed task from the one count the list and the late pass use, not from the seats it lists (QĐ-110c)', () => {
    expect(departureDetailFacts(record(), live).rightsWithoutCompletedTask).toBe(3);
    // The seats show a task completed for every one, yet the count says one is left: the count is the source.
    expect(
      departureDetailFacts(record(), {
        ...live,
        seats: [
          seat('a', { status: 'COMPLETED' }),
          seat('b', { status: 'COMPLETED' }),
          seat('c', { status: 'COMPLETED' }),
        ],
        withoutCompletedTask: 1,
      }).rightsWithoutCompletedTask,
    ).toBe(1);
  });

  it('fills the checklist from the seats without a task and the seats given back; the handover step is always done (QĐ-110g)', () => {
    expect(departureDetailFacts(record(), live).checklist).toMatchObject({
      dataHandover: { state: 'DONE', pendingDuties: 0 },
      accountLock: { state: 'PENDING', urgent: false },
      revokeAccess: { state: 'IN_PROGRESS', heldRights: 3, withoutTask: 2, accessRunsOn: 1 },
      seatsReleased: { opened: 2, released: 1 },
    });
  });

  it('keeps the case open on the locks that are not written and the rights with no completed task, until it is closed (QĐ-110e)', () => {
    expect(departureDetailFacts(record({ state: 'LEFT' }), live).blockers).toEqual({
      ACCOUNT_LOCK_NOT_RECORDED: 1,
      MAILBOX_LOCK_NOT_RECORDED: 1,
      PERSONAL_RIGHTS_OPEN: 3,
    });
    expect(
      departureDetailFacts(record({ state: 'LEFT', mailboxLockAt: new Date(), accountLockAt: new Date() }), {
        ...live,
        withoutCompletedTask: 0,
      }).blockers,
    ).toEqual({});
    expect(departureDetailFacts(record({ state: 'LEFT', closedAt: new Date() }), live).blockers).toEqual({});
  });

  it('has no checklist and no rights for a case that was cancelled', () => {
    const facts = departureDetailFacts(record({ state: 'CANCELLED' }), {
      live: false,
      seats: [],
      withoutCompletedTask: 0,
      terminating: new Set<string>(),
      opened: [],
    });

    expect(facts).toMatchObject({
      heldRights: 0,
      rightsWithoutCompletedTask: 0,
      accessRunsOn: 0,
      checklist: null,
      blockers: {},
    });
  });
});
