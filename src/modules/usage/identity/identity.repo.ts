import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { UsageIdentifierType } from '../vendor-source/vendor-source.types';
import {
  MAX_CANDIDATES,
  type MappingRecord,
  type NewMapping,
  type NewUnmatched,
  type UnmatchedRecord,
  type UnmatchedStatus,
} from './identity.types';

const toMapping = (row: Prisma.UsageIdentityMappingGetPayload<object>): MappingRecord => ({ ...row });
const toUnmatched = (row: Prisma.UsageUnmatchedIdentityGetPayload<object>): UnmatchedRecord => ({ ...row });

/** The one writer of `usage_identity_mappings` and `usage_unmatched_identities`: who an identifier is, and who nobody could tell. */
@Injectable()
export class IdentityRepo {
  constructor(private readonly prisma: PrismaService) {}

  // --- mappings -------------------------------------------------------------------------

  /** The mappings in force for these identifiers of one application, by normalized identifier. */
  async mappingsInForce(
    applicationId: string,
    identifierType: UsageIdentifierType,
    normalizedIdentifiers: readonly string[],
    tx?: DbTx,
  ): Promise<Map<string, MappingRecord>> {
    if (normalizedIdentifiers.length === 0) return new Map();
    const rows = await (tx ?? this.prisma).usageIdentityMapping.findMany({
      where: { applicationId, identifierType, normalizedIdentifier: { in: [...normalizedIdentifiers] }, endedAt: null },
    });

    return new Map(rows.map((row) => [row.normalizedIdentifier, toMapping(row)]));
  }

  /** Writes the mapping unless one is in force already (the unique index of the identifier says which wins); returns its id or null. */
  async insertMappingIfAbsent(tx: DbTx, input: NewMapping): Promise<string | null> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO usage_identity_mappings (organization_id, application_id, identifier_type, normalized_identifier, raw_identifier,
        employee_id, method, confidence, confirmed_by_app_user_id)
      VALUES (${input.organizationId}::uuid, ${input.applicationId}::uuid, ${input.identifierType}::"UsageIdentifierType",
        ${input.normalizedIdentifier}, ${input.rawIdentifier}, ${input.employeeId}::uuid, ${input.method}::"UsageMatchMethod",
        ${input.confidence}::"UsageMatchConfidence", ${input.confirmedByAppUserId}::uuid)
      ON CONFLICT (organization_id, application_id, identifier_type, normalized_identifier) WHERE ended_at IS NULL DO NOTHING
      RETURNING id`;

    return rows[0]?.id ?? null;
  }

  async findMapping(id: string, tx?: DbTx): Promise<MappingRecord | null> {
    const row = await (tx ?? this.prisma).usageIdentityMapping.findUnique({ where: { id } });

    return row ? toMapping(row) : null;
  }

  /** The mapping, locked `FOR UPDATE` until the transaction ends. */
  async lockMapping(tx: DbTx, id: string): Promise<MappingRecord | null> {
    const locked = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM usage_identity_mappings WHERE id = ${id}::uuid FOR UPDATE`;

