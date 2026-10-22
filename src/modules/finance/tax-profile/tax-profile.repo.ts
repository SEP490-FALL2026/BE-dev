import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { searchKey } from '../../../core/search-key';
import type { TaxGroup } from '../finance.types';
import type { TaxLineRecord, TaxProfileVersion } from './tax-profile.types';

const WITH_LINES = { lines: { orderBy: { position: 'asc' } } } as const;
type VersionRow = Prisma.VendorTaxProfileVersionGetPayload<{ include: typeof WITH_LINES }>;

const toVersion = (row: VersionRow): TaxProfileVersion => ({
  vendorId: row.vendorId,
  version: row.version,
  group: row.taxGroup,
  lines: row.lines.map((line) => ({ taxType: line.taxType, rateBp: line.rateBp, deductible: line.deductible })),
  declaredByAppUserId: row.declaredByAppUserId,
  declaredAt: row.declaredAt,
});

/**
 * The one writer of `vendor_tax_profiles`, `vendor_tax_profile_versions` and `vendor_tax_profile_lines`. The head is the
 * only row that moves; a version and its lines are written once and the database refuses to change them.
 */
@Injectable()
export class TaxProfileRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** Makes the head row of the vendor if there is none. A vendor that does not exist fails the foreign key (23503). */
  async ensureHead(tx: DbTx, vendorId: string, organizationId: string): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO vendor_tax_profiles (vendor_id, organization_id, current_version)
      VALUES (${vendorId}::uuid, ${organizationId}::uuid, 0)
      ON CONFLICT (vendor_id) DO NOTHING`;
  }

  /** Locks the head for the rest of the transaction, so two declarations for one vendor queue; its current version. */
  async lockCurrentVersion(tx: DbTx, vendorId: string): Promise<number> {
    const rows = await tx.$queryRaw<{ current_version: number }[]>`
      SELECT current_version FROM vendor_tax_profiles WHERE vendor_id = ${vendorId}::uuid FOR UPDATE`;

    return rows[0].current_version;
  }

  async readVersion(vendorId: string, version: number, tx?: DbTx): Promise<TaxProfileVersion | null> {
    const row = await (tx ?? this.prisma).vendorTaxProfileVersion.findUnique({
      where: { vendorId_version: { vendorId, version } },
      include: WITH_LINES,
    });

    return row ? toVersion(row) : null;
  }

  /** The newest declaration of the vendor, or null when it has none. */
  async readCurrent(vendorId: string, tx?: DbTx): Promise<TaxProfileVersion | null> {
    const client = tx ?? this.prisma;
    const head = await client.vendorTaxProfile.findUnique({ where: { vendorId } });
    if (!head || head.currentVersion === 0) return null;

    return this.readVersion(vendorId, head.currentVersion, tx);
  }

  async insertVersion(
    tx: DbTx,
    input: {
      vendorId: string;
      version: number;
      group: TaxGroup;
      lines: TaxLineRecord[];
      declaredByAppUserId: string;
    },
  ): Promise<TaxProfileVersion> {
    const row = await tx.vendorTaxProfileVersion.create({
      data: {
        vendorId: input.vendorId,
        version: input.version,
        taxGroup: input.group,
        declaredByAppUserId: input.declaredByAppUserId,
        lines: {
          create: input.lines.map((line, index) => ({
            position: index + 1,
            taxType: line.taxType,
            normalizedTaxType: searchKey(line.taxType),
            rateBp: line.rateBp,
            deductible: line.deductible,
          })),
        },
      },
      include: WITH_LINES,
    });

    return toVersion(row);
  }

  async setCurrentVersion(tx: DbTx, vendorId: string, version: number): Promise<void> {
    await tx.vendorTaxProfile.update({ where: { vendorId }, data: { currentVersion: version } });
  }

  /** One page of the declarations of a vendor, newest first, and the total, from one snapshot. */
  async history(vendorId: string, skip: number, take: number): Promise<{ items: TaxProfileVersion[]; total: number }> {
    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.vendorTaxProfileVersion.findMany({
          where: { vendorId },
          include: WITH_LINES,
          orderBy: { version: 'desc' },
          skip,
          take,
        });

        return { items: rows.map(toVersion), total: await tx.vendorTaxProfileVersion.count({ where: { vendorId } }) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /** The group and version of the newest declaration of each vendor id given; an id with none is absent. */
  async currentGroups(vendorIds: readonly string[]): Promise<Map<string, { group: TaxGroup; version: number }>> {
    if (vendorIds.length === 0) return new Map();
    const heads = await this.prisma.vendorTaxProfile.findMany({
      where: { vendorId: { in: [...vendorIds] }, currentVersion: { gt: 0 } },
    });
    const versions = await this.prisma.vendorTaxProfileVersion.findMany({
      where: { OR: heads.map((head) => ({ vendorId: head.vendorId, version: head.currentVersion })) },
      select: { vendorId: true, version: true, taxGroup: true },
    });

    return new Map(
      versions.map((version) => [version.vendorId, { group: version.taxGroup, version: version.version }]),
    );
  }

  /** The ids of every vendor that has at least one declaration. */
  async declaredVendorIds(): Promise<string[]> {
    const heads = await this.prisma.vendorTaxProfile.findMany({
      where: { currentVersion: { gt: 0 } },
      select: { vendorId: true },
    });

    return heads.map((head) => head.vendorId);
  }
}
