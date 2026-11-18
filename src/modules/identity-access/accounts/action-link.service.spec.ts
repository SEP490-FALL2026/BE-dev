import { ConfigService } from '@nestjs/config';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { ActionTokenRepo } from './action-token.repo';
import { ActionLinkService } from './action-link.service';

/** The service with a repository that only records what would be stored. */
function serviceWith(config: Record<string, number>) {
  const stored: { tokenHash: string; expiresAt: Date }[] = [];
  const repo = {
    insertActionToken: (_tx: DbTx, input: { tokenHash: string; expiresAt: Date }) => {
      stored.push(input);
      return Promise.resolve();
    },
  };

  return {
    links: new ActionLinkService(repo as unknown as ActionTokenRepo, new ConfigService(config) as never),
    stored,
  };
}

const tx = {} as DbTx;
const forAccount = { appUserId: 'a', purpose: 'RESET_PASSWORD', createdBy: null } as const;

describe('ActionLinkService.issue — a password-reset link (T-1)', () => {
  const { links, stored } = serviceWith({ AUTH_PASSWORD_RESET_TTL_SECONDS: 1800, AUTH_INVITATION_TTL_SECONDS: 3600 });

  it('issues a well-formed token expiring after the reset lifetime, not the invitation one', async () => {
    const now = new Date('2026-10-16T08:00:00.000Z');
    const issued = await links.issue(tx, forAccount, 'PASSWORD_RESET', now);

    expect(links.isWellFormedActionToken(issued.token)).toBe(true);
    expect(links.hashActionToken(issued.token)).toBe(issued.hash);
    expect(issued.expiresAt).toEqual(new Date('2026-10-16T08:30:00.000Z'));
    // Only the hash is stored, never the token itself.
    expect(stored.at(-1)).toMatchObject({ tokenHash: issued.hash, expiresAt: issued.expiresAt });
    expect(JSON.stringify(stored)).not.toContain(issued.token);
  });

  it('never repeats a token', async () => {
    const now = new Date();

    expect((await links.issue(tx, forAccount, 'PASSWORD_RESET', now)).token).not.toEqual(
      (await links.issue(tx, forAccount, 'PASSWORD_RESET', now)).token,
    );
  });
});

describe('ActionLinkService.issue — an invitation link', () => {
  const { links } = serviceWith({ AUTH_INVITATION_TTL_SECONDS: 3600 });

  it('issues a well-formed token whose hash matches and whose expiry is the configured time to live after now', async () => {
    const now = new Date('2026-10-15T08:00:00.000Z');
    const issued = await links.issue(tx, { ...forAccount, purpose: 'INVITE' }, 'INVITATION', now);

    expect(links.isWellFormedActionToken(issued.token)).toBe(true);
    expect(links.hashActionToken(issued.token)).toBe(issued.hash);
    expect(issued.expiresAt).toEqual(new Date('2026-10-15T09:00:00.000Z'));
  });
});
