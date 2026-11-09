import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { usageSourceTemplateJson } from './vendor-source-template.json';
import type { NewSource, SourceRecord } from './vendor-source.types';

type Row = Prisma.UsageSourceGetPayload<object>;

/** The source as a record of the domain: its template read through the codec of its column. */
export const toSourceRecord = (row: Row): SourceRecord => ({
  id: row.id,
  organizationId: row.organizationId,
  applicationId: row.applicationId,
  name: row.name,
  identifierType: row.identifierType,
  reportShape: row.reportShape,
  template: usageSourceTemplateJson.decode(row.template),
  timeZone: row.timeZone,
  activityDefinition: row.activityDefinition,
  definitionStrictness: row.definitionStrictness,
  evidenceDirection: row.evidenceDirection,
  capabilities: {
    memberList: row.capMemberList,
    lastActivity: row.capLastActivity,
    eventDetail: row.capEventDetail,
    maxHistoryDays: row.capMaxHistoryDays,
  },
  retiredAt: row.retiredAt,
  createdByAppUserId: row.createdByAppUserId,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/** The one writer of `usage_sources`. */
@Injectable()
export class VendorSourceRepo {
  constructor(private readonly prisma: PrismaService) {}

  async create(tx: DbTx, input: NewSource): Promise<SourceRecord> {
    const row = await tx.usageSource.create({
      data: {
        organizationId: input.organizationId,
        applicationId: input.applicationId,
        name: input.name,
        identifierType: input.identifierType,
        reportShape: input.reportShape,
        template: usageSourceTemplateJson.encode(input.template),
        timeZone: input.timeZone,
        activityDefinition: input.activityDefinition,
        definitionStrictness: input.definitionStrictness,
        evidenceDirection: input.evidenceDirection,
        capMemberList: input.capabilities.memberList,
        capLastActivity: input.capabilities.lastActivity,
        capEventDetail: input.capabilities.eventDetail,
        capMaxHistoryDays: input.capabilities.maxHistoryDays,
        createdByAppUserId: input.createdByAppUserId,
      },
    });

    return toSourceRecord(row);
  }

  async find(id: string, tx?: DbTx): Promise<SourceRecord | null> {
    const row = await (tx ?? this.prisma).usageSource.findUnique({ where: { id } });

    return row ? toSourceRecord(row) : null;
  }

  /** The source, locked `FOR UPDATE` until the transaction ends: imports of one source take their turn here. */
  async lock(tx: DbTx, id: string): Promise<SourceRecord | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM usage_sources WHERE id = ${id}::uuid FOR UPDATE`;
    if (locked.length === 0) return null;

    return this.find(id, tx);
  }

  async page(filter: {
    applicationId?: string;
    skip: number;
    take: number;
  }): Promise<{ items: SourceRecord[]; total: number }> {
    const where = filter.applicationId ? { applicationId: filter.applicationId } : {};
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.usageSource.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: filter.skip,
        take: filter.take,
      }),
      this.prisma.usageSource.count({ where }),
    ]);

    return { items: rows.map(toSourceRecord), total };
  }

  async update(
    tx: DbTx,
    id: string,
    next: Omit<NewSource, 'organizationId' | 'createdByAppUserId'>,
  ): Promise<SourceRecord> {
    const row = await tx.usageSource.update({
      where: { id },
      data: {
        applicationId: next.applicationId,
        name: next.name,
        identifierType: next.identifierType,
        reportShape: next.reportShape,
        template: usageSourceTemplateJson.encode(next.template),
        timeZone: next.timeZone,
        activityDefinition: next.activityDefinition,
        definitionStrictness: next.definitionStrictness,
        evidenceDirection: next.evidenceDirection,
        capMemberList: next.capabilities.memberList,
        capLastActivity: next.capabilities.lastActivity,
        capEventDetail: next.capabilities.eventDetail,
        capMaxHistoryDays: next.capabilities.maxHistoryDays,
        updatedAt: new Date(),
      },
    });

    return toSourceRecord(row);
  }

  /** Whether a name is already one of this application sources. */
  async nameTaken(organizationId: string, applicationId: string, name: string, exceptId?: string): Promise<boolean> {
    const found = await this.prisma.usageSource.findFirst({
      where: { organizationId, applicationId, name, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
      select: { id: true },
    });

    return found !== null;
  }

  /** Whether an import of the source was ever confirmed: then who it identifies and which application it is for no longer change. */
  async hasCompletedImport(id: string, tx?: DbTx): Promise<boolean> {
    const found = await (tx ?? this.prisma).usageImport.findFirst({
      where: { sourceId: id, status: 'COMPLETED' },
      select: { id: true },
    });

    return found !== null;
  }
}
