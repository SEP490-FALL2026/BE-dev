import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { ControlledWaitQueryService } from './controlled-wait-query.service';

describe('ControlledWaitQueryService acting scope (S2-2)', () => {
  const itActor = { employeeId: 'it-sub', roles: ['IT_ADMIN'] } as unknown as AuthenticatedPrincipal;
  const saActor = { employeeId: 'sa-1', roles: ['SUPER_ADMIN'] } as unknown as AuthenticatedPrincipal;

  it('scopes IT Admin queries via getItAdminActingScope', async () => {
    const findUsableItAdminEmployeeIds = jest.fn().mockResolvedValue(new Set(['it-sub']));
    const getItAdminActingScope = jest.fn(
      async (_id: string, usable: (ids: readonly string[]) => Promise<ReadonlySet<string>>) => {
        await usable(['it-sub']);
        return ['dept-1'];
      },
    );
    const waits = { page: jest.fn().mockResolvedValue({ rows: [], total: 0 }) };
    const service = new ControlledWaitQueryService(
      waits as never,
      {
        getItAdminActingScope,
        getEmployees: jest.fn().mockResolvedValue([]),
        getDepartmentBriefs: jest.fn().mockResolvedValue([]),
      } as never,
      { findUsableItAdminEmployeeIds } as never,
    );

    const page = await service.page(itActor, { page: 1, pageSize: 20 });

    expect(page.items).toEqual([]);
    expect(getItAdminActingScope).toHaveBeenCalledWith('it-sub', expect.any(Function));
    expect(findUsableItAdminEmployeeIds).toHaveBeenCalledWith(['it-sub']);
    expect(waits.page).toHaveBeenCalledWith(['dept-1'], 0, 20);
  });

  it('does not call getItAdminActingScope for SUPER_ADMIN', async () => {
    const getItAdminActingScope = jest.fn();
    const waits = { page: jest.fn().mockResolvedValue({ rows: [], total: 0 }) };
    const service = new ControlledWaitQueryService(
      waits as never,
      {
        getItAdminActingScope,
        getEmployees: jest.fn().mockResolvedValue([]),
        getDepartmentBriefs: jest.fn().mockResolvedValue([]),
      } as never,
      { findUsableItAdminEmployeeIds: jest.fn() } as never,
    );

    await service.page(saActor, { page: 1, pageSize: 20 });

    expect(getItAdminActingScope).not.toHaveBeenCalled();
    expect(waits.page).toHaveBeenCalledWith(null, 0, 20);
  });
});
