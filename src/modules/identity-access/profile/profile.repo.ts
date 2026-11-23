import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';

/** What an account keeps of the two things its person edits: the picture (key, type, time) and the work phone. */
export interface ProfileRecord {
  appUserId: string;
  organizationId: string;
  employeeId: string;
  avatarObjectKey: string | null;
  avatarContentType: string | null;
  avatarUpdatedAt: Date | null;
  workPhone: string | null;
}

interface ProfileRow {
  id: string;
  organization_id: string;
  employee_id: string;
  avatar_object_key: string | null;
  avatar_content_type: string | null;
  avatar_updated_at: Date | null;
  work_phone: string | null;
}

const toRecord = (row: ProfileRow): ProfileRecord => ({
  appUserId: row.id,
  organizationId: row.organization_id,
  employeeId: row.employee_id,
  avatarObjectKey: row.avatar_object_key,
  avatarContentType: row.avatar_content_type,
  avatarUpdatedAt: row.avatar_updated_at,
  workPhone: row.work_phone,
});

const SELECT = {
  id: true,
  organizationId: true,
  employeeId: true,
  avatarObjectKey: true,
  avatarContentType: true,
  avatarUpdatedAt: true,
  workPhone: true,
} as const;

/** The picture and the work phone of the accounts, and the queue of pictures to delete once the change that dropped them has committed. */
@Injectable()
export class ProfileRepo {
  constructor(private readonly prisma: PrismaService) {}

  async profileOf(appUserId: string, tx?: DbTx): Promise<ProfileRecord | null> {
    const row = await (tx ?? this.prisma).appUser.findUnique({ where: { id: appUserId }, select: SELECT });

    return row ? { ...row, appUserId: row.id } : null;
  }

  async profilesOfEmployees(employeeIds: readonly string[]): Promise<ProfileRecord[]> {
    const rows = await this.prisma.appUser.findMany({
      where: { employeeId: { in: [...employeeIds] } },
      select: SELECT,
    });

    return rows.map((row) => ({ ...row, appUserId: row.id }));
  }

  /** Reads the account and holds it until the transaction ends, so two changes of one account follow each other. Null when there is none. */
  async lockProfile(tx: DbTx, appUserId: string): Promise<ProfileRecord | null> {
    const rows = await tx.$queryRaw<ProfileRow[]>`
      SELECT id, organization_id, employee_id, avatar_object_key, avatar_content_type, avatar_updated_at, work_phone
        FROM app_users WHERE id = ${appUserId}::uuid FOR UPDATE`;

    return rows[0] ? toRecord(rows[0]) : null;
  }

  async setAvatar(tx: DbTx, appUserId: string, values: { key: string; contentType: string; at: Date }): Promise<void> {
    await tx.appUser.update({
      where: { id: appUserId },
      data: { avatarObjectKey: values.key, avatarContentType: values.contentType, avatarUpdatedAt: values.at },
    });
  }

  async clearAvatar(tx: DbTx, appUserId: string): Promise<void> {
    await tx.appUser.update({
      where: { id: appUserId },
      data: { avatarObjectKey: null, avatarContentType: null, avatarUpdatedAt: null },
    });
  }

  async setWorkPhone(tx: DbTx, appUserId: string, workPhone: string | null): Promise<void> {
    await tx.appUser.update({ where: { id: appUserId }, data: { workPhone } });
  }

  /**
   * The person behind the employee left: the picture and the work phone are dropped from the account in this transaction (`QĐ-111av`) and the
   * key of the picture is returned for the caller to queue. Null when the employee has no account.
   */
  async clearSelfService(
    tx: DbTx,
    employeeId: string,
  ): Promise<{ organizationId: string; previousKey: string | null } | null> {
    const rows = await tx.$queryRaw<{ organization_id: string; avatar_object_key: string | null }[]>`
      SELECT organization_id, avatar_object_key FROM app_users WHERE employee_id = ${employeeId}::uuid FOR UPDATE`;
    const row = rows[0];
    if (!row) return null;
    await tx.$executeRaw`
      UPDATE app_users
         SET avatar_object_key = NULL, avatar_content_type = NULL, avatar_updated_at = NULL, work_phone = NULL, updated_at = now()
       WHERE employee_id = ${employeeId}::uuid`;

    return { organizationId: row.organization_id, previousKey: row.avatar_object_key };
  }

  async enqueuePurge(tx: DbTx, organizationId: string, objectKey: string): Promise<void> {
    await tx.avatarPurge.create({ data: { organizationId, objectKey } });
  }

  /**
   * The oldest objects still to delete, after the row `after` when a pass goes on past rows it already tried, read without a lock: deleting an object twice is
   * harmless, so two instances may read the same ones.
   */
  async listDuePurges(
    limit: number,
    after: { requestedAt: Date; id: string } | null = null,
  ): Promise<{ id: string; objectKey: string; requestedAt: Date }[]> {
    return this.prisma.avatarPurge.findMany({
      where: {
        purgedAt: null,
        ...(after === null
          ? {}
          : {
              OR: [
                { requestedAt: { gt: after.requestedAt } },
                { requestedAt: after.requestedAt, id: { gt: after.id } },
              ],
            }),
      },
      orderBy: [{ requestedAt: 'asc' }, { id: 'asc' }],
      take: limit,
      select: { id: true, objectKey: true, requestedAt: true },
    });
  }

  /** Marks the row done unless another instance did first; true when this call did. */
  async markPurged(tx: DbTx, id: string, at: Date): Promise<boolean> {
    const { count } = await tx.avatarPurge.updateMany({ where: { id, purgedAt: null }, data: { purgedAt: at } });

    return count > 0;
  }
}
