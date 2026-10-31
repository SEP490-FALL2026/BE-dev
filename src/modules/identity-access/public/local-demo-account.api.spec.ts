import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { AccountRecordService } from '../accounts/account-record.service';
import { CredentialService } from '../credentials/credential.service';
import { RoleGrantService } from '../accounts/role-grant.service';
import { DemoAccountRoleError } from './identity-access.errors';
import { LocalDemoAccountApi } from './local-demo-account.api';
import { DemoAccountRole } from './identity-access.types';

describe('LocalDemoAccountApi', () => {
  const tx = {} as DbTx;
  const anyDate: unknown = expect.any(Date);
  const organizationId = 'org-1';
  const demoEmail = 'it.admin@demo.slm.test';

  function build(state: {
    accountId?: string | null;
    account?: { status: string; activationState: string; loginEmail: string } | null;
    roles?: string[];
    emailOwner?: { id: string } | null;
    financeHeld?: boolean;
  }) {
    const accounts = {
      findAccountIdByEmployee: jest.fn().mockResolvedValue(state.accountId ?? null),
      findAccountRecord: jest.fn().mockResolvedValue(state.account ?? null),
      findAccountByLoginEmail: jest.fn().mockResolvedValue(state.emailOwner ?? null),
      createAppUser: jest.fn().mockResolvedValue({ id: 'u-new' }),
    };
    const grants = {
      effectiveRoles: jest.fn().mockResolvedValue(state.roles ?? []),
      financeIsHeld: jest.fn().mockResolvedValue(state.financeHeld ?? false),
      grantRole: jest.fn().mockResolvedValue({ id: 'g-1' }),
    };
    const credentials = { createCredential: jest.fn().mockResolvedValue(undefined) };
    const service = new LocalDemoAccountApi(
      accounts as unknown as AccountRecordService,
      grants as unknown as RoleGrantService,
      credentials as unknown as CredentialService,
    );
    return { service, accounts, grants, credentials };
  }

  const ask = (role: DemoAccountRole = 'IT_ADMIN', employeeId: string | null = 'e-1') => ({
    organizationId,
    employeeId,
    loginEmail: 'IT.Admin@demo.slm.test',
    role,
  });
  const usable = { status: 'ACTIVE', activationState: 'ACTIVATED', loginEmail: demoEmail };

  it('is absent for a new employee whose email and role are free', async () => {
    const { service, accounts } = build({});

    await expect(service.describeDemoAccount(tx, ask('IT_ADMIN', null))).resolves.toEqual({ state: 'absent' });
    expect(accounts.findAccountByLoginEmail).toHaveBeenCalledWith(organizationId, demoEmail);
  });

  it('is present only for an active, activated account with this login email and exactly this role', async () => {
    const present = build({ accountId: 'u-1', account: usable, roles: ['IT_ADMIN'] });
    await expect(present.service.describeDemoAccount(tx, ask())).resolves.toEqual({ state: 'present' });

    const differences = [
      { account: { ...usable, status: 'LOCKED' }, roles: ['IT_ADMIN'] },
      { account: { ...usable, activationState: 'INVITED' }, roles: ['IT_ADMIN'] },
      { account: { ...usable, loginEmail: 'someone@else.vn' }, roles: ['IT_ADMIN'] },
      { account: usable, roles: [] },
      { account: usable, roles: ['IT_ADMIN', 'EMPLOYEE'] },
    ];
    for (const difference of differences) {
      const { service } = build({ accountId: 'u-1', ...difference });
      await expect(service.describeDemoAccount(tx, ask())).resolves.toEqual({
        state: 'conflict',
        reason: 'ACCOUNT_DIFFERS',
      });
    }
  });

  it('conflicts when the login email belongs to another account, or FINANCE is held by someone else', async () => {
    await expect(build({ emailOwner: { id: 'u-9' } }).service.describeDemoAccount(tx, ask())).resolves.toEqual({
      state: 'conflict',
      reason: 'LOGIN_EMAIL_TAKEN',
    });
    await expect(build({ financeHeld: true }).service.describeDemoAccount(tx, ask('FINANCE'))).resolves.toEqual({
      state: 'conflict',
      reason: 'FINANCE_HELD_ELSEWHERE',
    });
  });

  it('creates an activated account with its credential and exactly one direct grant, in the caller transaction', async () => {
    const { service, accounts, credentials, grants } = build({});

    await expect(
      service.createDemoAccount(tx, {
        organizationId,
        employeeId: 'e-1',
        loginEmail: ' IT.Admin@demo.slm.test ',
        role: 'IT_ADMIN',
        passwordHash: 'hash',
        hashPolicyVersion: 1,
      }),
    ).resolves.toEqual({ appUserId: 'u-new' });
    expect(accounts.createAppUser).toHaveBeenCalledWith(tx, {
      organizationId,
      employeeId: 'e-1',
      loginEmail: 'IT.Admin@demo.slm.test',
      normalizedLoginEmail: demoEmail,
      status: 'ACTIVE',
      activationState: 'ACTIVATED',
      emailVerificationSource: 'BOOTSTRAP_ASSERTED',
      emailVerifiedAt: anyDate,
    });
    expect(credentials.createCredential).toHaveBeenCalledWith(tx, 'u-new', 'hash', 1);
    expect(grants.grantRole).toHaveBeenCalledTimes(1);
    expect(grants.grantRole).toHaveBeenCalledWith(tx, { organizationId, appUserId: 'u-new', role: 'IT_ADMIN' });
  });

  it.each(['MANAGER', 'SPENDING_APPROVER', 'SUPER_ADMIN', 'ADMIN'])(
    'refuses the role %s before writing anything',
    async (role) => {
      const { service, accounts, grants } = build({});

      await expect(
        service.createDemoAccount(tx, {
          organizationId,
          employeeId: 'e-1',
          loginEmail: 'x@demo.slm.test',
          role: role as DemoAccountRole,
          passwordHash: 'hash',
          hashPolicyVersion: 1,
        }),
      ).rejects.toBeInstanceOf(DemoAccountRoleError);
      expect(accounts.createAppUser).not.toHaveBeenCalled();
      expect(grants.grantRole).not.toHaveBeenCalled();
    },
  );
});
