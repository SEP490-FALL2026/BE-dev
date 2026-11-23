import { RequestStatusRecipientsService } from './request-status-recipients.service';
import type { RequestFacts } from './request-status.types';

const request: RequestFacts = {
  id: 'req-1',
  organizationId: 'org-1',
  type: 'GRANT',
  branch: 'NEW_SOFTWARE',
  requesterEmployeeId: 'emp-1',
  beneficiaryEmployeeIds: ['emp-1'],
  departmentId: 'dept-1',
  withdrawnByEmployeeId: null,
  withdrawalReason: null,
};

describe('RequestStatusRecipientsService acting IT Admin resolution (criterion (u), H18)', () => {
  function setup(options: {
    acting?: { inCharge: string | null; substitute: string | null; defaultAssignee: string | null; actors: string[] };
    superAdmin?: string | null;
  }) {
    const findUsableItAdminEmployeeIds = jest.fn().mockResolvedValue(new Set(options.acting?.actors ?? []));
    const findUsableSuperAdminEmployeeId = jest.fn().mockResolvedValue(options.superAdmin ?? null);
    const findAllUsableItAdminEmployeeIds = jest.fn().mockResolvedValue(['unused']);
    const itAdminsActingFor = jest.fn(
      async (_depts: readonly string[], usable: (ids: readonly string[]) => Promise<ReadonlySet<string>>) => {
        await usable(['it-1', 'it-sub']);
        return options.acting ? new Map([['dept-1', options.acting]]) : new Map();
      },
    );

    const service = new RequestStatusRecipientsService(
      { itAdminsActingFor } as never,
      {
        findUsableItAdminEmployeeIds,
        findUsableSuperAdminEmployeeId,
        findAllUsableItAdminEmployeeIds,
      } as never,
    );

    return {
      service,
      itAdminsActingFor,
      findUsableItAdminEmployeeIds,
      findUsableSuperAdminEmployeeId,
      findAllUsableItAdminEmployeeIds,
    };
  }

  it('resolves IT_ADMIN via itAdminsActingFor defaultAssignee (substitute ?? inCharge) for request.departmentId', async () => {
    const { service, itAdminsActingFor, findUsableItAdminEmployeeIds } = setup({
      acting: { inCharge: 'it-1', substitute: 'it-sub', defaultAssignee: 'it-sub', actors: ['it-1', 'it-sub'] },
    });

    const holders = await service.holdersOf(['IT_ADMIN'], request, '2026-11-24');

    expect(holders.itAdminEmployeeId).toBe('it-sub');
    expect(itAdminsActingFor).toHaveBeenCalledWith(['dept-1'], expect.any(Function));
    expect(findUsableItAdminEmployeeIds).toHaveBeenCalledWith(['it-1', 'it-sub']);
  });

  it('resolves GRANT_IT_ADMINS to acting actors when present without calling Super Admin or all IT Admins', async () => {
    const { service, findUsableSuperAdminEmployeeId, findAllUsableItAdminEmployeeIds } = setup({
      acting: { inCharge: 'it-1', substitute: 'it-sub', defaultAssignee: 'it-sub', actors: ['it-1', 'it-sub'] },
      superAdmin: 'sa-1',
    });

    const holders = await service.holdersOf(['GRANT_IT_ADMINS'], request, '2026-11-24');

    expect(holders.grantItAdminEmployeeIds).toEqual(['it-1', 'it-sub']);
    expect(findUsableSuperAdminEmployeeId).not.toHaveBeenCalled();
    expect(findAllUsableItAdminEmployeeIds).not.toHaveBeenCalled();
  });

  it('falls back to Super Admin for GRANT_IT_ADMINS when no acting IT Admin exists', async () => {
    const { service, findUsableSuperAdminEmployeeId, findAllUsableItAdminEmployeeIds } = setup({
      acting: { inCharge: null, substitute: null, defaultAssignee: null, actors: [] },
      superAdmin: 'sa-1',
    });

    const holders = await service.holdersOf(['GRANT_IT_ADMINS'], request, '2026-11-24');

    expect(holders.grantItAdminEmployeeIds).toEqual(['sa-1']);
    expect(findUsableSuperAdminEmployeeId).toHaveBeenCalledTimes(1);
    expect(findAllUsableItAdminEmployeeIds).not.toHaveBeenCalled();
  });

  it('returns empty GRANT_IT_ADMINS when neither acting IT Admin nor usable Super Admin exists', async () => {
    const { service } = setup({ acting: undefined, superAdmin: null });

    const holders = await service.holdersOf(['GRANT_IT_ADMINS'], request, '2026-11-24');

    expect(holders.grantItAdminEmployeeIds).toEqual([]);
  });
});
