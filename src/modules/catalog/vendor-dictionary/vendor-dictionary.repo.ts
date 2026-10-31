import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { searchKey, type MatchableLine } from './vendor-matcher.policy';
import type { VendorGroupListFilter, VendorGroupRecord, VendorLineRecord } from './vendor-dictionary.types';

type LineRow = Prisma.VendorServiceLineGetPayload<object>;
type GroupRow = Prisma.VendorGroupGetPayload<{ include: { serviceLines: true } }>;

const toLine = (row: LineRow): VendorLineRecord => ({
  id: row.id,
  groupId: row.groupId,
  name: row.name,
  domains: row.domains,
  patterns: row.patterns,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const toGroup = (row: GroupRow): VendorGroupRecord => ({
  id: row.id,
  name: row.name,
  brandDomains: row.brandDomains,
  serviceLines: row.serviceLines.map(toLine),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const LINES_IN_ORDER = { orderBy: [{ normalizedName: 'asc' as const }, { id: 'asc' as const }] };

/** The one writer of `vendor_groups` and `vendor_service_lines`: the shared vendor dictionary (US-04-07). */
@Injectable()
export class VendorDictionaryRepo {
  constructor(private readonly prisma: PrismaService) {}

  async createGroup(tx: DbTx, input: { name: string; brandDomains: string[] }): Promise<VendorGroupRecord> {
    const row = await tx.vendorGroup.create({
      data: { name: input.name, normalizedName: searchKey(input.name), brandDomains: input.brandDomains },
      include: { serviceLines: LINES_IN_ORDER },
    });

    return toGroup(row);
  }

  /** The group, locked for the rest of the transaction, or null. */
  async lockGroup(tx: DbTx, id: string): Promise<VendorGroupRecord | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM vendor_groups WHERE id = ${id}::uuid FOR UPDATE`;
    if (locked.length === 0) return null;
    const row = await tx.vendorGroup.findUnique({ where: { id }, include: { serviceLines: LINES_IN_ORDER } });

    return row ? toGroup(row) : null;
  }

  async updateGroup(
    tx: DbTx,
    id: string,
    changes: { name?: string; brandDomains?: string[] },
  ): Promise<VendorGroupRecord> {
    const row = await tx.vendorGroup.update({
      where: { id },
      data: {
        ...(changes.name !== undefined ? { name: changes.name, normalizedName: searchKey(changes.name) } : {}),
        ...(changes.brandDomains !== undefined ? { brandDomains: changes.brandDomains } : {}),
      },
      include: { serviceLines: LINES_IN_ORDER },
    });

    return toGroup(row);
  }

  async createLine(
    tx: DbTx,
    groupId: string,
    input: { name: string; domains: string[]; patterns: string[] },
  ): Promise<VendorLineRecord> {
    const row = await tx.vendorServiceLine.create({
      data: {
        groupId,
        name: input.name,
        normalizedName: searchKey(input.name),
        domains: input.domains,
        patterns: input.patterns,
      },
    });

    return toLine(row);
  }

  /** The line, locked for the rest of the transaction, or null. */
  async lockLine(tx: DbTx, id: string): Promise<VendorLineRecord | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM vendor_service_lines WHERE id = ${id}::uuid FOR UPDATE`;
    if (locked.length === 0) return null;
    const row = await tx.vendorServiceLine.findUnique({ where: { id } });

    return row ? toLine(row) : null;
  }

  async updateLine(
    tx: DbTx,
    id: string,
    changes: { name?: string; domains?: string[]; patterns?: string[] },
  ): Promise<VendorLineRecord> {
    const row = await tx.vendorServiceLine.update({
      where: { id },
      data: {
        ...(changes.name !== undefined ? { name: changes.name, normalizedName: searchKey(changes.name) } : {}),
        ...(changes.domains !== undefined ? { domains: changes.domains } : {}),
        ...(changes.patterns !== undefined ? { patterns: changes.patterns } : {}),
      },
    });

    return toLine(row);
  }

  async lineExists(tx: DbTx, id: string): Promise<boolean> {
    return (await tx.vendorServiceLine.count({ where: { id } })) > 0;
  }

  /** A service line with its vendor group, or null. Lines are never deleted, so no lock is needed to rely on one. */
  async findLineWithGroup(
    tx: DbTx,
    id: string,
  ): Promise<{ lineId: string; lineName: string; groupId: string; groupName: string } | null> {
    const row = await tx.vendorServiceLine.findUnique({ where: { id }, include: { group: true } });

    return row ? { lineId: row.id, lineName: row.name, groupId: row.groupId, groupName: row.group.name } : null;
  }

  /** One page of groups with their lines, by name, and the total for the same filter, from one snapshot. */
  async listGroups(filter: VendorGroupListFilter): Promise<{ items: VendorGroupRecord[]; total: number }> {
    const key = filter.search ? searchKey(filter.search) : '';
    const where: Prisma.VendorGroupWhereInput = key
      ? {
          OR: [
            { normalizedName: { contains: key } },
            { serviceLines: { some: { normalizedName: { contains: key } } } },
          ],
        }
      : {};

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.vendorGroup.findMany({
          where,
          include: { serviceLines: LINES_IN_ORDER },
          orderBy: [{ normalizedName: 'asc' }, { id: 'asc' }],
          skip: filter.skip,
          take: filter.take,
        });

        return { items: rows.map(toGroup), total: await tx.vendorGroup.count({ where }) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /** Every service line with what recognising it needs; the dictionary is a few hundred rows at most (T-D2). */
  async listMatchable(): Promise<MatchableLine[]> {
    const rows = await this.prisma.vendorServiceLine.findMany({ include: { group: true }, ...LINES_IN_ORDER });

    return rows.map((row) => ({
      lineId: row.id,
      lineName: row.name,
      groupId: row.groupId,
      groupName: row.group.name,
      domains: row.domains,
      patterns: row.patterns,
      groupDomains: row.group.brandDomains,
    }));
  }
}
