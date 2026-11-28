import type { TaskWorkContext, TaskWrite } from '../provisioning-task-frame.service';
import { ProvisioningEvidenceFileInvalidError } from '../provisioning.errors';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import type { SeatLedgerApi } from '../../../catalog/public/seat-ledger.api';
import { ProvisioningNotInChargeError } from '../provisioning.errors';
import { RevocationAftermath } from './revocation-aftermath.service';
import { RevocationCompletionService } from './revocation-completion.service';

const ACTOR: AuthenticatedPrincipal = {
  subject: 'app-it',
  appUserId: 'app-it',
  sessionId: 'session-it',
  employeeId: 'e-other',
  directRoles: ['IT_ADMIN'],
  roles: ['IT_ADMIN'],
};

describe('RevocationCompletionService (delegates acting IT Admin check via ProvisioningTaskFrame.work)', () => {
  it('propagates ProvisioningNotInChargeError on complete and recordAccessCut', async () => {
    const work = jest.fn().mockRejectedValue(new ProvisioningNotInChargeError());
    const service = new RevocationCompletionService(
      {} as never,
      { work } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.complete(ACTOR, 'task-1', { completion: 'ACCOUNT_REMOVED', evidence: 'done' }),
    ).rejects.toBeInstanceOf(ProvisioningNotInChargeError);

    await expect(
      service.recordAccessCut(ACTOR, 'task-1', { accessCutOn: '2026-11-23', evidence: 'cut' }),
    ).rejects.toBeInstanceOf(ProvisioningNotInChargeError);

    expect(work).toHaveBeenCalledTimes(2);
  });

  it('Ca 6: records MEMBER REDUCE -1 effective on next payment date (2026-12-05) when completing K2 MEMBERS revocation on 2026-11-10', async () => {
    const tx = {} as never;
    const recordMember = jest.fn().mockResolvedValue({ id: 'chg-reduce' });
    const order: string[] = [];
    const lockPeriodsAndLines = jest.fn().mockImplementation(() => {
      order.push('lines');

      return Promise.resolve([]);
    });
    const lockAssignment = jest.fn().mockImplementation(() => {
      order.push('assignment');

      return Promise.resolve({ id: 'asg-1', subscriptionId: 'sub-slack', effectiveFrom: '2026-11-01' });
    });
    const seatLedger = {
      findLineWithPeriodByPlan: jest.fn().mockResolvedValue({
        line: { id: 'line-slack', ledgerOpenedOn: '2026-11-01', closedOn: null },
        plan: { id: 'plan-slack', name: 'Slack', provisioningType: 'K2' },
        period: {
          id: 'sub-slack',
          seatCounting: 'MEMBERS',
          billingCycle: 'MONTHLY',
          renewalDate: '2026-11-05',
          endDate: null,
        },
      }),
      lockPeriodsAndLines,
      recordMember,
    } as unknown as SeatLedgerApi;
    const aftermath = new RevocationAftermath(
      { holdsKey: jest.fn(), takeBack: jest.fn() } as never,
      { tell: jest.fn().mockResolvedValue(0) } as never,
      { plan: jest.fn().mockResolvedValue(null), record: jest.fn() } as never,
      seatLedger,
      { getPlanRevocationInfo: () => Promise.resolve([{ provisioningType: 'K2' }]) } as never,
      { grantOfChain: () => Promise.resolve(null), chainOf: () => Promise.resolve([]) } as never,
      { listOf: () => Promise.resolve([]) } as never,
    );
    const service = new RevocationCompletionService(
      { markRevocationCompleted: jest.fn() } as never,
      {
        work: jest.fn((_actor, _id, action: { write: (ctx: unknown) => Promise<unknown> }) =>
          action
            .write({
              tx,
              task: {
                id: 'task-1',
                assignmentId: 'asg-1',
                assignment: { employeeId: 'emp-1', planId: 'plan-slack', subscriptionId: 'sub-slack' },
              },
              organizationId: 'org-1',
              now: new Date('2026-11-10T08:00:00.000Z'),
            })
            .then(() => ({ id: 'task-1' })),
        ),
      } as never,
      { views: jest.fn().mockResolvedValue([{ id: 'task-1' }]) } as never,
      {
        lock: lockAssignment,
        end: jest.fn(),
      } as never,
      { businessToday: jest.fn().mockResolvedValue('2026-11-10') } as never,
      { emit: jest.fn() } as never,
      aftermath,
      {
        attach: jest.fn().mockResolvedValue([]),
      } as never,
    );

    await service.complete(ACTOR, 'task-1', { completion: 'ACCOUNT_REMOVED', evidence: 'done' });

    expect(lockPeriodsAndLines).toHaveBeenCalledWith(tx, ['sub-slack'], ['line-slack']);
    expect(order).toEqual(['lines', 'assignment']);
    expect(recordMember).toHaveBeenCalledWith(tx, expect.objectContaining({ id: 'line-slack' }), -1, '2026-12-05', {
      recordedByEmployeeId: ACTOR.employeeId,
    });
  });
});

