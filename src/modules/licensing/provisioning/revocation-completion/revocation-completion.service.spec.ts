import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { ProvisioningNotInChargeError } from '../provisioning.errors';
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
});
