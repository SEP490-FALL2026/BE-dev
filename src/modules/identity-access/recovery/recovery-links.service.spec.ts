import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { NotificationsService } from '../../notifications/notifications.service';
import type { ActionLinkService } from '../accounts/action-link.service';
import { RecoveryLinks } from './recovery-links.service';

/**
 * Where a recovery mail goes (`F18`, `P28-05`): to the recipient the caller names, which is the login email of the account, and
 * never nowhere or somewhere else. An empty recipient stops the transaction before a link is issued or a mail is queued.
 */
describe('RecoveryLinks recipients', () => {
  const tx = {} as DbTx;
  const now = new Date('2026-10-28T00:00:00.000Z');
  const issued = { hash: 'hash-1', token: 'token-1', expiresAt: new Date('2026-10-31T00:00:00.000Z') };

  const links = { issue: jest.fn(), findUsableTokens: jest.fn() };
  const notifications = { enqueueEmail: jest.fn(), deliveryStates: jest.fn() };
  const recovery = () =>
    new RecoveryLinks(links as unknown as ActionLinkService, notifications as unknown as NotificationsService);
  const invitation = (recipient: string) => ({
    organizationId: 'org-1',
    appUserId: 'user-1',
    ticketId: 'ticket-1',
    recipient,
    fullName: 'An Nguyen',
  });

  beforeEach(() => {
    jest.clearAllMocks();
    links.issue.mockResolvedValue(issued);
    notifications.enqueueEmail.mockResolvedValue(undefined);
  });

  it('queues the invitation to the recipient it was given, the login email of the account', async () => {
    await recovery().sendInvitation(tx, invitation('login@acme.vn'), now);

    expect(notifications.enqueueEmail).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        recipient: 'login@acme.vn',
        template: 'ACCOUNT_INVITATION',
        actionTokenHash: 'hash-1',
      }),
    );
  });

  it('queues the reset link to the recipient it was given', async () => {
    await recovery().sendResetLink(tx, { ...invitation('login@acme.vn'), newEmail: null }, now);

    expect(notifications.enqueueEmail).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ recipient: 'login@acme.vn', template: 'PASSWORD_RESET' }),
    );
  });

  it.each(['', '   '])(
    'refuses the invitation to the empty recipient %j before a link or a mail is written',
    async (recipient) => {
      await expect(recovery().sendInvitation(tx, invitation(recipient), now)).rejects.toThrow(
        /login email of the account/,
      );

      expect(links.issue).not.toHaveBeenCalled();
      expect(notifications.enqueueEmail).not.toHaveBeenCalled();
    },
  );

  it.each(['', '   '])(
    'refuses the reset link to the empty recipient %j before a link or a mail is written',
    async (recipient) => {
      await expect(recovery().sendResetLink(tx, { ...invitation(recipient), newEmail: null }, now)).rejects.toThrow(
        /login email of the account/,
      );

      expect(links.issue).not.toHaveBeenCalled();
      expect(notifications.enqueueEmail).not.toHaveBeenCalled();
    },
  );
});
