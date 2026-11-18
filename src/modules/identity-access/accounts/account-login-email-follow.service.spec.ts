import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../audit/public/audit.api';
import { AccountLoginEmailFollowService } from './account-login-email-follow.service';
import type { AppUserRepo } from './app-user.repo';

const actor: AuthenticatedPrincipal = {
  appUserId: 'admin',
  employeeId: 'admin-person',
  roles: ['SUPER_ADMIN'],
  subject: 'admin',
  sessionId: 'session',
  directRoles: ['SUPER_ADMIN'],
};
const tx = { name: 'tx' } as unknown as DbTx;
const input = { actor, organizationId: 'org', employeeId: 'emp', workEmail: ' New.Name+tag@Corp.test ' };

function setup(options: { account?: { id: string; loginEmail: string } | null; holder?: string | null } = {}) {
  const order: string[] = [];
  const account = options.account === undefined ? { id: 'acc', loginEmail: 'old@corp.test' } : options.account;
  const accounts = {
    findAccountIdByEmployee: jest.fn(() => Promise.resolve(account?.id ?? null)),
    lockAppUser: jest.fn(() => {
      order.push('lock');
      return Promise.resolve(true);
    }),
    findLoginEmailOfEmployee: jest.fn(() => {
      order.push('read');
      return Promise.resolve(account);
    }),
    findAccountIdByNormalizedLoginEmail: jest.fn(() => Promise.resolve(options.holder ?? null)),
    moveLoginEmail: jest.fn(() => {
      order.push('move');
      return Promise.resolve();
    }),
  };
  const audit = {
    record: jest.fn(() => {
      order.push('audit');
      return Promise.resolve();
    }),
  };
  const service = new AccountLoginEmailFollowService(accounts as unknown as AppUserRepo, audit as unknown as AuditApi);

  return { service, accounts, audit, order };
}

describe('AccountLoginEmailFollowService', () => {
  it('does nothing for a person with no account', async () => {
    const { service, accounts, audit } = setup({ account: null });

    await expect(service.follow(tx, input)).resolves.toEqual({ result: 'NO_ACCOUNT', moved: null });

    expect(accounts.lockAppUser).not.toHaveBeenCalled();
    expect(accounts.moveLoginEmail).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('refuses to follow a cleared work email for a person with an account, and writes nothing', async () => {
    const { service, accounts, audit } = setup();

    await expect(service.follow(tx, { ...input, workEmail: null })).resolves.toEqual({
      result: 'ACCOUNT_NEEDS_EMAIL',
      moved: null,
    });

    expect(accounts.lockAppUser).not.toHaveBeenCalled();
    expect(accounts.moveLoginEmail).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('answers a cleared work email of a person with no account as no account', async () => {
    const { service } = setup({ account: null });

    await expect(service.follow(tx, { ...input, workEmail: null })).resolves.toEqual({
      result: 'NO_ACCOUNT',
      moved: null,
    });
  });

  it('locks the account, then moves the login email with its normalized form and audits it, touching no verification', async () => {
    const { service, accounts, audit, order } = setup();

    await expect(service.follow(tx, input)).resolves.toEqual({
      result: 'FOLLOWED',
      moved: { previousEmail: 'old@corp.test', currentEmail: 'New.Name+tag@Corp.test' },
    });

    expect(order).toEqual(['lock', 'read', 'move', 'audit']);
    expect(accounts.moveLoginEmail).toHaveBeenCalledWith(tx, 'acc', {
      loginEmail: 'New.Name+tag@Corp.test',
      normalizedLoginEmail: 'new.name@corp.test',
    });
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: 'APP_USER.LOGIN_EMAIL_CHANGED',
        resourceType: 'AppUser',
        resourceId: 'acc',
        actorAppUserId: 'admin',
        before: { loginEmail: 'old@corp.test' },
        after: { loginEmail: 'New.Name+tag@Corp.test', employeeId: 'emp' },
      }),
    );
  });

  it('refuses, writing and auditing nothing, when another account already logs in with the address', async () => {
    const { service, accounts, audit } = setup({ holder: 'someone-else' });

    await expect(service.follow(tx, input)).resolves.toEqual({ result: 'TAKEN', moved: null });

    expect(accounts.moveLoginEmail).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('writes and audits nothing when the account already logs in with exactly this address', async () => {
    const { service, accounts, audit } = setup({
      account: { id: 'acc', loginEmail: 'New.Name+tag@Corp.test' },
      holder: 'acc',
    });

    await expect(service.follow(tx, input)).resolves.toEqual({ result: 'FOLLOWED', moved: null });

    expect(accounts.moveLoginEmail).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});
