import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AuditApi } from '../../../audit/public/audit.api';
import type { NotificationsApi } from '../../../notifications/public/notifications.api';
import type { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import type { EmployeeRecord } from '../../../organization/public/organization.types';
import type { ActionLinkRevocation } from '../action-link-revocation.service';
import type { ActionLinkService } from '../action-link.service';
import { InvitationMailService } from './invitation-mail.service';

const tx = { name: 'tx' } as unknown as DbTx;

describe('InvitationMailService', () => {
  it('writes the time zone of the organization, read in the transaction of the caller, beside the expiry of the link', async () => {
    const expiresAt = new Date('2026-11-28T03:00:00.000Z');
    const notifications = { enqueueEmail: jest.fn(() => Promise.resolve({ id: 'mail' })) };
    const organizations = { getOrganization: jest.fn(() => Promise.resolve({ timeZone: 'Asia/Ho_Chi_Minh' })) };
    const service = new InvitationMailService(
      { issue: jest.fn(() => Promise.resolve({ hash: 'h', token: 't', expiresAt })) } as unknown as ActionLinkService,
      {} as unknown as ActionLinkRevocation,
      notifications as unknown as NotificationsApi,
      { record: jest.fn(() => Promise.resolve()) } as unknown as AuditApi,
      organizations as unknown as OrganizationReadApi,
    );

    await service.send(
      tx,
      { appUserId: 'admin' } as AuthenticatedPrincipal,
      'org',
      'user',
      'an@acme.test',
      { fullName: 'An' } as EmployeeRecord,
      new Date('2026-11-25T00:00:00.000Z'),
    );

    expect(organizations.getOrganization).toHaveBeenCalledWith(tx);
    expect(notifications.enqueueEmail).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        payload: { token: 't', expiresAt: expiresAt.toISOString(), timeZone: 'Asia/Ho_Chi_Minh', fullName: 'An' },
      }),
    );
  });
});
