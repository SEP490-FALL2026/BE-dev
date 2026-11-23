import type { ConfigService } from '@nestjs/config';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { NotificationsApi } from '../../notifications/public/notifications.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { EmployeeRecord } from '../../organization/public/organization.types';
import type { ActionLinkRevocation } from '../accounts/action-link-revocation.service';
import type { ActionLinkService } from '../accounts/action-link.service';
import type { AccountSnapshot } from '../public/identity-access.types';
import { PasswordResetMailService } from './password-reset-mail.service';

const tx = { name: 'tx' } as unknown as DbTx;

describe('PasswordResetMailService', () => {
  it('writes the time zone of the organization, read in the transaction of the caller, beside the expiry of the link', async () => {
    const expiresAt = new Date('2026-11-28T03:00:00.000Z');
    const notifications = { enqueueEmail: jest.fn(() => Promise.resolve({ id: 'mail' })) };
    const organizations = { getOrganization: jest.fn(() => Promise.resolve({ timeZone: 'Asia/Ho_Chi_Minh' })) };
    const service = new PasswordResetMailService(
      {
        countTokensSince: jest.fn(() => Promise.resolve(0)),
        issue: jest.fn(() => Promise.resolve({ hash: 'h', token: 't', expiresAt })),
      } as unknown as ActionLinkService,
      { revokeUsable: jest.fn(() => Promise.resolve()) } as unknown as ActionLinkRevocation,
      notifications as unknown as NotificationsApi,
      { get: jest.fn(() => 5) } as unknown as ConfigService<never, true>,
      organizations as unknown as OrganizationReadApi,
    );

    const sent = await service.send(
      tx,
      { id: 'user', organizationId: 'org', loginEmail: 'an@acme.test' } as AccountSnapshot,
      { fullName: 'An' } as EmployeeRecord,
      new Date('2026-11-25T00:00:00.000Z'),
    );

    expect(sent).toBe(true);
    expect(organizations.getOrganization).toHaveBeenCalledWith(tx);
    expect(notifications.enqueueEmail).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        payload: { token: 't', expiresAt: expiresAt.toISOString(), timeZone: 'Asia/Ho_Chi_Minh', fullName: 'An' },
      }),
    );
  });
});
