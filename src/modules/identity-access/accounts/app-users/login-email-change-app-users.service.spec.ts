import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { NotificationsApi } from '../../../notifications/public/notifications.api';
import type { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import { LoginEmailChangeNotice } from './login-email-change-app-users.service';

const tx = { name: 'tx' } as unknown as DbTx;

describe('LoginEmailChangeNotice', () => {
  it('queues the notice, in the given transaction, to the previous address and to the new one, with no token', async () => {
    const notifications = { enqueueEmail: jest.fn(() => Promise.resolve({ id: 'mail' })) };
    const organizations = { getOrganization: jest.fn(() => Promise.resolve({ timeZone: 'Asia/Ho_Chi_Minh' })) };
    const notice = new LoginEmailChangeNotice(
      notifications as unknown as NotificationsApi,
      organizations as unknown as OrganizationReadApi,
    );

    await notice.send(tx, 'org', { previousEmail: 'old@corp.test', currentEmail: 'New@Corp.test' });

    const payloadOf = (audience: string) => ({
      audience,
      previousEmail: 'old@corp.test',
      currentEmail: 'New@Corp.test',
      at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) as unknown,
      timeZone: 'Asia/Ho_Chi_Minh',
    });
    expect(organizations.getOrganization).toHaveBeenCalledWith(tx);
    expect(notifications.enqueueEmail).toHaveBeenCalledTimes(2);
    expect(notifications.enqueueEmail).toHaveBeenNthCalledWith(1, tx, {
      organizationId: 'org',
      recipient: 'old@corp.test',
      template: 'LOGIN_EMAIL_CHANGED_NOTICE',
      locale: 'vi',
      actionTokenHash: null,
      payload: payloadOf('PREVIOUS'),
    });
    expect(notifications.enqueueEmail).toHaveBeenNthCalledWith(2, tx, {
      organizationId: 'org',
      recipient: 'New@Corp.test',
      template: 'LOGIN_EMAIL_CHANGED_NOTICE',
      locale: 'vi',
      actionTokenHash: null,
      payload: payloadOf('CURRENT'),
    });
  });
});
