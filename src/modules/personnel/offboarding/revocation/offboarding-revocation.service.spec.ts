import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import type { PersonalSeat } from '../../../licensing/public/licensing.types';
import type { OffboardingAuditService } from '../offboarding-audit.service';
import type { OffboardingFrame } from '../offboarding-frame.service';
import type { OffboardingLeftService } from '../offboarding-left.service';
import { OffboardingRevocationService } from '../offboarding-revocation.service';
import { OffboardingRefusedError } from '../offboarding.errors';
import type { OffboardingRepo } from '../offboarding.repo';
import type { OffboardingRecord } from '../offboarding.types';

const ACTOR: AuthenticatedPrincipal = {
  subject: 'app-it',
  appUserId: 'app-it',
  sessionId: 'sess-1',
  employeeId: 'emp-it',
  directRoles: ['IT_ADMIN'],
  roles: ['IT_ADMIN'],
};

const CASE: OffboardingRecord = {
  id: 'case-1',
  organizationId: 'org-1',
  employeeId: 'emp-1',
  departmentId: 'dep-1',
  state: 'LEFT',
  accessBlockMode: 'WITH_LAST_DAY',
  priorWorkState: 'WORKING',
  lastWorkingDay: '2026-10-20',
  departureEffectiveOn: '2026-10-21',
  handoverDueOn: '2026-10-19',
  grounds: { type: null, reference: 'Decision', issuer: null, issuedOn: null },
  headHandover: null,
  placementClosedId: null,
  cancelledPlacementId: null,
  cancelledPlacementDepartmentId: null,
  cancelledPlacementFrom: null,
  recordedByAppUserId: 'app-sa',
  recordedByTicketId: null,
  recordedAt: new Date('2026-10-20T00:00:00Z'),
  leftOn: '2026-10-20',
  leftAt: new Date('2026-10-20T00:00:00Z'),
  leftByAppUserId: 'app-sa',
  cancelledAt: null,
  cancelledByAppUserId: null,
  cancelledByTicketId: null,
  cancelReason: null,
  accountLockAt: new Date('2026-10-20T01:00:00Z'),
  accountLockByAppUserId: 'app-it',
  accountLockNote: 'Locked',
  revocationDueOn: '2026-10-23',
  mailboxLockAt: null,
  mailboxLockByAppUserId: null,
  mailboxLockNote: null,
  closedAt: null,
  closedByAppUserId: null,
};

const seat = (assignmentId: string, subscriptionId: string | null, hasTask = false): PersonalSeat => ({
  assignmentId,
  employeeId: 'emp-1',
  planId: 'plan-1',
  planName: 'Plan 1',
  applicationId: 'app-1',
  applicationName: 'App 1',
  provisioningType: 'K2',
  revocationNote: null,
  dataLossOnRemoval: false,
  subscriptionId,
  grantReason: null,
  effectiveFrom: '2026-01-01',
  validUntil: null,
  revocation: hasTask ? { taskId: `task-${assignmentId}`, status: 'QUEUED', source: 'RETURN' } : null,
});

function harness(
  held: OffboardingRecord,
  seats: PersonalSeat[],
  opened: { created: boolean; reasonAdded: boolean }[],
  bySubstitute = false,
) {
  const tx = { tag: 'tx' };
  const frame = {
    runTechnical: jest.fn((_actor, _id, _opts, fn: (t: unknown, ctx: unknown) => Promise<unknown>) =>
      fn(tx, { held, today: '2026-10-21', recordedOn: '2026-10-20', bySubstitute }),
    ),
  } as unknown as OffboardingFrame;
  const insertChange = jest.fn();
  const repo = { insertChange, find: jest.fn().mockResolvedValue(held) } as unknown as OffboardingRepo;
  let index = 0;
  const openRevocation = jest.fn().mockImplementation(() => {
    const res = opened[index++] ?? { created: false, reasonAdded: false };
    return Promise.resolve({ taskId: `t-${index}`, status: 'QUEUED', ...res });
  });
  const licensing = { listPersonalSeatsOf: jest.fn().mockResolvedValue(seats), openRevocation };
  const writeAccountLock = jest.fn();
  const left = { writeAccountLock } as unknown as OffboardingLeftService;
  const changed = jest.fn();
  const audit = { changed } as unknown as OffboardingAuditService;
  const identity = { findDepartureBlock: jest.fn().mockResolvedValue(null) };
  const service = new OffboardingRevocationService(frame, repo, licensing as never, left, audit, identity as never);
  return { service, openRevocation, insertChange, changed, writeAccountLock };
}

describe('OffboardingRevocationService', () => {
  it('opens in (subscriptionId, assignmentId) order and counts created and reasonAdded', async () => {
    const seats = [seat('asgn-b', 'sub-2', true), seat('asgn-a', 'sub-1', false)];
    const { service, openRevocation, insertChange } = harness(CASE, seats, [
      { created: true, reasonAdded: false },
      { created: false, reasonAdded: true },
    ]);

    const res = await service.openRevocations(ACTOR, 'case-1', {});

    expect(res.created).toBe(1);
    expect(res.reasonAdded).toBe(1);
    expect(
      openRevocation.mock.calls.map((call: unknown[]) => (call[2] as { assignmentId: string }).assignmentId),
    ).toEqual(['asgn-a', 'asgn-b']);
    expect(insertChange).toHaveBeenCalledTimes(1);
  });

  it('throws NOTHING_TO_REVOKE without writing change or audit when all selected seats already carry this case reason', async () => {
    const seats = [seat('asgn-1', 'sub-1', true)];
    const noLockCase: OffboardingRecord = { ...CASE, accountLockAt: null, accountLockByAppUserId: null };
    const { service, insertChange, changed } = harness(noLockCase, seats, [{ created: false, reasonAdded: false }]);

    await expect(
      service.openRevocations(ACTOR, 'case-1', { accountLock: { note: 'Locked now' } }),
    ).rejects.toMatchObject<Partial<OffboardingRefusedError>>({ code: 'NOTHING_TO_REVOKE' });
    expect(insertChange).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
  });

  it('includes bySubstitute: true in REVOCATIONS_OPENED audit and passes it to writeAccountLock when acting as substitute', async () => {
    const seats = [seat('asgn-1', 'sub-1', false)];
    const noLockCase: OffboardingRecord = { ...CASE, accountLockAt: null, accountLockByAppUserId: null };
    const { service, changed, writeAccountLock } = harness(
      noLockCase,
      seats,
      [{ created: true, reasonAdded: false }],
      true,
    );

    await service.openRevocations(ACTOR, 'case-1', { accountLock: { note: 'Locked now' } });

    expect(writeAccountLock).toHaveBeenCalledWith(
      expect.anything(),
      ACTOR,
      noLockCase,
      { note: 'Locked now' },
      { bySubstitute: true },
    );
    expect(changed).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      noLockCase,
      'OFFBOARDING_CASE.REVOCATIONS_OPENED',
      null,
      expect.objectContaining({ count: 1, created: 1, reasonAdded: 0, bySubstitute: true }),
    );
  });
});
