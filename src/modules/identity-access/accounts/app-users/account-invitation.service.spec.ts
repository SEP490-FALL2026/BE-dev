import { TransactionRunner, type DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../../audit/public/audit.api';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import { AccountRecordService } from '../account-record.service';
import { RoleGrantService } from '../role-grant.service';
import { LoginEmailInvalidError, LoginEmailNotWorkEmailError, LoginEmailRequiredError } from '../account.errors';
import { AccountInvitationService } from './account-invitation.service';
import { InvitationMailService } from './invitation-mail.service';

const actor: AuthenticatedPrincipal = {
  appUserId: 'admin',
  employeeId: 'admin-person',
  roles: ['SUPER_ADMIN'],
  subject: 'admin',
  sessionId: 'session',
  directRoles: ['SUPER_ADMIN'],
};

function setup(workEmail: string | null) {
  const employee = { id: 'person', status: 'ACTIVE', workEmail };
  const createAppUser = jest.fn().mockResolvedValue({ id: 'new-account' });
  const send = jest.fn().mockResolvedValue(undefined);
  const record = jest.fn().mockResolvedValue(undefined);
  const service = new AccountInvitationService(
    {
      createAppUser,
      findAccountIdByEmployee: jest.fn().mockResolvedValue(null),
    } as unknown as AccountRecordService,
    {
      grantRole: jest.fn().mockResolvedValue({ id: 'grant' }),
      financeIsHeld: jest.fn(),
    } as unknown as RoleGrantService,
    {
      getOrganization: jest.fn().mockResolvedValue({ id: 'org' }),
      getEmployee: jest.fn().mockResolvedValue(employee),
      lockEmployeeForShare: jest.fn().mockResolvedValue(undefined),
    } as unknown as OrganizationReadApi,
    { record } as unknown as AuditApi,
    { send } as unknown as InvitationMailService,
    { run: jest.fn((work: (tx: DbTx) => Promise<unknown>) => work({} as DbTx)) } as unknown as TransactionRunner,
  );
  return { service, createAppUser, send, record };
}

describe('AccountInvitationService.createAccount: the work email is the login email (FX-T7)', () => {
  it('stores the trimmed work email when no loginEmail is sent', async () => {
    const s = setup(' Bao.Nguyen@Acme.vn ');
    await s.service.createAccount(actor, { employeeId: 'person' });
    expect(s.createAppUser).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ loginEmail: 'Bao.Nguyen@Acme.vn', normalizedLoginEmail: 'bao.nguyen@acme.vn' }),
    );
    expect(s.send).toHaveBeenCalledWith(
      expect.anything(),
      actor,
      'org',
      'new-account',
      'Bao.Nguyen@Acme.vn',
      expect.anything(),
      expect.any(Date),
    );
  });

  it('ignores a sent loginEmail equal to the work email apart from case, and never stores the sent text', async () => {
    const s = setup('Bao.Nguyen@Acme.vn');
    await s.service.createAccount(actor, { employeeId: 'person', loginEmail: 'BAO.nguyen@acme.VN' });
    expect(s.createAppUser).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ loginEmail: 'Bao.Nguyen@Acme.vn' }),
    );
  });

  it('refuses a loginEmail that is a valid address but not the work email, before any write', async () => {
    const s = setup('bao@acme.vn');
    await expect(
      s.service.createAccount(actor, { employeeId: 'person', loginEmail: 'other@acme.vn' }),
    ).rejects.toBeInstanceOf(LoginEmailNotWorkEmailError);
    expect(s.createAppUser).not.toHaveBeenCalled();
    expect(s.record).not.toHaveBeenCalled();
  });

  it('keeps LOGIN_EMAIL_INVALID for a malformed loginEmail', async () => {
    const s = setup('bao@acme.vn');
    await expect(s.service.createAccount(actor, { employeeId: 'person', loginEmail: 'nope' })).rejects.toBeInstanceOf(
      LoginEmailInvalidError,
    );
  });

  it('answers LOGIN_EMAIL_REQUIRED when the employee has no work email, even if a loginEmail is sent', async () => {
    const s = setup(null);
    await expect(s.service.createAccount(actor, { employeeId: 'person' })).rejects.toBeInstanceOf(
      LoginEmailRequiredError,
    );
    await expect(
      s.service.createAccount(actor, { employeeId: 'person', loginEmail: 'x@acme.vn' }),
    ).rejects.toBeInstanceOf(LoginEmailRequiredError);
    expect(s.createAppUser).not.toHaveBeenCalled();
  });
});
