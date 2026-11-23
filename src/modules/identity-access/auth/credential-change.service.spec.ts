import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuditApi } from '../../audit/public/audit.api';
import type { NotificationsApi } from '../../notifications/public/notifications.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { ActionLinkRevocation } from '../accounts/action-link-revocation.service';
import type { CredentialService } from '../credentials/credential.service';
import type { AccountSnapshot } from '../public/identity-access.types';
import { CredentialChangeService } from './credential-change.service';
import type { LoginThrottle } from './login-throttle.service';
import type { SessionRepo } from './session.repo';

const tx = { name: 'tx' } as unknown as DbTx;

describe('CredentialChangeService', () => {
  it('writes the time of the notice in ISO with the time zone of the organization, read in the transaction of the caller; the audit event keeps the ISO time alone', async () => {
    const now = new Date('2026-11-28T03:00:00.000Z');
    const notifications = { enqueueEmail: jest.fn(() => Promise.resolve({ id: 'mail' })) };
    const audit = { record: jest.fn(() => Promise.resolve()) };
    const organizations = { getOrganization: jest.fn(() => Promise.resolve({ timeZone: 'Asia/Ho_Chi_Minh' })) };
    const service = new CredentialChangeService(
      { replaceCredential: jest.fn(() => Promise.resolve()) } as unknown as CredentialService,
      { revokeUsable: jest.fn(() => Promise.resolve()) } as unknown as ActionLinkRevocation,
      { revokeAllSessions: jest.fn(() => Promise.resolve()) } as unknown as SessionRepo,
      { clear: jest.fn(() => Promise.resolve()), keyFor: jest.fn(() => 'key') } as unknown as LoginThrottle,
      notifications as unknown as NotificationsApi,
      audit as unknown as AuditApi,
      organizations as unknown as OrganizationReadApi,
    );

    await service.replace(tx, {
      account: { id: 'user', organizationId: 'org', loginEmail: 'an@acme.test' } as AccountSnapshot,
      hash: 'hash',
      event: 'PASSWORD_CHANGED',
      fullName: 'An',
      actor: { actorKind: 'USER', actorAppUserId: 'user', actorRoles: [], correlationId: 'c' } as never,
      now,
    });

    expect(organizations.getOrganization).toHaveBeenCalledWith(tx);
    expect(notifications.enqueueEmail).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        payload: { event: 'PASSWORD_CHANGED', at: now.toISOString(), timeZone: 'Asia/Ho_Chi_Minh', fullName: 'An' },
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ after: { event: 'PASSWORD_CHANGED', at: now.toISOString() } }),
    );
  });
});
