import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { OBJECT_STORAGE, type ObjectStoragePort } from '../../../infrastructure/object-storage/object-storage.port';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { AccountNotFoundError } from '../accounts/account.errors';
import {
  AvatarFileRequiredError,
  AvatarInvalidError,
  AvatarNotSetError,
  AvatarTooLargeError,
  AvatarTypeUnsupportedError,
} from './profile.errors';
import { avatarObjectKey, judgeAvatar } from './profile.policy';
import { ProfileRepo } from './profile.repo';
import { ProfileQueryService, type AvatarLink } from './profile-query.service';

export interface UploadedPicture {
  bytes: Buffer;
  declaredContentType: string;
}

/**
 * The picture of a person (`QĐ-111at`, `QĐ-111au`, R-22). The file is read and judged by its signature here, written to the storage under a
 * key of its own, and only then does the account point at it, in one transaction that also queues the key it stopped pointing at; the old object is
 * deleted after the commit by the sweeper, never inside the transaction, which could still roll back.
 */
@Injectable()
export class ProfileAvatarService {
  constructor(
    private readonly repo: ProfileRepo,
    private readonly queries: ProfileQueryService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /** Throws AvatarFileRequiredError, AvatarTooLargeError, AvatarTypeUnsupportedError, AvatarInvalidError and AccountNotFoundError. */
  async upload(
    actor: AuthenticatedPrincipal,
    file: UploadedPicture | undefined,
    now: Date = new Date(),
  ): Promise<{ avatar: AvatarLink | null }> {
    if (!file) throw new AvatarFileRequiredError();
    const judged = judgeAvatar(file);
    if (!judged.ok) {
      if (judged.reason === 'TOO_LARGE') throw new AvatarTooLargeError();
      if (judged.reason === 'UNSUPPORTED_TYPE') throw new AvatarTypeUnsupportedError();
      throw new AvatarInvalidError(judged.reason);
    }
    const record = await this.repo.profileOf(actor.appUserId);
    if (!record) throw new AccountNotFoundError();
    const key = avatarObjectKey(record.organizationId, actor.appUserId, randomUUID(), judged.kind.extension);
    await this.storage.putObject({ key, body: file.bytes, contentType: judged.kind.contentType });
    try {
      await this.runner.run(async (tx) => {
        const locked = await this.repo.lockProfile(tx, actor.appUserId);
        if (!locked) throw new AccountNotFoundError();
        await this.repo.setAvatar(tx, actor.appUserId, { key, contentType: judged.kind.contentType, at: now });
        if (locked.avatarObjectKey) await this.repo.enqueuePurge(tx, locked.organizationId, locked.avatarObjectKey);
        await this.audit.record(tx, {
          organizationId: locked.organizationId,
          actorKind: 'USER',
          actorAppUserId: actor.appUserId,
          actorRoles: actor.roles,
          action: 'PROFILE.AVATAR_CHANGED',
          resourceType: 'AppUser',
          resourceId: actor.appUserId,
          before: { hadAvatar: locked.avatarObjectKey !== null },
          after: { contentType: judged.kind.contentType, bytes: file.bytes.length },
          correlationId: actor.sessionId,
        });
      });
    } catch (error) {
      // The account never pointed at the new object: nothing else will ever delete it.
      await this.storage.delete(key).catch(() => undefined);
      throw error;
    }

    return { avatar: (await this.queries.viewOf(actor.appUserId, now)).avatar };
  }

  /** The person removes their own picture; with none, nothing changes. Throws AccountNotFoundError. */
  async remove(actor: AuthenticatedPrincipal): Promise<{ avatar: null }> {
    await this.runner.run(async (tx) => {
      const locked = await this.repo.lockProfile(tx, actor.appUserId);
      if (!locked) throw new AccountNotFoundError();
      if (!locked.avatarObjectKey) return;
      await this.repo.clearAvatar(tx, actor.appUserId);
      await this.repo.enqueuePurge(tx, locked.organizationId, locked.avatarObjectKey);
      await this.audit.record(tx, {
        organizationId: locked.organizationId,
        actorKind: 'USER',
        actorAppUserId: actor.appUserId,
        actorRoles: actor.roles,
        action: 'PROFILE.AVATAR_REMOVED',
        resourceType: 'AppUser',
        resourceId: actor.appUserId,
        before: { hadAvatar: true },
        after: { hadAvatar: false },
        correlationId: actor.sessionId,
      });
    });

    return { avatar: null };
  }

  /** The Super Admin removes the picture of an account for a reason that is kept (R-22). Throws AccountNotFoundError and AvatarNotSetError. */
  async removeByAdmin(actor: AuthenticatedPrincipal, appUserId: string, reason: string): Promise<{ avatar: null }> {
    await this.runner.run(async (tx) => {
      const locked = await this.repo.lockProfile(tx, appUserId);
      if (!locked) throw new AccountNotFoundError();
      if (!locked.avatarObjectKey) throw new AvatarNotSetError();
      await this.repo.clearAvatar(tx, appUserId);
      await this.repo.enqueuePurge(tx, locked.organizationId, locked.avatarObjectKey);
      await this.audit.record(tx, {
        organizationId: locked.organizationId,
        actorKind: 'USER',
        actorAppUserId: actor.appUserId,
        actorRoles: actor.roles,
        action: 'PROFILE.AVATAR_REMOVED_BY_ADMIN',
        resourceType: 'AppUser',
        resourceId: appUserId,
        before: { hadAvatar: true },
        after: { hadAvatar: false, reason },
        correlationId: actor.sessionId,
      });
    });

    return { avatar: null };
  }
}
