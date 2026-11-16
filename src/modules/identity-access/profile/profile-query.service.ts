import { Inject, Injectable } from '@nestjs/common';
import { OBJECT_STORAGE, type ObjectStoragePort } from '../../../infrastructure/object-storage/object-storage.port';
import { AccountNotFoundError } from '../accounts/account.errors';
import { ProfileRepo, type ProfileRecord } from './profile.repo';

/** How long a link to a picture works: long enough to show a page, short enough that a copied link soon opens nothing. */
export const AVATAR_LINK_SECONDS = 15 * 60;

export interface AvatarLink {
  url: string;
  expiresAt: string;
}

export interface SelfServiceProfile {
  avatar: AvatarLink | null;
  workPhone: string | null;
}

const EXTENSION_OF: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

/** What anyone signed in reads of the picture and the work phone of an account (`QĐ-111au`): never in a usage or discovery answer. */
@Injectable()
export class ProfileQueryService {
  constructor(
    private readonly repo: ProfileRepo,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
  ) {}

  /** The picture of the account as a link with a time, and the phone. Throws AccountNotFoundError. */
  async viewOf(appUserId: string, now: Date = new Date()): Promise<SelfServiceProfile> {
    const record = await this.repo.profileOf(appUserId);
    if (!record) throw new AccountNotFoundError();

    return this.viewOfRecord(record, now);
  }

  /** The profile of each employee asked for that has an account: one statement for the accounts, however many are asked. */
  async lookup(
    employeeIds: readonly string[],
    now: Date = new Date(),
  ): Promise<({ employeeId: string } & SelfServiceProfile)[]> {
    const unique = [...new Set(employeeIds)];
    const records = new Map((await this.repo.profilesOfEmployees(unique)).map((record) => [record.employeeId, record]));

    return Promise.all(
      unique.map(async (employeeId) => {
        const record = records.get(employeeId);

        return { employeeId, ...(record ? await this.viewOfRecord(record, now) : { avatar: null, workPhone: null }) };
      }),
    );
  }

  async viewOfRecord(record: ProfileRecord, now: Date): Promise<SelfServiceProfile> {
    return { avatar: await this.linkOf(record, now), workPhone: record.workPhone };
  }

  private async linkOf(record: ProfileRecord, now: Date): Promise<AvatarLink | null> {
    if (!record.avatarObjectKey || !record.avatarContentType) return null;
    const url = await this.storage.createDownloadUrl({
      key: record.avatarObjectKey,
      fileName: `avatar.${EXTENSION_OF[record.avatarContentType] ?? 'img'}`,
      contentType: record.avatarContentType,
      expiresInSeconds: AVATAR_LINK_SECONDS,
    });

    return { url, expiresAt: new Date(now.getTime() + AVATAR_LINK_SECONDS * 1000).toISOString() };
  }
}
