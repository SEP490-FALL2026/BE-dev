import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { AccountRecordService } from '../accounts/account-record.service';
import { RoleGrantService } from '../accounts/role-grant.service';
import { IdentityAccessInspectionApi } from './identity-access-inspection.api';

describe('IdentityAccessInspectionApi', () => {
  const tx = {} as DbTx;

  function build(state: {
    holderId: string | null;
    holder?: { status: string; activationState: string; loginEmail: string; passwordHash?: string };
    byState?: { status: string; activationState: string; count: number }[];
    byRole?: [string, number][];
  }) {
    const accounts = {
      countAccountsByState: jest.fn().mockResolvedValue(state.byState ?? []),
      findAccountRecord: jest.fn().mockResolvedValue(state.holder ?? null),
      findUsableItAdminEmployeeIds: jest.fn().mockResolvedValue(new Set(['e-1'])),
    };
    const grants = {
      findSuperAdminHolderId: jest.fn().mockResolvedValue(state.holderId),
      countEffectiveGrantsByRole: jest.fn().mockResolvedValue(new Map(state.byRole ?? [])),
    };
    const service = new IdentityAccessInspectionApi(
      accounts as unknown as AccountRecordService,
      grants as unknown as RoleGrantService,
    );

    return { service, accounts, grants };
  }

  it('reports every state and role, zero included, all read in the caller transaction, and no approval role of the old configuration', async () => {
    const { service, accounts, grants } = build({
      holderId: 'u-1',
      holder: {
        status: 'ACTIVE',
        activationState: 'ACTIVATED',
        loginEmail: 'bao@acme.vn',
        passwordHash: '$argon2id$x',
      },
      byState: [
        { status: 'ACTIVE', activationState: 'ACTIVATED', count: 3 },
        { status: 'LOCKED', activationState: 'INVITED', count: 1 },
      ],
      byRole: [
        ['SUPER_ADMIN', 1],
        ['IT_ADMIN', 2],
      ],
    });

    await expect(service.accountInventory(tx)).resolves.toEqual({
      superAdmin: { holders: 1, status: 'ACTIVE', activationState: 'ACTIVATED', loginEmail: 'bao@acme.vn' },
      accountsByState: { ACTIVE_ACTIVATED: 3, ACTIVE_INVITED: 0, LOCKED_ACTIVATED: 0, LOCKED_INVITED: 1 },
      directRoles: { SUPER_ADMIN: 1, IT_ADMIN: 2, FINANCE: 0, EMPLOYEE: 0, MANAGER: 0, SPENDING_APPROVER: 0 },
    });
    expect(grants.findSuperAdminHolderId).toHaveBeenCalledWith(tx);
    expect(accounts.findAccountRecord).toHaveBeenCalledWith('u-1', tx);
    expect(accounts.countAccountsByState).toHaveBeenCalledWith(tx);
    expect(grants.countEffectiveGrantsByRole).toHaveBeenCalledWith(tx);
  });

  it('never passes on a credential field of the Super Admin account', async () => {
    const { service } = build({
      holderId: 'u-1',
      holder: {
        status: 'ACTIVE',
        activationState: 'ACTIVATED',
        loginEmail: 'bao@acme.vn',
        passwordHash: '$argon2id$x',
      },
    });

    expect(JSON.stringify(await service.accountInventory(tx))).not.toContain('argon2');
  });

  it('reports no Super Admin when nobody holds the grant', async () => {
    const { service, accounts } = build({ holderId: null });

    await expect(service.accountInventory(tx)).resolves.toMatchObject({ superAdmin: null });
    expect(accounts.findAccountRecord).not.toHaveBeenCalled();
  });

  it('answers which of these employees are a usable IT Admin, in the caller transaction', async () => {
    const { service, accounts } = build({ holderId: null });

    await expect(service.usableItAdminEmployeeIds(['e-1', 'e-2'], tx)).resolves.toEqual(new Set(['e-1']));
    expect(accounts.findUsableItAdminEmployeeIds).toHaveBeenCalledWith(['e-1', 'e-2'], tx);
  });
});
