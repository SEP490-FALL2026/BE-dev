import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { ActionTokenPurpose, ActionTokenRevokedReason, ActionTokenSnapshot } from '../identity-access.types';
import { ActionLinkState } from '../policies/account-policy';

const TOKEN_SELECT = {
  tokenHash: true,
  appUserId: true,
  purpose: true,
  expiresAt: true,
  consumedAt: true,
  revokedAt: true,
  recoveryTicketId: true,
  newLoginEmail: true,
  newNormalizedLoginEmail: true,
} as const;

/** Owns AccountActionToken: the emailed invitation and reset links. The one writer of `account_action_tokens`. */
@Injectable()
export class ActionTokenRepo {
  constructor(private readonly prisma: PrismaService) {}

  async insertActionToken(
    tx: DbTx,
    input: {
      tokenHash: string;
      appUserId: string;
      purpose: ActionTokenPurpose;
      expiresAt: Date;
      /** Null when the token was requested by the account's owner rather than by an administrator. */
      createdBy: string | null;
      /** A link the recovery procedure sent belongs to its ticket and may carry the address the account takes (US-01-09). */
      recoveryTicketId?: string;
      newLoginEmail?: string;
      newNormalizedLoginEmail?: string;
    },
  ): Promise<void> {
    await tx.accountActionToken.create({ data: input });
  }

  /** Tokens that are neither consumed nor revoked, whether or not they have expired. One purpose, or all. */
  async findUsableTokens(tx: DbTx, appUserId: string, purpose?: ActionTokenPurpose): Promise<ActionTokenSnapshot[]> {
    return tx.accountActionToken.findMany({
      where: { appUserId, consumedAt: null, revokedAt: null, ...(purpose ? { purpose } : {}) },
      select: TOKEN_SELECT,
    });
  }

  /** How many tokens of this purpose the account was issued since `since`, whatever became of them (T-2). */
  async countTokensSince(tx: DbTx, appUserId: string, purpose: ActionTokenPurpose, since: Date): Promise<number> {
    return tx.accountActionToken.count({ where: { appUserId, purpose, createdAt: { gte: since } } });
  }

  async revokeTokens(tx: DbTx, tokenHashes: string[], reason: ActionTokenRevokedReason, now: Date): Promise<void> {
    if (tokenHashes.length === 0) return;

    await tx.accountActionToken.updateMany({
      where: { tokenHash: { in: tokenHashes }, consumedAt: null, revokedAt: null },
      data: { revokedAt: now, revokedReason: reason },
    });
  }

  /** Unlocked: maps a presented token to its account so the account can be locked first. */
  async findActionTokenOwner(tokenHash: string): Promise<string | null> {
    const row = await this.prisma.accountActionToken.findUnique({ where: { tokenHash }, select: { appUserId: true } });

    return row?.appUserId ?? null;
  }

  /** Unlocked: what a presented token is and what became of it, so a link that cannot work is refused before any hashing. */
  async findActionTokenHeader(tokenHash: string): Promise<{
    appUserId: string;
    purpose: ActionTokenPurpose;
    expiresAt: Date;
    consumedAt: Date | null;
    revokedAt: Date | null;
  } | null> {
    return this.prisma.accountActionToken.findUnique({
      where: { tokenHash },
      select: { appUserId: true, purpose: true, expiresAt: true, consumedAt: true, revokedAt: true },
    });
  }

  async lockActionToken(tx: DbTx, tokenHash: string): Promise<ActionTokenSnapshot | null> {
    const locked = await tx.$queryRaw<
      { token_hash: string }[]
    >`SELECT token_hash FROM account_action_tokens WHERE token_hash = ${tokenHash} FOR UPDATE`;
    if (locked.length === 0) return null;

    return tx.accountActionToken.findUnique({ where: { tokenHash }, select: TOKEN_SELECT });
  }

  async consumeToken(tx: DbTx, tokenHash: string, now: Date): Promise<void> {
    await tx.accountActionToken.update({ where: { tokenHash }, data: { consumedAt: now } });
  }

  /**
   * Unlocked read for the dispatcher: the stored state of the link behind this token and of its
   * account. Whether the account side would accept it is `isActionLinkRedeemable`'s to say; whether
   * the Employee has left is the organization module's, so the caller asks it.
   */
  async findActionLink(tokenHash: string): Promise<(ActionLinkState & { appUser: { employeeId: string } }) | null> {
    return this.prisma.accountActionToken.findUnique({
      where: { tokenHash },
      select: {
        purpose: true,
        consumedAt: true,
        revokedAt: true,
        expiresAt: true,
        appUser: { select: { status: true, activationState: true, employeeId: true } },
      },
    });
  }

  /**
   * The newest invitation of an account, used or not, with its expiry, for the detail view. Only
   * invitations: a password-reset token is not an invitation and must never be shown as one.
   */
  async latestToken(appUserId: string): Promise<ActionTokenSnapshot | null> {
    return this.prisma.accountActionToken.findFirst({
      where: { appUserId, purpose: 'INVITE' },
      orderBy: { createdAt: 'desc' },
      select: TOKEN_SELECT,
    });
  }
}
