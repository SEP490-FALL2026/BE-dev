import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../../../infrastructure/config/env-schema';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { ActionTokenPurpose, ActionTokenRevokedReason, ActionTokenSnapshot } from '../public/identity-access.types';
import { ActionLinkState } from './account.policy';
import { ActionTokenRepo } from './action-token.repo';
import { hashActionToken, isWellFormedActionToken, newActionToken } from './action-token.policy';

/** Which configured lifetime a new link gets: an invitation's, or a password reset's. */
export type ActionLinkLifetime = 'INVITATION' | 'PASSWORD_RESET';

export interface IssuedActionLink {
  /** The raw token: it goes into the mail and nowhere else. */
  token: string;
  hash: string;
  expiresAt: Date;
}

/**
 * The links an account receives by email (AccountActionToken): invitations and password resets, including those the
 * recovery procedure sends. Issuing, recognising, locking and spending one goes through here; only the SHA-256 of a
 * token is stored. The lifetimes are read when a link is issued, never at start-up.
 */
@Injectable()
export class ActionLinkService {
  constructor(
    private readonly links: ActionTokenRepo,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  /** Makes a new one-time token and stores its hash: 256 bits of randomness that expire after the given lifetime. */
  async issue(
    tx: DbTx,
    input: {
      appUserId: string;
      purpose: ActionTokenPurpose;
      /** Null when the token was requested by the account's owner rather than by an administrator. */
      createdBy: string | null;
      /** A link the recovery procedure sent belongs to its ticket and may carry the address the account takes. */
      recoveryTicketId?: string;
      newLoginEmail?: string;
      newNormalizedLoginEmail?: string;
    },
    lifetime: ActionLinkLifetime,
    now: Date,
  ): Promise<IssuedActionLink> {
    const issued = newActionToken(now, this.lifetimeSeconds(lifetime) * 1000);
    await this.links.insertActionToken(tx, { tokenHash: issued.hash, expiresAt: issued.expiresAt, ...input });

    return issued;
  }

  isWellFormedActionToken(token: string): boolean {
    return isWellFormedActionToken(token);
  }

  hashActionToken(token: string): string {
    return hashActionToken(token);
  }

  /** Tokens that are neither consumed nor revoked, whether or not they have expired. One purpose, or all. */
  findUsableTokens(tx: DbTx, appUserId: string, purpose?: ActionTokenPurpose): Promise<ActionTokenSnapshot[]> {
    return this.links.findUsableTokens(tx, appUserId, purpose);
  }

  /** How many tokens of this purpose the account was issued since `since`, whatever became of them. */
  countTokensSince(tx: DbTx, appUserId: string, purpose: ActionTokenPurpose, since: Date): Promise<number> {
    return this.links.countTokensSince(tx, appUserId, purpose, since);
  }

  revokeTokens(tx: DbTx, tokenHashes: string[], reason: ActionTokenRevokedReason, now: Date): Promise<void> {
    return this.links.revokeTokens(tx, tokenHashes, reason, now);
  }

  /** Unlocked: maps a presented token to its account so the account can be locked first. */
  findActionTokenOwner(tokenHash: string): Promise<string | null> {
    return this.links.findActionTokenOwner(tokenHash);
  }

  /** Unlocked: what a presented token is and what became of it, so a link that cannot work is refused early. */
  findActionTokenHeader(tokenHash: string): Promise<{
    appUserId: string;
    purpose: ActionTokenPurpose;
    expiresAt: Date;
    consumedAt: Date | null;
    revokedAt: Date | null;
  } | null> {
    return this.links.findActionTokenHeader(tokenHash);
  }

  lockActionToken(tx: DbTx, tokenHash: string): Promise<ActionTokenSnapshot | null> {
    return this.links.lockActionToken(tx, tokenHash);
  }

  consumeToken(tx: DbTx, tokenHash: string, now: Date): Promise<void> {
    return this.links.consumeToken(tx, tokenHash, now);
  }

  /** Unlocked read for the dispatcher: the stored state of the link behind this token and of its account. */
  findActionLink(tokenHash: string): Promise<(ActionLinkState & { appUser: { employeeId: string } }) | null> {
    return this.links.findActionLink(tokenHash);
  }

  /** The newest invitation of an account, used or not (never a password-reset token), for the detail view. */
  latestToken(appUserId: string): Promise<ActionTokenSnapshot | null> {
    return this.links.latestToken(appUserId);
  }

  private lifetimeSeconds(lifetime: ActionLinkLifetime): number {
    return lifetime === 'INVITATION'
      ? this.config.get('AUTH_INVITATION_TTL_SECONDS', { infer: true })
      : this.config.get('AUTH_PASSWORD_RESET_TTL_SECONDS', { infer: true });
  }
}
