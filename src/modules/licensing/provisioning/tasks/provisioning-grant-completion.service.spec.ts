import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { ProvisioningTaskRecord } from '../provisioning-task.types';
import { ProvisioningGrantCompletion } from './provisioning-grant-completion.service';
import { ProvisioningService } from './provisioning.service';

const actor: AuthenticatedPrincipal = {
  subject: 'u',
  appUserId: 'u',
  sessionId: 's',
  employeeId: 'e',
  roles: ['IT_ADMIN'],
  directRoles: ['IT_ADMIN'],
};
const tx = {} as DbTx;
function setup(kind = 'GRANT') {
  const attach = jest.fn().mockResolvedValue(['a', 'b']);
  const markCompleted = jest.fn();
  const provisioningTypeOf = jest.fn().mockResolvedValue('K2');
  const reportExtended = jest.fn();
  const service = new ProvisioningGrantCompletion(
    { markCompleted } as never,
    { businessToday: () => Promise.resolve('2026-11-28') } as never,
    { get: () => ({ reportExtended }) } as never,
    { provisioningTypeOf } as never,
    { recordGranted: () => Promise.resolve({ effectiveFrom: '2026-11-28', expectedEndDate: null }) } as never,
    {} as never,
    { planGrant: () => null } as never,
    { attach } as never,
  );
  const task = {
    id: 'task',
    kind,
    requestId: kind === 'EXTEND' ? 'req' : null,
    assignmentId: 'asg',
    assignment: { planId: 'plan', employeeId: 'emp' },
    purchase: null,
  } as ProvisioningTaskRecord;
  return { service, attach, markCompleted, provisioningTypeOf, reportExtended, task };
}

describe('grant completion evidence order', () => {
  it.each(['GRANT', 'EXTEND'])('attaches once before any completion write of %s', async (kind) => {
    const h = setup(kind);
    await expect(
      h.service.write(
        tx,
        actor,
        { task: h.task, now: new Date(), organizationId: 'org' },
        { evidence: 'done', evidenceDocumentIds: ['b', 'a'] },
      ),
    ).resolves.toEqual(['a', 'b']);
    expect(h.attach).toHaveBeenCalledTimes(1);
    expect(h.attach).toHaveBeenCalledWith(tx, actor, 'task', ['b', 'a'], 'PROVISIONING_EVIDENCE');
    expect(h.attach.mock.invocationCallOrder[0]).toBeLessThan(h.markCompleted.mock.invocationCallOrder[0]);
    if (kind === 'GRANT')
      expect(h.attach.mock.invocationCallOrder[0]).toBeLessThan(h.provisioningTypeOf.mock.invocationCallOrder[0]);
  });
  it('does not mark completed or acquire plan facts when attachment refuses', async () => {
    const h = setup();
    h.attach.mockRejectedValue(new Error('refused'));
    await expect(
      h.service.write(
        tx,
        actor,
        { task: h.task, now: new Date(), organizationId: 'org' },
        { evidence: 'done', evidenceDocumentIds: ['bad'] },
      ),
    ).rejects.toThrow('refused');
    expect(h.markCompleted).not.toHaveBeenCalled();
    expect(h.provisioningTypeOf).not.toHaveBeenCalled();
  });
  it('adds an empty evidenceDocumentIds array to the completion audit without files', async () => {
    let after: unknown;
    const h = setup();
    const service = new ProvisioningService(
      {} as never,
      {
        work: async (
          _actor: unknown,
          _id: string,
          action: { write: (ctx: unknown) => Promise<{ after: unknown }> },
        ) => {
          after = (await action.write({ tx, task: h.task, now: new Date(), organizationId: 'org' })).after;
          return h.task;
        },
      } as never,
      { views: () => Promise.resolve([{}]) } as never,
      {} as never,
      {} as never,
      {} as never,
      { write: () => Promise.resolve([]) } as never,
      {} as never,
    );
    await service.complete(actor, 'task', { evidence: 'done' });
    expect(after).toMatchObject({ status: 'COMPLETED', evidenceDocumentIds: [] });
  });
});
