import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AssessmentQueueReachService } from './assessment-queue-reach.service';

describe('AssessmentQueueReachService acting scope (S2-2)', () => {
  const actor = { employeeId: 'it-1' } as unknown as AuthenticatedPrincipal;

  it('reads departments via getItAdminActingScope and filters by asked department', async () => {
    const findUsableItAdminEmployeeIds = jest.fn().mockResolvedValue(new Set(['it-1']));
    const getItAdminActingScope = jest.fn(
      async (_id: string, usable: (ids: readonly string[]) => Promise<ReadonlySet<string>>) => {
        await usable(['it-1']);
        return ['dept-1', 'dept-2'];
      },
    );
    const service = new AssessmentQueueReachService(
      { getItAdminActingScope } as never,
      { findUsableItAdminEmployeeIds } as never,
    );

    await expect(service.departmentsOf(actor)).resolves.toEqual(['dept-1', 'dept-2']);
    await expect(service.departmentsOf(actor, 'dept-2')).resolves.toEqual(['dept-2']);
    await expect(service.departmentsOf(actor, 'dept-outside')).resolves.toEqual([]);
    expect(getItAdminActingScope).toHaveBeenCalledWith('it-1', expect.any(Function));
    expect(findUsableItAdminEmployeeIds).toHaveBeenCalledWith(['it-1']);
  });
});
