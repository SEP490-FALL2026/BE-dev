import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { isUniqueViolation } from '../../../infrastructure/database/unique-violation';

export interface VendorRow {
  id: string;
  name: string;
  dictionaryGroupId: string | null;
}

type PrismaVendor = Prisma.VendorGetPayload<object>;

const toRow = (row: PrismaVendor): VendorRow => ({
  id: row.id,
  name: row.name,
  dictionaryGroupId: row.dictionaryGroupId,
});

/** The one writer of `vendors`: the vendors of this organization, made by application declarations. */
@Injectable()
export class VendorRepo {
  constructor(private readonly prisma: PrismaService) {}

  async find(tx: DbTx, id: string): Promise<VendorRow | null> {
    const row = await tx.vendor.findUnique({ where: { id } });

    return row ? toRow(row) : null;
  }

  async findByNormalizedName(tx: DbTx, organizationId: string, normalizedName: string): Promise<VendorRow | null> {
    const row = await tx.vendor.findUnique({
      where: { organizationId_normalizedName: { organizationId, normalizedName } },
    });

    return row ? toRow(row) : null;
  }

  async findByDictionaryGroup(tx: DbTx, organizationId: string, groupId: string): Promise<VendorRow | null> {
    const row = await tx.vendor.findUnique({
      where: { organizationId_dictionaryGroupId: { organizationId, dictionaryGroupId: groupId } },
    });

    return row ? toRow(row) : null;
  }

  /**
   * Inserts the vendor unless one of the same name or the same dictionary group exists, in which case it inserts nothing
   * and returns null. A simultaneous insert of the same vendor waits for the first to commit, then also finds the row.
   */
  async insertIfAbsent(
    tx: DbTx,
    input: { organizationId: string; name: string; normalizedName: string; dictionaryGroupId: string | null },
  ): Promise<VendorRow | null> {
    const rows = await tx.$queryRaw<{ id: string; name: string; dictionary_group_id: string | null }[]>`
      INSERT INTO vendors (id, organization_id, name, normalized_name, dictionary_group_id)
      VALUES (gen_random_uuid(), ${input.organizationId}::uuid, ${input.name}, ${input.normalizedName},
              ${input.dictionaryGroupId}::uuid)
      ON CONFLICT DO NOTHING
      RETURNING id, name, dictionary_group_id`;

    return rows.length === 0
      ? null
      : { id: rows[0].id, name: rows[0].name, dictionaryGroupId: rows[0].dictionary_group_id };
  }

  /** One page of vendors by name, filtered by a name key and by ids, and the total, from one snapshot. */
  async list(filter: {
    searchKey?: string;
    onlyIds?: string[];
    excludeIds?: string[];
    skip: number;
    take: number;
  }): Promise<{ items: VendorRow[]; total: number }> {
    const where: Prisma.VendorWhereInput = {
      ...(filter.searchKey ? { normalizedName: { contains: filter.searchKey } } : {}),
      ...(filter.onlyIds || filter.excludeIds
        ? {
            id: {
              ...(filter.onlyIds ? { in: filter.onlyIds } : {}),
              ...(filter.excludeIds ? { notIn: filter.excludeIds } : {}),
            },
          }
        : {}),
    };

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.vendor.findMany({
          where,
          orderBy: [{ normalizedName: 'asc' }, { id: 'asc' }],
          skip: filter.skip,
          take: filter.take,
        });

        return { items: rows.map(toRow), total: await tx.vendor.count({ where }) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /** An unlocked read of one vendor, or null. */
  async findPublic(id: string): Promise<VendorRow | null> {
    const row = await this.prisma.vendor.findUnique({ where: { id } });

    return row ? toRow(row) : null;
  }

  /**
   * Links a vendor that has no dictionary group to one, in a single conditional write (`dictionary_group_id IS NULL`), so
   * two adopters at once cannot both win (DB-03). `adopted` says whether this call made the link; a vendor that already
   * holds that very group answers with `adopted: false`. Null when the vendor holds another group, does not exist, or
   * another vendor already holds that group.
   */
  async setDictionaryGroup(
    tx: DbTx,
    id: string,
    groupId: string,
  ): Promise<{ vendor: VendorRow; adopted: boolean } | null> {
    let linked: number;
    try {
      linked = (
        await tx.vendor.updateMany({ where: { id, dictionaryGroupId: null }, data: { dictionaryGroupId: groupId } })
      ).count;
    } catch (error) {
      if (isUniqueViolation(error, 'dictionary_group_id')) return null;
      throw error;
    }
    const row = await tx.vendor.findUnique({ where: { id } });

    return row && row.dictionaryGroupId === groupId ? { vendor: toRow(row), adopted: linked === 1 } : null;
  }
}
