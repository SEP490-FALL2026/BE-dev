import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { searchKey } from '../vendor-dictionary/vendor-matcher';
import type {
  ApplicationChanges,
  ApplicationKind,
  ApplicationListFilter,
  ApplicationRecord,
  CatalogStatus,
  NewApplication,
} from './application.types';

const WITH_RELATIONS = { vendor: true, functionalGroup: true } as const;
type Row = Prisma.ApplicationGetPayload<{ include: typeof WITH_RELATIONS }>;

const toRecord = (row: Row): ApplicationRecord => ({
  id: row.id,
  name: row.name,
  kind: row.kind,
  vendor: row.vendor
    ? { id: row.vendor.id, name: row.vendor.name, dictionaryGroupId: row.vendor.dictionaryGroupId }
    : null,
  dictionaryServiceLineId: row.dictionaryLineId,
  domains: row.domains,
  dataSensitivity: row.dataSensitivity,
  businessOwnerEmployeeId: row.businessOwnerEmployeeId,
  communication: {
    personToPersonMessaging: row.commPersonToPersonMessaging,
    callsOrMeetings: row.commCallsOrMeetings,
    mailbox: row.commMailbox,
    isCommunicationService: row.isCommunicationService,
    note: row.communicationNote,
  },
  functionalGroup: row.functionalGroup ? { id: row.functionalGroup.id, name: row.functionalGroup.name } : null,
  status: row.catalogStatus,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

/** The one writer of `applications`: the catalog of software the organization manages (US-04-01). */
@Injectable()
export class ApplicationRepo {
  constructor(private readonly prisma: PrismaService) {}

  async insert(tx: DbTx, input: NewApplication): Promise<ApplicationRecord> {
    const row = await tx.application.create({
      data: {
        organizationId: input.organizationId,
        kind: input.kind,
        vendorId: input.vendorId,
        name: input.name,
        normalizedName: searchKey(input.name),
        dictionaryLineId: input.dictionaryServiceLineId,
        functionalGroupId: input.functionalGroupId,
        businessOwnerEmployeeId: input.businessOwnerEmployeeId,
        dataSensitivity: input.dataSensitivity,
        commPersonToPersonMessaging: input.communication.personToPersonMessaging,
        commCallsOrMeetings: input.communication.callsOrMeetings,
        commMailbox: input.communication.mailbox,
        isCommunicationService: input.communication.isCommunicationService,
        communicationNote: input.communication.note,
        domains: input.domains,
      },
      include: WITH_RELATIONS,
    });

    return toRecord(row);
  }

  /** The application, locked for the rest of the transaction, or null. */
  async lock(tx: DbTx, id: string): Promise<ApplicationRecord | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM applications WHERE id = ${id}::uuid FOR UPDATE`;
    if (locked.length === 0) return null;

    return this.find(id, tx);
  }

  async count(): Promise<number> {
    return this.prisma.application.count();
  }

  async find(id: string, tx?: DbTx): Promise<ApplicationRecord | null> {
    const row = await (tx ?? this.prisma).application.findUnique({ where: { id }, include: WITH_RELATIONS });

    return row ? toRecord(row) : null;
  }

  async update(tx: DbTx, id: string, changes: ApplicationChanges): Promise<ApplicationRecord> {
    const communication = changes.communication;
    const row = await tx.application.update({
      where: { id },
      data: {
        ...(changes.name !== undefined ? { name: changes.name, normalizedName: searchKey(changes.name) } : {}),
        ...(changes.dictionaryServiceLineId !== undefined ? { dictionaryLineId: changes.dictionaryServiceLineId } : {}),
        ...(changes.functionalGroupId !== undefined ? { functionalGroupId: changes.functionalGroupId } : {}),
        ...(changes.businessOwnerEmployeeId !== undefined
          ? { businessOwnerEmployeeId: changes.businessOwnerEmployeeId }
          : {}),
        ...(changes.dataSensitivity !== undefined ? { dataSensitivity: changes.dataSensitivity } : {}),
        ...(changes.domains !== undefined ? { domains: changes.domains } : {}),
        ...(communication
          ? {
              commPersonToPersonMessaging: communication.personToPersonMessaging,
              commCallsOrMeetings: communication.callsOrMeetings,
              commMailbox: communication.mailbox,
              isCommunicationService: communication.isCommunicationService,
              communicationNote: communication.note,
            }
          : {}),
      },
      include: WITH_RELATIONS,
    });

    return toRecord(row);
  }

  /**
   * The application as another capability may rely on it: locked `FOR SHARE` for the rest of the transaction, so it
   * cannot be retired under the caller. Null when it does not exist.
   */
  async lockShared(
    tx: DbTx,
    id: string,
  ): Promise<{ id: string; name: string; kind: ApplicationKind; status: CatalogStatus } | null> {
    const rows = await tx.$queryRaw<
      { id: string; name: string; kind: ApplicationKind; catalog_status: CatalogStatus }[]
    >`
      SELECT id, name, kind, catalog_status FROM applications WHERE id = ${id}::uuid FOR SHARE`;

    return rows.length === 0
      ? null
      : { id: rows[0].id, name: rows[0].name, kind: rows[0].kind, status: rows[0].catalog_status };
  }

  /** Opens a Business Owner period for the application: the person, now, and who made the change. */
  async openOwnerPeriod(
    tx: DbTx,
    input: { applicationId: string; employeeId: string; assignedByAppUserId: string },
  ): Promise<void> {
    await tx.applicationBusinessOwner.create({ data: input });
  }

  /** Closes the open Business Owner period of the application, if it has one. */
  async closeOpenOwnerPeriod(tx: DbTx, applicationId: string): Promise<void> {
    await tx.applicationBusinessOwner.updateMany({
      where: { applicationId, endedAt: null },
      data: { endedAt: new Date() },
    });
  }

  /** The Business Owner periods of an application, the latest first. */
  listOwnerPeriods(applicationId: string) {
    return this.prisma.applicationBusinessOwner.findMany({
      where: { applicationId },
      orderBy: [{ assignedAt: 'desc' }, { id: 'desc' }],
    });
  }

  /** The distinct Business Owners of all applications now: whose status decides which applications need a new one. */
  async currentOwnerIds(): Promise<string[]> {
    const rows = await this.prisma.application.findMany({
      distinct: ['businessOwnerEmployeeId'],
      select: { businessOwnerEmployeeId: true },
    });

    return rows.map((row) => row.businessOwnerEmployeeId);
  }

  /** One page of the applications of these Business Owners, by name, and the total, from one snapshot. */
  async listByOwners(
    ownerIds: readonly string[],
    skip: number,
    take: number,
  ): Promise<{
    items: { id: string; name: string; kind: ApplicationKind; businessOwnerEmployeeId: string }[];
    total: number;
  }> {
    const where: Prisma.ApplicationWhereInput = { businessOwnerEmployeeId: { in: [...ownerIds] } };

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.application.findMany({
          where,
          select: { id: true, name: true, kind: true, businessOwnerEmployeeId: true },
          orderBy: [{ normalizedName: 'asc' }, { id: 'asc' }],
          skip,
          take,
        });

        return { items: rows, total: await tx.application.count({ where }) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /** The other approved applications of a functional group, by name: the similar tools. */
  async similarTo(group: string, excludingId: string): Promise<{ id: string; name: string }[]> {
    const rows = await this.prisma.application.findMany({
      where: { functionalGroupId: group, id: { not: excludingId }, catalogStatus: 'APPROVED' },
      select: { id: true, name: true },
      orderBy: [{ normalizedName: 'asc' }, { id: 'asc' }],
    });

    return rows;
  }

  /** One page by name and the total for the same filter, from one snapshot. */
  async list(filter: ApplicationListFilter): Promise<{ items: ApplicationRecord[]; total: number }> {
    const key = filter.search ? searchKey(filter.search) : '';
    const where: Prisma.ApplicationWhereInput = {
      ...(key
        ? {
            OR: [{ normalizedName: { contains: key } }, { vendor: { is: { normalizedName: { contains: key } } } }],
          }
        : {}),
      ...(filter.kind ? { kind: filter.kind } : {}),
      ...(filter.status ? { catalogStatus: filter.status } : {}),
      ...(filter.functionalGroupId ? { functionalGroupId: filter.functionalGroupId } : {}),
    };

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.application.findMany({
          where,
          include: WITH_RELATIONS,
          orderBy: [{ normalizedName: 'asc' }, { id: 'asc' }],
          skip: filter.skip,
          take: filter.take,
        });

        return { items: rows.map(toRecord), total: await tx.application.count({ where }) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
