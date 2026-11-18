import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AccessRequestSuperAdminCannotRequestError } from '../access-request/access-request.errors';
import { ReturnRequestService } from './return-request.service';

describe('ReturnRequestService sender boundary', () => {
  it('refuses the Super Admin before opening a transaction', async () => {
    const run = jest.fn();
    const service = new ReturnRequestService(
      { run } as unknown as TransactionRunner,
      undefined!,
      undefined!,
      undefined!,
      undefined!,
      undefined!,
      undefined!,
    );
    const actor: AuthenticatedPrincipal = {
      subject: 'u1',
      appUserId: 'u1',
      sessionId: 's1',
      employeeId: 'e1',
      directRoles: ['SUPER_ADMIN'],
      roles: ['SUPER_ADMIN'],
    };
    await expect(service.submit(actor, { assignmentId: 'seat', reason: 'No longer needed' })).rejects.toBeInstanceOf(
      AccessRequestSuperAdminCannotRequestError,
    );
    expect(run).not.toHaveBeenCalled();
  });
});
