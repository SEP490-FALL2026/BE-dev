import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { PolicyRole } from '../public/policies.types';
import { policyContentJson } from './library.json';
import type {
  DraftValues,
  PolicyRecord,
  PolicyVersionRecord,
  PublishedVersionRecord,
  PublishValues,
  VersionFacts,
} from './library.types';

const VERSION_SELECT = {
  id: true,
  policyId: true,
  versionNumber: true,
  title: true,
  content: true,
  applicableRoles: true,
  changeNote: true,
  requiresReacknowledgement: true,
  publishedByAppUserId: true,
  publishedAt: true,
  updatedAt: true,
  policy: { select: { code: true } },
} as const;

interface VersionRow {
  id: string;
  policyId: string;
  versionNumber: number | null;
  title: string;
  content: unknown;
  applicableRoles: PolicyRole[];
  changeNote: string | null;
  requiresReacknowledgement: boolean;
  publishedByAppUserId: string | null;
  publishedAt: Date | null;
  updatedAt: Date;
  policy: { code: string };
}

function toVersion(row: VersionRow): PolicyVersionRecord {
  return {
    id: row.id,
    policyId: row.policyId,
    policyCode: row.policy.code,
    versionNumber: row.versionNumber,
    title: row.title,
    content: policyContentJson.decode(row.content),
    applicableRoles: row.applicableRoles,
    changeNote: row.changeNote,
    requiresReacknowledgement: row.requiresReacknowledgement,
    publishedByAppUserId: row.publishedByAppUserId,
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt,
  };
}

function toPublished(row: VersionRow): PublishedVersionRecord {
  const version = toVersion(row);
  if (version.versionNumber === null || version.changeNote === null || version.publishedAt === null) {
    throw new Error('A version read as published has no number, ground or time');
  }

  return {
    ...version,
    versionNumber: version.versionNumber,
    changeNote: version.changeNote,
    publishedAt: version.publishedAt,
  };
}

/** The policies of the library, their versions and the one open draft of each: the rows are added to; a published version is never changed. */
@Injectable()
export class LibraryRepo {
  constructor(private readonly prisma: PrismaService) {}