function evidenceCompletion() {
  let written: TaskWrite;
  const tasks = { markRevocationCompleted: jest.fn(), markAccessCut: jest.fn() };
  const ending = {
    lock: jest.fn().mockResolvedValue({ id: 'asg', effectiveFrom: '2026-11-01', validUntil: '2026-12-31' }),
    end: jest.fn(),
    shorten: jest.fn(),
  };
  const aftermath = {
    planOf: jest.fn().mockResolvedValue({ provisioningType: 'K2' }),
    completedOf: jest.fn().mockResolvedValue({}),
    lockLine: jest.fn(),
    keepChecklist: jest.fn().mockResolvedValue(null),
    follow: jest.fn().mockResolvedValue({ licenseKeyId: null }),
  };
  const attach = jest.fn((_tx: unknown, _actor: unknown, _task: string, ids: readonly string[] | undefined) =>
    Promise.resolve([...(ids ?? [])].sort()),
  );
  const task = {
    id: 'task',
    kind: 'REVOKE',
    status: 'IN_PROGRESS',
    assignmentId: 'asg',
    assignment: { employeeId: 'emp', planId: 'plan' },
    notBefore: null,
  } as TaskWorkContext['task'];
  const frame = {
    work: async (_actor: unknown, _id: string, action: { write: (ctx: TaskWorkContext) => Promise<TaskWrite> }) => {
      written = await action.write({
        tx: {} as never,
        task,
        organizationId: 'org',
        now: new Date('2026-11-28T00:00:00Z'),
      });
      return task;
    },
  };
  const service = new RevocationCompletionService(
    tasks as never,
    frame as never,
    { views: () => Promise.resolve([{}]) } as never,
    ending as never,
    { businessToday: () => Promise.resolve('2026-11-28') } as never,
    { emit: jest.fn() } as never,
    aftermath as never,
    { attach } as never,
  );
  return { service, tasks, ending, aftermath, attach, after: () => (written === false ? null : written?.after) };
}

describe('revocation completion evidence files', () => {
  it.each(['complete', 'cut'] as const)(
    'attaches before locks on %s and includes the sorted ids in audit',
    async (route) => {
      const h = evidenceCompletion();
      if (route === 'complete')
        await h.service.complete(ACTOR, 'task', {
          completion: 'ACCOUNT_REMOVED',
          evidence: 'done',
          evidenceDocumentIds: ['b', 'a'],
        });
      else
        await h.service.recordAccessCut(ACTOR, 'task', {
          accessCutOn: '2026-11-28',
          evidence: 'cut',
          evidenceDocumentIds: ['b', 'a'],
        });
      expect(h.after()).toMatchObject({ evidenceDocumentIds: ['a', 'b'] });
      expect(h.attach.mock.calls[0][3]).toEqual(['b', 'a']);
      expect(h.attach.mock.invocationCallOrder[0]).toBeLessThan(h.ending.lock.mock.invocationCallOrder[0]);
      if (route === 'complete')
        expect(h.attach.mock.invocationCallOrder[0]).toBeLessThan(h.aftermath.lockLine.mock.invocationCallOrder[0]);
    },
  );
  it.each(['complete', 'cut'] as const)('does not lock or write when attachment refuses on %s', async (route) => {
    const h = evidenceCompletion();
    h.attach.mockRejectedValue(new ProvisioningEvidenceFileInvalidError('NOT_FOUND'));
    const operation =
      route === 'complete'
        ? h.service.complete(ACTOR, 'task', {
            completion: 'ACCOUNT_REMOVED',
            evidence: 'done',
            evidenceDocumentIds: ['bad'],
          })
        : h.service.recordAccessCut(ACTOR, 'task', {
            accessCutOn: '2026-11-28',
            evidence: 'cut',
            evidenceDocumentIds: ['bad'],
          });
    await expect(operation).rejects.toMatchObject({
      name: 'ProvisioningEvidenceFileInvalidError',
      problem: 'NOT_FOUND',
    });
    expect(h.ending.lock).not.toHaveBeenCalled();
    expect(h.tasks.markRevocationCompleted).not.toHaveBeenCalled();
    expect(h.tasks.markAccessCut).not.toHaveBeenCalled();
  });
  it.each(['complete', 'cut'] as const)('keeps an empty audit array without files on %s', async (route) => {
    const h = evidenceCompletion();
    if (route === 'complete')
      await h.service.complete(ACTOR, 'task', { completion: 'ACCOUNT_REMOVED', evidence: 'done' });
    else await h.service.recordAccessCut(ACTOR, 'task', { accessCutOn: '2026-11-28', evidence: 'cut' });
    expect(h.after()).toMatchObject({ evidenceDocumentIds: [] });
  });
  it('still accepts an ALREADY_GONE note beside files without text evidence', async () => {
    const h = evidenceCompletion();
    await h.service.complete(ACTOR, 'task', {
      completion: 'ALREADY_GONE',
      evidence: '',
      note: 'confirmed gone',
      evidenceDocumentIds: ['a'],
    });
    expect(h.tasks.markRevocationCompleted).toHaveBeenCalledWith(
      expect.anything(),
      'task',
      ACTOR.appUserId,
      expect.objectContaining({ evidence: 'confirmed gone' }),
      expect.any(Date),
    );
    expect(h.after()).toMatchObject({ evidenceDocumentIds: ['a'] });
  });
});
