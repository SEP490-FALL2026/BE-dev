import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogLinkRefusedError } from '../assessment/assessment.errors';
import { CatalogLinkDepartmentListService } from './catalog-link-department-list.service';

const tx = {} as DbTx;
const actor = { employeeId: 'it-1' } as unknown as AuthenticatedPrincipal;

describe('CatalogLinkDepartmentListService acting scope (S2-2)', () => {
  function setup(scope: string[]) {
    const findUsableItAdminEmployeeIds = jest.fn().mockResolvedValue(new Set(['it-1']));
    const getItAdminActingScope = jest.fn(
      async (_id: string, usable: (ids: readonly string[]) => Promise<ReadonlySet<string>>) => {
        await usable(['it-1']);
        return scope;
      },
    );
    const addDepartmentSoftwareFromCatalogLink = jest.fn().mockResolvedValue({ added: true });
    const service = new CatalogLinkDepartmentListService(
      { addDepartmentSoftwareFromCatalogLink } as never,
      { getItAdminActingScope } as never,
      { findUsableItAdminEmployeeIds } as never,
    );

    return { service, getItAdminActingScope, findUsableItAdminEmployeeIds, addDepartmentSoftwareFromCatalogLink };
  }

  it('adds when department is in acting scope', async () => {
    const { service, getItAdminActingScope, findUsableItAdminEmployeeIds, addDepartmentSoftwareFromCatalogLink } =
      setup(['dept-1']);

    await expect(service.add(tx, actor, 'dept-1', 'app-1', 'plan-1')).resolves.toEqual({ added: true });
    expect(getItAdminActingScope).toHaveBeenCalledWith('it-1', expect.any(Function), tx);
    expect(findUsableItAdminEmployeeIds).toHaveBeenCalledWith(['it-1'], tx);
    expect(addDepartmentSoftwareFromCatalogLink).toHaveBeenCalledWith(tx, actor, {
      departmentId: 'dept-1',
      applicationId: 'app-1',
      planId: 'plan-1',
    });
  });

  it('refuses with DEPARTMENT_OUT_OF_SCOPE when department is outside acting scope', async () => {
    const { service, addDepartmentSoftwareFromCatalogLink } = setup(['dept-other']);

    await expect(service.add(tx, actor, 'dept-1', 'app-1', 'plan-1')).rejects.toEqual(
      new CatalogLinkRefusedError('DEPARTMENT_OUT_OF_SCOPE'),
    );
    expect(addDepartmentSoftwareFromCatalogLink).not.toHaveBeenCalled();
  });
});
