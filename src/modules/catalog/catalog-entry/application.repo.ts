import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { searchKey } from '../vendor-dictionary/vendor-matcher.policy';
import type {
  ApplicationChanges,
  ApplicationKind,
  ApplicationListFilter,
  ApplicationRecord,
  ApplicationSummaryRecord,
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
  logoUrl: row.logoUrl,
  responsibleItAdminEmployeeId: row.responsibleItAdminEmployeeId,
  isCommunicationService: row.functionalGroup.systemKey === 'COMMUNICATION',
  functionalGroup: { id: row.functionalGroup.id, name: row.functionalGroup.name },
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
        responsibleItAdminEmployeeId: input.responsibleItAdminEmployeeId,
        dataSensitivity: input.dataSensitivity,
        logoUrl: input.logoUrl,
        domains: input.domains,
      },
      include: WITH_RELATIONS,
    });

    return toRecord(row);
  }

  /** Names the IT Admin responsible for the application (`QĐ-111g`): the one writer of the column after the declaration. */
  async setResponsible(tx: DbTx, id: string, employeeId: string): Promise<void> {
    await tx.application.update({ where: { id }, data: { responsibleItAdminEmployeeId: employeeId } });
  }

  /**
   * Hands every application that names `fromEmployeeId` responsible to `toEmployeeId` (`QĐ-111g`), in one statement: the rows are locked in
   * id order first, so a handing over and the transfer of one application queue up. Returns the ids it moved, in id order.
   */
  async reassignResponsible(tx: DbTx, fromEmployeeId: string, toEmployeeId: string): Promise<string[]> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      WITH held AS (
        SELECT id FROM applications WHERE responsible_it_admin_employee_id = ${fromEmployeeId}::uuid ORDER BY id FOR UPDATE)
      UPDATE applications a
         SET responsible_it_admin_employee_id = ${toEmployeeId}::uuid, updated_at = now()
        FROM held WHERE a.id = held.id
      RETURNING a.id`;

    return rows.map((row) => row.id).sort();
  }

  /** How many applications name each of these IT Admins responsible (`QĐ-111g`); one who answers for none is absent. */
  async countResponsibleOf(employeeIds: readonly string[], tx?: DbTx): Promise<Map<string, number>> {
    if (employeeIds.length === 0) return new Map();
    const rows = await (tx ?? this.prisma).$queryRaw<{ employee_id: string; total: number }[]>`
      SELECT responsible_it_admin_employee_id AS employee_id, count(*)::int AS total
        FROM applications WHERE responsible_it_admin_employee_id = ANY(${[...employeeIds]}::uuid[])
       GROUP BY responsible_it_admin_employee_id`;

    return new Map(rows.map((row) => [row.employee_id, row.total]));
  }

  /**
   * Takes the lock of the duplicate check of the organization for the rest of the transaction: two declarations of the same software queue up, so the
   * second one sees the first and is refused with it instead of both passing a check that neither has seen the other through.
   */
  async lockDuplicateCheck(tx: DbTx, organizationId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`application-duplicate:${organizationId}`}, 0))`;
  }

  /**
   * The approved applications that may be the same software as a candidate: the same normalized name, or a domain in common (the hosts are as the catalog
   * stores them). The caller's rule (`duplicateOf`) says which one it is; at most twenty, by name.
   */
  async duplicateCandidates(
    tx: DbTx,
    normalizedName: string,
    hosts: readonly string[],
  ): Promise<
    {
      id: string;
      name: string;
      domains: string[];
      vendorName: string | null;
      functionalGroup: { id: string; name: string };
    }[]
  > {
    const rows = await tx.application.findMany({
      where: {
        catalogStatus: 'APPROVED',
        OR: [{ normalizedName }, ...(hosts.length > 0 ? [{ domains: { hasSome: [...hosts] } }] : [])],
      },
      select: {
        id: true,
        name: true,
        domains: true,
        vendor: { select: { name: true } },
        functionalGroup: { select: { id: true, name: true } },
      },
      orderBy: [{ normalizedName: 'asc' }, { id: 'asc' }],
      take: 20,
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      domains: row.domains,
      vendorName: row.vendor?.name ?? null,
      functionalGroup: row.functionalGroup,
    }));
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
    const row = await tx.application.update({
      where: { id },
      data: {
        ...(changes.name !== undefined ? { name: changes.name, normalizedName: searchKey(changes.name) } : {}),
        ...(changes.dictionaryServiceLineId !== undefined ? { dictionaryLineId: changes.dictionaryServiceLineId } : {}),
        ...(changes.functionalGroupId !== undefined ? { functionalGroupId: changes.functionalGroupId } : {}),
        ...(changes.dataSensitivity !== undefined ? { dataSensitivity: changes.dataSensitivity } : {}),
        ...(changes.logoUrl !== undefined ? { logoUrl: changes.logoUrl } : {}),
        ...(changes.domains !== undefined ? { domains: changes.domains } : {}),
      },
      include: WITH_RELATIONS,
    });

    return toRecord(row);
  }

  /** Retires the application: the one writer of its retirement columns. A retired application never comes back (the database refuses it). */
  async markRetired(
    tx: DbTx,
    applicationId: string,
    input: { appUserId: string; confirmationId: string | null; now: Date },
  ): Promise<void> {
    await tx.application.update({
      where: { id: applicationId },
      data: {
        catalogStatus: 'RETIRED',
        retiredAt: input.now,
        retiredByAppUserId: input.appUserId,
        retirementConfirmationId: input.confirmationId,
      },
    });
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

  /** The first `take` other approved applications of a functional group, by name: the similar tools, and how many there are. */
  async similarTo(
    group: string,
    excludingId: string,
    take: number,
  ): Promise<{ items: { id: string; name: string }[]; total: number }> {
    const where: Prisma.ApplicationWhereInput = {
      functionalGroupId: group,
      id: { not: excludingId },
      catalogStatus: 'APPROVED',
    };

    return this.prisma.$transaction(
      async (tx) => ({
        items: await tx.application.findMany({
          where,
          select: { id: true, name: true },
          orderBy: [{ normalizedName: 'asc' }, { id: 'asc' }],
          take,
        }),
        total: await tx.application.count({ where }),
      }),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /**
   * One page of summaries by name and the total for the same filter, from one snapshot. Only the columns of the list are
   * selected (`LD-04`): the domains and the communication note are a detail's.
   */
  async listSummaries(filter: ApplicationListFilter): Promise<{ items: ApplicationSummaryRecord[]; total: number }> {
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
          select: {
            id: true,
            name: true,
            kind: true,
            catalogStatus: true,
            dataSensitivity: true,
            logoUrl: true,
            responsibleItAdminEmployeeId: true,
            updatedAt: true,
            vendor: { select: { id: true, name: true } },
            functionalGroup: { select: { id: true, name: true, systemKey: true } },
          },
          orderBy: [{ normalizedName: 'asc' }, { id: 'asc' }],
          skip: filter.skip,
          take: filter.take,
        });

        return {
          items: rows.map((row) => ({
            id: row.id,
            name: row.name,
            kind: row.kind,
            vendor: row.vendor,
            dataSensitivity: row.dataSensitivity,
            logoUrl: row.logoUrl,
            responsibleItAdminEmployeeId: row.responsibleItAdminEmployeeId,
            isCommunicationService: row.functionalGroup.systemKey === 'COMMUNICATION',
            functionalGroup: { id: row.functionalGroup.id, name: row.functionalGroup.name },
            status: row.catalogStatus,
            updatedAt: row.updatedAt,
          })),
          total: await tx.application.count({ where }),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  /** What a proposal that names an application of the catalog needs to know of it: its name, whether it is still in the catalog, and its vendor; null when it does not exist. */
  async entryFacts(
    id: string,
    tx?: DbTx,
  ): Promise<{
    id: string;
    name: string;
    catalogStatus: 'APPROVED' | 'RETIRED';
    vendor: { id: string; name: string } | null;
  } | null> {
    return (tx ?? this.prisma).application.findUnique({
      where: { id },
      select: { id: true, name: true, catalogStatus: true, vendor: { select: { id: true, name: true } } },
    });
  }

  /**
   * The applications with these ids, for a decision on what a collector may report; those that do not exist are absent. An application is a
   * communication service when it stands in the group Liên lạc (`QĐ-111e`): the group says it, no flag of the row is read.
   */
  async collectorApplications(
    ids: readonly string[],
    tx?: DbTx,
  ): Promise<
    {
      id: string;
      name: string;
      kind: ApplicationKind;
      logoUrl: string | null;
      isCommunicationService: boolean;
      retiredAt: Date | null;
    }[]
  > {
    const rows = await (tx ?? this.prisma).application.findMany({
      where: { id: { in: [...ids] } },
      select: {
        id: true,
        name: true,
        kind: true,
        logoUrl: true,
        retiredAt: true,
        functionalGroup: { select: { systemKey: true } },
      },
      orderBy: { id: 'asc' },
    });

    return rows.map(({ functionalGroup, ...row }) => ({
      ...row,
      isCommunicationService: functionalGroup?.systemKey === 'COMMUNICATION',
    }));
  }

  /** The name of each of these applications, by id, in one read; an id that does not exist is absent (a retired application keeps its name). */
  async namesOf(ids: readonly string[], tx?: DbTx): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await (tx ?? this.prisma).application.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, name: true },
    });

    return new Map(rows.map((row) => [row.id, row.name]));
  }
}
