import { TransactionRunner, type DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../../audit/public/audit.api';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import { AccountRecordService } from '../account-record.service';
import { RoleGrantService } from '../role-grant.service';
import {
  AccountNotFoundError,
  ManagerStillHeadingError,
  RoleRequestRefusedError,
  SelfChangeForbiddenError,
} from '../account.errors';
import { AccountStatusService } from './account-status.service';
import { SpendingApproverGrantService } from './spending-approver-grant.service';

const actor: AuthenticatedPrincipal = {
  appUserId: 'admin',
  employeeId: 'admin-person',
  roles: ['SUPER_ADMIN'],
  subject: 'admin',
  sessionId: 'session',
  directRoles: ['SUPER_ADMIN'],
};

function setup(held = ['EMPLOYEE']) {
  const order: string[] = [];
  const account = {
    id: 'target',
    employeeId: 'person',
    organizationId: 'org',
    status: 'ACTIVE',
    activationState: 'ACTIVATED',
  };
  const readAccount = jest.fn(() => {
    order.push('read');
    return Promise.resolve(account);
  });
  const lockAndReadAccount = jest.fn(() => {
    order.push('account');
    return Promise.resolve(account);
  });
  const lockApprovalRolesForChange = jest.fn(() => {
    order.push('approval');
    return Promise.resolve();
  });
  const lockEmployeeForShare = jest.fn(() => {
    order.push('employee');
    return Promise.resolve();
  });
  const effectiveRoles = jest.fn(() => {
    order.push('roles');
    return Promise.resolve(held);
  });
  const revokeRole = jest.fn(() => {
    order.push('revoke');
    return Promise.resolve(true);
  });
  const grantRole = jest.fn(() => {
    order.push('grant');
    return Promise.resolve({ id: 'grant' });
  });
  const record = jest.fn(() => {
    order.push('audit');
    return Promise.resolve();
  });
  const headPeriodsFrom = jest.fn().mockResolvedValue([]);
  const financeIsHeld = jest.fn().mockResolvedValue(false);
  const check = jest.fn().mockResolvedValue(undefined);
  const run = jest.fn((work: (tx: DbTx) => Promise<unknown>) => work({} as DbTx));
  const service = new AccountStatusService(
    { readAccount, lockAndReadAccount } as unknown as AccountRecordService,
    { lockApprovalRolesForChange, effectiveRoles, revokeRole, grantRole, financeIsHeld } as unknown as RoleGrantService,
    undefined!,
    undefined!,
    { record } as unknown as AuditApi,
    { lockEmployeeForShare, headPeriodsFrom } as unknown as OrganizationReadApi,
    { check } as unknown as SpendingApproverGrantService,
    { run } as unknown as TransactionRunner,
  );
  return { service, order, run, readAccount, revokeRole, grantRole, record, headPeriodsFrom, check };
}

describe('AccountStatusService.changeRole', () => {
  it('locks every role replacement in the same order, revokes before granting, and records one before/after audit', async () => {
    const s = setup();
    await s.service.changeRole(actor, 'target', 'IT_ADMIN');
    expect(s.order).toEqual(['approval', 'read', 'employee', 'account', 'roles', 'revoke', 'grant', 'audit']);
    expect(s.revokeRole).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ role: 'EMPLOYEE' }));
    expect(s.grantRole).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ role: 'IT_ADMIN' }));
    expect(s.record).toHaveBeenCalledTimes(1);
    expect(s.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'ROLE.CHANGED',
        before: { role: 'EMPLOYEE' },
        after: { role: 'IT_ADMIN' },
      }),
    );
  });
  it('does not write or audit the same role', async () => {
    const s = setup(['IT_ADMIN']);
    await s.service.changeRole(actor, 'target', 'IT_ADMIN');
    expect(s.revokeRole).not.toHaveBeenCalled();
    expect(s.grantRole).not.toHaveBeenCalled();
    expect(s.record).not.toHaveBeenCalled();
  });
  it('refuses self changes and a requested Super Admin role before opening a transaction', async () => {
    const s = setup();
    await expect(s.service.changeRole(actor, 'admin', 'EMPLOYEE')).rejects.toBeInstanceOf(SelfChangeForbiddenError);
    await expect(s.service.changeRole(actor, 'target', 'SUPER_ADMIN')).rejects.toBeInstanceOf(RoleRequestRefusedError);
    expect(s.run).not.toHaveBeenCalled();
  });
  it('refuses replacing the existing Super Admin role', async () => {
    const s = setup(['SUPER_ADMIN']);
    await expect(s.service.changeRole(actor, 'target', 'EMPLOYEE')).rejects.toBeInstanceOf(RoleRequestRefusedError);
    expect(s.revokeRole).not.toHaveBeenCalled();
  });
  it('refuses a missing account before taking its employee lock', async () => {
    const s = setup();
    s.readAccount.mockResolvedValueOnce(null!);
    await expect(s.service.changeRole(actor, 'target', 'EMPLOYEE')).rejects.toBeInstanceOf(AccountNotFoundError);
    expect(s.order).toEqual(['approval']);
    expect(s.readAccount).toHaveBeenCalledTimes(1);
  });
  it('checks current and future Manager duties before checking the role being received', async () => {
    const s = setup(['MANAGER']);
    s.headPeriodsFrom.mockResolvedValueOnce([{ departmentId: 'd', validFrom: '2027-01-01', timing: 'FUTURE' }]);
    await expect(s.service.changeRole(actor, 'target', 'SPENDING_APPROVER')).rejects.toBeInstanceOf(
      ManagerStillHeadingError,
    );
    expect(s.check).not.toHaveBeenCalled();
    expect(s.revokeRole).not.toHaveBeenCalled();
  });
});