    return locked.length === 0 ? null : this.findMapping(id, tx);
  }

  async endMapping(tx: DbTx, id: string, input: { byAppUserId: string; reason: string; at: Date }): Promise<void> {
    await tx.usageIdentityMapping.update({
      where: { id },
      data: { endedAt: input.at, endedByAppUserId: input.byAppUserId, endReason: input.reason },
    });
  }

  async pageMappings(filter: {
    applicationId?: string;
    employeeId?: string;
    inForceOnly: boolean;
    skip: number;
    take: number;
  }): Promise<{ items: MappingRecord[]; total: number }> {
    const where: Prisma.UsageIdentityMappingWhereInput = {
      ...(filter.applicationId ? { applicationId: filter.applicationId } : {}),
      ...(filter.employeeId ? { employeeId: filter.employeeId } : {}),
      ...(filter.inForceOnly ? { endedAt: null } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.usageIdentityMapping.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: filter.skip,
        take: filter.take,
      }),
      this.prisma.usageIdentityMapping.count({ where }),
    ]);

    return { items: rows.map(toMapping), total };
  }

  // --- the queue of identifiers nobody could tell -----------------------------------------

  /**
   * Opens the identifier in the queue, or, when it is there and not resolved, tells it was seen again in the import (the reason and the
   * candidates are the latest). A dismissed identifier stays dismissed: dismissing does not hide it from the conclusions (`INV-12`).
   */
  async upsertUnmatched(tx: DbTx, input: NewUnmatched): Promise<void> {
    const candidates = input.candidateEmployeeIds.slice(0, MAX_CANDIDATES);
    await tx.$executeRaw`
      INSERT INTO usage_unmatched_identities (organization_id, application_id, source_id, identifier_type, normalized_identifier,
        raw_identifier, reason, status, candidate_employee_ids, first_import_id, last_import_id)
      VALUES (${input.organizationId}::uuid, ${input.applicationId}::uuid, ${input.sourceId}::uuid,
        ${input.identifierType}::"UsageIdentifierType", ${input.normalizedIdentifier}, ${input.rawIdentifier},
        ${input.reason}::"UsageUnmatchedReason", 'OPEN', ${candidates}::uuid[], ${input.importId}::uuid, ${input.importId}::uuid)
      ON CONFLICT (organization_id, application_id, identifier_type, normalized_identifier) WHERE status <> 'RESOLVED'
      DO UPDATE SET last_import_id = EXCLUDED.last_import_id, reason = EXCLUDED.reason,
        candidate_employee_ids = EXCLUDED.candidate_employee_ids, source_id = EXCLUDED.source_id`;
  }

  /** Marks the identifiers resolved by a mapping: they are matched now, so they leave the queue. */
  async resolveByMapping(
    tx: DbTx,
    input: {
      applicationId: string;
      identifierType: UsageIdentifierType;
      normalizedIdentifier: string;
      mappingId: string;
      byAppUserId: string;
      at: Date;
    },
  ): Promise<number> {
    const result = await tx.usageUnmatchedIdentity.updateMany({
      where: {
        applicationId: input.applicationId,
        identifierType: input.identifierType,
        normalizedIdentifier: input.normalizedIdentifier,
        status: { not: 'RESOLVED' },
      },
      data: {
        status: 'RESOLVED',
        resolvedMappingId: input.mappingId,
        handledByAppUserId: input.byAppUserId,
        handledAt: input.at,
      },
    });

    return result.count;
  }

  async findUnmatched(id: string, tx?: DbTx): Promise<UnmatchedRecord | null> {
    const row = await (tx ?? this.prisma).usageUnmatchedIdentity.findUnique({ where: { id } });

    return row ? toUnmatched(row) : null;
  }

  async lockUnmatched(tx: DbTx, id: string): Promise<UnmatchedRecord | null> {
    const locked = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM usage_unmatched_identities WHERE id = ${id}::uuid FOR UPDATE`;

    return locked.length === 0 ? null : this.findUnmatched(id, tx);
  }

  async setUnmatchedHandled(
    tx: DbTx,
    id: string,
    input: { status: UnmatchedStatus; byAppUserId: string; at: Date; note?: string | null; mappingId?: string | null },
  ): Promise<void> {
    await tx.usageUnmatchedIdentity.update({
      where: { id },
      data: {
        status: input.status,
        handledByAppUserId: input.byAppUserId,
        handledAt: input.at,
        note: input.note ?? null,
        resolvedMappingId: input.mappingId ?? null,
      },
    });
  }

  /**
   * The identifier of a mapping that was ended goes back to the queue as `OPEN`, so the next report cannot tie it to anyone until the IT
   * Admin says who it is: the import it was last seen in comes from the queue row the mapping resolved, or else from the days written.
   */
  async reopenAfterEnd(tx: DbTx, mapping: MappingRecord): Promise<void> {
    const resolved = await tx.usageUnmatchedIdentity.findFirst({
      where: { resolvedMappingId: mapping.id },
      select: { sourceId: true, firstImportId: true, lastImportId: true },
    });
    const seen =
      resolved ??
      (await tx.usageActivityDay
        .findFirst({
          where: {
            applicationId: mapping.applicationId,
            identifierType: mapping.identifierType,
            normalizedIdentifier: mapping.normalizedIdentifier,
          },
          orderBy: { createdAt: 'desc' },
          select: { sourceId: true, importId: true },
        })
        .then((day) =>
          day ? { sourceId: day.sourceId, firstImportId: day.importId, lastImportId: day.importId } : null,
        ));
    if (!seen) return;
    await tx.$executeRaw`
      INSERT INTO usage_unmatched_identities (organization_id, application_id, source_id, identifier_type, normalized_identifier,
        raw_identifier, reason, status, candidate_employee_ids, first_import_id, last_import_id)
      VALUES (${mapping.organizationId}::uuid, ${mapping.applicationId}::uuid, ${seen.sourceId}::uuid,
        ${mapping.identifierType}::"UsageIdentifierType", ${mapping.normalizedIdentifier}, ${mapping.rawIdentifier},
        'NOT_FOUND', 'OPEN', '{}'::uuid[], ${seen.firstImportId}::uuid, ${seen.lastImportId}::uuid)
      ON CONFLICT (organization_id, application_id, identifier_type, normalized_identifier) WHERE status <> 'RESOLVED' DO NOTHING`;
  }

  async pageUnmatched(filter: {
    applicationId?: string;
    statuses: readonly UnmatchedStatus[];
    skip: number;
    take: number;
  }): Promise<{ items: UnmatchedRecord[]; total: number }> {
    const where: Prisma.UsageUnmatchedIdentityWhereInput = {
      status: { in: [...filter.statuses] },
      ...(filter.applicationId ? { applicationId: filter.applicationId } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.usageUnmatchedIdentity.findMany({
        where,
        orderBy: [{ lastImportId: 'desc' }, { id: 'asc' }],
        skip: filter.skip,
        take: filter.take,
      }),
      this.prisma.usageUnmatchedIdentity.count({ where }),
    ]);

    return { items: rows.map(toUnmatched), total };
  }
}
