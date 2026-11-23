import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import type { OffboardingAuditService } from '../offboarding-audit.service';
import { OffboardingFrame } from '../offboarding-frame.service';
import { OffboardingLeftService } from '../offboarding-left.service';
import { OffboardingRefusedError } from '../offboarding.errors';
import type { OffboardingRepo } from '../offboarding.repo';
import type { OffboardingRecord } from '../offboarding.types';

const actorOf = (
  employeeId: string,
  roles: AuthenticatedPrincipal['roles'] = ['IT_ADMIN'],
): AuthenticatedPrincipal => ({
  subject: `app-${employeeId}`,
  appUserId: `app-${employeeId}`,
  sessionId: 'sess-1',
  employeeId,
  directRoles: roles,
  roles,
});

const CASE: OffboardingRecord = {
  id: 'case-1',
  organizationId: 'org-1',
  employeeId: 'emp-leaver',
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
  accountLockAt: null,
  accountLockByAppUserId: null,
  accountLockNote: null,
  revocationDueOn: '2026-10-23',
  mailboxLockAt: null,
  mailboxLockByAppUserId: null,
  mailboxLockNote: null,
  closedAt: null,
  closedByAppUserId: null,
};

function frameHarness(options: {
  held?: OffboardingRecord;
  readScope?: string[];
  acting?: { actors: string[]; substitute: string | null } | undefined;
}) {
  const held = options.held ?? CASE;
  const tx = { tag: 'tx' };
  const runner = { run: jest.fn((work: (t: unknown) => Promise<unknown>) => work(tx)) };
  const organization = { lockEmployeeForUpdate: jest.fn() };
  const organizationReads = {
    businessToday: jest.fn().mockResolvedValue('2026-10-21'),
    getOrganization: jest.fn().mockResolvedValue({ timeZone: 'UTC' }),
    lockEmployeeForShare: jest.fn(),
    getItAdminScope: jest.fn().mockResolvedValue(options.readScope ?? ['dep-1']),
    itAdminsActingFor: jest
      .fn()
      .mockResolvedValue(options.acting ? new Map([[held.departmentId, options.acting]]) : new Map()),
  };
  const history = { lockDepartments: jest.fn() };
  const guard = { requireWriter: jest.fn(), requireOperatorSubject: jest.fn() };
  const repo = { find: jest.fn().mockResolvedValue(held), lock: jest.fn().mockResolvedValue(held) };
  const identity = { findUsableItAdminEmployeeIds: jest.fn().mockResolvedValue(new Set(['emp-it'])) };

  const frame = new OffboardingFrame(
    runner as never,
    organization as never,
    organizationReads as never,
    history as never,
    guard as never,
    repo as never,
    identity as never,
  );

  return { frame, guard, organizationReads };
}

describe('OffboardingFrame.runTechnical (acting IT Admin & read scope)', () => {
  it('throws NOT_FOUND when department is outside read scope', async () => {
    const { frame } = frameHarness({ readScope: ['dep-other'] });

    await expect(frame.runTechnical(actorOf('emp-it'), 'case-1', {}, jest.fn())).rejects.toMatchObject<
      Partial<OffboardingRefusedError>
    >({ code: 'NOT_FOUND' });
  });

  it('throws NOT_IN_CHARGE when department is in read scope without acting (common queue)', async () => {
    const { frame } = frameHarness({
      readScope: ['dep-1'],
      acting: { actors: [], substitute: null },
    });

    await expect(frame.runTechnical(actorOf('emp-it'), 'case-1', {}, jest.fn())).rejects.toMatchObject<
      Partial<OffboardingRefusedError>
    >({ code: 'NOT_IN_CHARGE' });
  });

  it('throws NOT_IN_CHARGE when the leaver acts on their own case', async () => {
    const { frame } = frameHarness({
      readScope: ['dep-1'],
      acting: { actors: ['emp-leaver', 'emp-sub'], substitute: 'emp-sub' },
    });

    await expect(frame.runTechnical(actorOf('emp-leaver'), 'case-1', {}, jest.fn())).rejects.toMatchObject<
      Partial<OffboardingRefusedError>
    >({ code: 'NOT_IN_CHARGE' });
  });

  it('throws NOT_IN_CHARGE when case departmentId is null', async () => {
    const { frame } = frameHarness({
      held: { ...CASE, departmentId: null },
      readScope: [],
    });

    await expect(frame.runTechnical(actorOf('emp-it'), 'case-1', {}, jest.fn())).rejects.toMatchObject<
      Partial<OffboardingRefusedError>
    >({ code: 'NOT_IN_CHARGE' });
  });

  it('allows usable in-charge IT Admin with bySubstitute: false', async () => {
    const { frame } = frameHarness({
      readScope: ['dep-1'],
      acting: { actors: ['emp-it'], substitute: null },
    });
    const apply = jest.fn().mockResolvedValue('ok');

    await expect(frame.runTechnical(actorOf('emp-it'), 'case-1', {}, apply)).resolves.toBe('ok');
    expect(apply).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ bySubstitute: false }));
  });

  it('allows appointed substitute IT Admin with bySubstitute: true', async () => {
    const { frame } = frameHarness({
      readScope: ['dep-1'],
      acting: { actors: ['emp-sub'], substitute: 'emp-sub' },
    });
    const apply = jest.fn().mockResolvedValue('ok');

    await expect(frame.runTechnical(actorOf('emp-sub'), 'case-1', {}, apply)).resolves.toBe('ok');
    expect(apply).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ bySubstitute: true }));
  });

  it('passes locked held record to runEvent afterLocks', async () => {
    const { frame, guard } = frameHarness({});
    const apply = jest.fn().mockResolvedValue('ok');

    await frame.runEvent({ kind: 'USER', principal: actorOf('emp-sa', ['SUPER_ADMIN']) }, 'case-1', {}, apply);
    expect(guard.requireOperatorSubject).toHaveBeenCalledWith(expect.anything(), expect.anything(), CASE.employeeId);
  });
});

describe('OffboardingLeftService.recordAccountLock (bySubstitute audit)', () => {
  it('records bySubstitute: true in audit after when frame passes bySubstitute: true', async () => {
    const tx = { tag: 'tx' };
    const frame = {
      runTechnical: jest.fn((_actor, _id, _opts, fn: (t: unknown, ctx: unknown) => Promise<unknown>) =>
        fn(tx, { held: CASE, today: '2026-10-21', recordedOn: '2026-10-20', bySubstitute: true }),
      ),
    } as unknown as OffboardingFrame;
    const repo = {
      recordAccountLock: jest.fn().mockResolvedValue(true),
      insertChange: jest.fn(),
      find: jest.fn().mockResolvedValue(CASE),
    } as unknown as OffboardingRepo;
    const changed = jest.fn();
    const audit = { changed } as unknown as OffboardingAuditService;
    const identity = {
      findDepartureBlock: jest.fn().mockResolvedValue({ sourceCaseId: CASE.id, blockedFrom: '2026-10-20' }),
    };

    const service = new OffboardingLeftService(
      frame,
      repo,
      {} as never,
      identity as never,
      audit,
      {} as never,
      {} as never,
    );

    await service.recordAccountLock(actorOf('emp-sub'), 'case-1', { note: 'Locked by sub' });

    expect(changed).toHaveBeenCalledWith(
      tx,
      expect.anything(),
      CASE,
      'OFFBOARDING_CASE.ACCOUNT_LOCK_RECORDED',
      null,
      expect.objectContaining({ employeeId: CASE.employeeId, urgent: false, bySubstitute: true }),
    );
  });
});