  /** Takes the row of the policy until the transaction ends, so drafts and publications of one policy follow each other. Null when no policy has this code. */
  async lockPolicy(tx: DbTx, organizationId: string, code: string): Promise<{ id: string } | null> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM policies WHERE organization_id = ${organizationId}::uuid AND code = ${code} FOR UPDATE`;

    return rows[0] ?? null;
  }

  findPolicy(organizationId: string, code: string, tx?: DbTx): Promise<{ id: string; code: string } | null> {
    return (tx ?? this.prisma).policy.findUnique({
      where: { organizationId_code: { organizationId, code } },
      select: { id: true, code: true },
    });
  }

  /** A page of policies by code with the version in force and whether a draft is open; the total counts every policy. */
  async policyPage(
    organizationId: string,
    skip: number,
    take: number,
  ): Promise<{ rows: PolicyRecord[]; total: number }> {
    const [total, policies] = await this.prisma.$transaction([
      this.prisma.policy.count({ where: { organizationId } }),
      this.prisma.policy.findMany({
        where: { organizationId },
        orderBy: [{ code: 'asc' }, { id: 'asc' }],
        skip,
        take,
        select: { id: true, code: true },
      }),
    ]);
    const ids = policies.map((policy) => policy.id);
    const [published, drafts] = await Promise.all([
      this.prisma.policyVersion.findMany({
        where: { policyId: { in: ids }, versionNumber: { not: null } },
        orderBy: [{ policyId: 'asc' }, { versionNumber: 'desc' }],
        distinct: ['policyId'],
        select: VERSION_SELECT,
      }),
      this.prisma.policyVersion.findMany({
        where: { policyId: { in: ids }, versionNumber: null },
        select: { policyId: true },
      }),
    ]);
    const currentOf = new Map(published.map((row) => [row.policyId, toPublished(row)]));
    const withDraft = new Set(drafts.map((row) => row.policyId));

    return {
      total,
      rows: policies.map((policy) => ({
        id: policy.id,
        code: policy.code,
        current: currentOf.get(policy.id) ?? null,
        hasDraft: withDraft.has(policy.id),
      })),
    };
  }

  /** The numbers and flags of every published version of these policies, which the acknowledgement of everyone is judged by. */
  async versionFacts(policyIds: readonly string[], tx?: DbTx): Promise<VersionFacts[]> {
    return (tx ?? this.prisma).policyVersion.findMany({
      where: { policyId: { in: [...policyIds] }, versionNumber: { not: null } },
      select: { policyId: true, versionNumber: true, requiresReacknowledgement: true },
    }) as Promise<VersionFacts[]>;
  }

  async current(policyId: string, tx?: DbTx): Promise<PublishedVersionRecord | null> {
    const row = await (tx ?? this.prisma).policyVersion.findFirst({
      where: { policyId, versionNumber: { not: null } },
      orderBy: { versionNumber: 'desc' },
      select: VERSION_SELECT,
    });

    return row ? toPublished(row) : null;
  }

  async byNumber(policyId: string, versionNumber: number, tx?: DbTx): Promise<PublishedVersionRecord | null> {
    const row = await (tx ?? this.prisma).policyVersion.findUnique({
      where: { policyId_versionNumber: { policyId, versionNumber } },
      select: VERSION_SELECT,
    });

    return row ? toPublished(row) : null;
  }

  /** A page of the published versions, the newest first. */
  async versionPage(
    policyId: string,
    skip: number,
    take: number,
  ): Promise<{ rows: PublishedVersionRecord[]; total: number }> {
    const where = { policyId, versionNumber: { not: null } };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.policyVersion.count({ where }),
      this.prisma.policyVersion.findMany({
        where,
        orderBy: [{ versionNumber: 'desc' }, { id: 'asc' }],
        skip,
        take,
        select: VERSION_SELECT,
      }),
    ]);

    return { total, rows: rows.map(toPublished) };
  }

  async draft(policyId: string, tx?: DbTx): Promise<PolicyVersionRecord | null> {
    const row = await (tx ?? this.prisma).policyVersion.findFirst({
      where: { policyId, versionNumber: null },
      select: VERSION_SELECT,
    });

    return row ? toVersion(row) : null;
  }

  async insertDraft(
    tx: DbTx,
    input: DraftValues & { organizationId: string; policyId: string; draftedByAppUserId: string },
  ): Promise<PolicyVersionRecord> {
    const row = await tx.policyVersion.create({
      data: {
        organizationId: input.organizationId,
        policyId: input.policyId,
        title: input.title,
        content: policyContentJson.encode(input.content),
        applicableRoles: input.applicableRoles,
        draftedByAppUserId: input.draftedByAppUserId,
      },
      select: VERSION_SELECT,
    });

    return toVersion(row);
  }

  async updateDraft(tx: DbTx, id: string, values: DraftValues): Promise<PolicyVersionRecord> {
    const row = await tx.policyVersion.update({
      where: { id },
      data: {
        title: values.title,
        content: policyContentJson.encode(values.content),
        applicableRoles: values.applicableRoles,
      },
      select: VERSION_SELECT,
    });

    return toVersion(row);
  }

  async deleteDraft(tx: DbTx, id: string): Promise<void> {
    await tx.policyVersion.delete({ where: { id } });
  }

  /** The highest published number of the policy; 0 before the first. */
  async lastNumber(tx: DbTx, policyId: string): Promise<number> {
    const last = await tx.policyVersion.aggregate({ where: { policyId }, _max: { versionNumber: true } });

    return last._max.versionNumber ?? 0;
  }

  /** The one update that turns the draft into the published version. */
  async publishDraft(tx: DbTx, id: string, values: PublishValues): Promise<PublishedVersionRecord> {
    const row = await tx.policyVersion.update({
      where: { id },
      data: {
        versionNumber: values.versionNumber,
        changeNote: values.changeNote,
        applicableRoles: values.applicableRoles,
        requiresReacknowledgement: values.requiresReacknowledgement,
        publishedByAppUserId: values.publishedByAppUserId,
        publishedAt: values.publishedAt,
      },
      select: VERSION_SELECT,
    });

    return toPublished(row);
  }
}
