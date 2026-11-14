import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { searchKey } from '../vendor-dictionary/vendor-matcher.policy';
import { STANDARD_FUNCTIONAL_GROUPS } from './functional-group-standard.policy';
import type { FunctionalGroupListFilter, FunctionalGroupRecord, FunctionalGroupStatus } from './functional-group.types';

type Row = Prisma.FunctionalGroupGetPayload<object>;

const toSystemKey = (value: string | null): FunctionalGroupRecord['systemKey'] =>
  value === 'COMMUNICATION' || value === 'OTHER' ? value : null;

const toRecord = (row: Row): FunctionalGroupRecord => ({
  id: row.id,
  name: row.name,
  status: row.status,
  systemKey: toSystemKey(row.systemKey),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/** The one writer of `functional_groups`: the list of kinds of function an application can be classed under. */
@Injectable()
export class FunctionalGroupRepo {
  constructor(private readonly prisma: PrismaService) {}

  async create(tx: DbTx, organizationId: string, name: string): Promise<FunctionalGroupRecord> {
    return toRecord(
      await tx.functionalGroup.create({ data: { organizationId, name, normalizedName: searchKey(name) } }),
    );
  }

  /** The seven standard groups of a new organization, in the transaction that makes it; a name it already has is left as it is. Returns how many were written. */
  async insertStandard(tx: DbTx, organizationId: string): Promise<number> {
    const { count } = await tx.functionalGroup.createMany({
      data: STANDARD_FUNCTIONAL_GROUPS.map((group) => ({
        organizationId,
        name: group.name,
        normalizedName: searchKey(group.name),
        systemKey: group.systemKey,
      })),
      skipDuplicates: true,
    });

    return count;
  }

  /** The group, locked for the rest of the transaction, or null. */
  async lock(tx: DbTx, id: string): Promise<FunctionalGroupRecord | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM functional_groups WHERE id = ${id}::uuid FOR UPDATE`;
    if (locked.length === 0) return null;
    const row = await tx.functionalGroup.findUnique({ where: { id } });

    return row ? toRecord(row) : null;
  }

  async update(
    tx: DbTx,
    id: string,
    changes: { name?: string; status?: FunctionalGroupStatus },
  ): Promise<FunctionalGroupRecord> {
    return toRecord(
      await tx.functionalGroup.update({
        where: { id },
        data: {
          ...(changes.name !== undefined ? { name: changes.name, normalizedName: searchKey(changes.name) } : {}),
          ...(changes.status !== undefined ? { status: changes.status } : {}),
        },
      }),
    );
  }

  /** The group when it exists and is active, locked `FOR SHARE` so it stays active until the transaction ends. */
  async findActiveShared(tx: DbTx, id: string): Promise<{ id: string; name: string } | null> {
    const rows = await tx.$queryRaw<{ id: string; name: string }[]>`
      SELECT id, name FROM functional_groups WHERE id = ${id}::uuid AND status = 'ACTIVE' FOR SHARE`;

    return rows.length === 0 ? null : rows[0];
  }

  /**
   * The group Khác of the organization, where an application declared with no group goes, locked `FOR SHARE`. The database function finds it, adopts
   * an older group called Khác or makes it (migration `…_ct1_application_group_required`), so an organization made by hand has one.
   */
  async ensureOtherShared(tx: DbTx, organizationId: string): Promise<{ id: string; name: string }> {
    const [made] = await tx.$queryRaw<
      { id: string }[]
    >`SELECT ensure_other_functional_group(${organizationId}::uuid) AS id`;
    const [group] = await tx.$queryRaw<{ id: string; name: string }[]>`
      SELECT id, name FROM functional_groups WHERE id = ${made.id}::uuid FOR SHARE`;

    return group;
  }

  /** One page by name and the total for the same filter, from one snapshot. */
  async list(filter: FunctionalGroupListFilter): Promise<{ items: FunctionalGroupRecord[]; total: number }> {
    const where: Prisma.FunctionalGroupWhereInput = filter.status ? { status: filter.status } : {};

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.functionalGroup.findMany({
          where,
          orderBy: [{ normalizedName: 'asc' }, { id: 'asc' }],
          skip: filter.skip,
          take: filter.take,
        });

        return { items: rows.map(toRecord), total: await tx.functionalGroup.count({ where }) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
