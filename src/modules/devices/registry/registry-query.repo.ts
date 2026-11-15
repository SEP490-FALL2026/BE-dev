import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { fromDateColumn, type BusinessDate } from '../../../core/business-date';
import { escapeLikePattern, searchKey } from '../../../core/search-key';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { CollectionState } from '../devices-collection-state.policy';
import type { DeviceRegistrationEndCause } from '../public/devices.types';

/** One machine as the register lists it: the machine and the registration open on it, if any. */
export interface DeviceSummaryRow {
  id: string;
  assetCode: string;
  hostname: string;
  os: string;
  retiredAt: Date | null;
  registrationId: string | null;
  holderEmployeeId: string | null;
  validFrom: Date | null;
  acknowledgedFrom: Date | null;
  collectionStoppedAt: Date | null;
  signatureRecorded: boolean;
  /** The latest instant any credential of the open registration was accepted; null while nothing was, and for a machine nobody holds. */
  lastAcceptedAt: Date | null;
}

/** One registration of a machine, as the history shows it: who held it, for which days, how it ended and where collection stands. */
export interface DeviceRegistrationRow {
  id: string;
  holderEmployeeId: string;
  validFrom: Date;
  validUntil: Date | null;
  endedAt: Date | null;
  endCause: DeviceRegistrationEndCause | null;
  acknowledgedFrom: Date | null;
  collectionStoppedAt: Date | null;
  signatureRecorded: boolean;
  lastAcceptedAt: Date | null;
}

export interface DeviceListFilter {
  organizationId: string;
  search?: string | undefined;
  holderEmployeeId?: string | undefined;
  state?: CollectionState | undefined;
}

export interface DeviceExtras {
  latestAcknowledgement: { noticeVersionNumber: number; acknowledgedAt: Date } | null;
  latestSignatureRecord: { id: string; documentId: string; noticeVersionNumber: number; recordedAt: Date } | null;
  lastEnd: {
    holderEmployeeId: string;
    validUntil: BusinessDate;
    endedAt: Date;
    endCause: DeviceRegistrationEndCause;
  } | null;
  retirementReason: string | null;
}

/** The same decision as `collectionStateOf`, in SQL: a list filtered by state reads exactly what the detail shows. */
const STATE_SQL = Prisma.sql`CASE
  WHEN d.retired_at IS NOT NULL THEN 'RETIRED'
  WHEN r.id IS NULL THEN 'UNREGISTERED'
  WHEN r.collection_stopped_at IS NOT NULL THEN 'COLLECTION_STOPPED'
  WHEN r.acknowledged_from IS NOT NULL THEN 'ACTIVE'
  ELSE 'AWAITING_ACKNOWLEDGEMENT' END`;

/**
 * Whether a registration has a signed record, and the last instant any of its credentials was accepted: two reads of tables the register does not
 * list, each one a sub-select of the row, so a page of any size is one statement.
 */
const SIGNED_SQL = Prisma.sql`EXISTS (SELECT 1 FROM device_signature_records s WHERE s.registration_id = r.id)`;
const LAST_ACCEPTED_SQL = Prisma.sql`(SELECT max(c.last_accepted_at) FROM device_credentials c WHERE c.registration_id = r.id)`;

const SUMMARY_COLUMNS = Prisma.sql`d.id, d.asset_code AS "assetCode", d.hostname, d.os, d.retired_at AS "retiredAt",
  r.id AS "registrationId", r.holder_employee_id AS "holderEmployeeId", r.valid_from AS "validFrom",
  r.acknowledged_from AS "acknowledgedFrom", r.collection_stopped_at AS "collectionStoppedAt",
  ${SIGNED_SQL} AS "signatureRecorded", ${LAST_ACCEPTED_SQL} AS "lastAcceptedAt"`;

const FROM_SQL = Prisma.sql`FROM managed_devices d
  LEFT JOIN device_registrations r ON r.device_id = d.id AND r.ended_at IS NULL`;

function whereOf(filter: DeviceListFilter, deviceId?: string): Prisma.Sql {
  const conditions = [Prisma.sql`d.organization_id = ${filter.organizationId}::uuid`];
  if (deviceId) conditions.push(Prisma.sql`d.id = ${deviceId}::uuid`);
  if (filter.holderEmployeeId) conditions.push(Prisma.sql`r.holder_employee_id = ${filter.holderEmployeeId}::uuid`);
  if (filter.search) {
    const code = `%${escapeLikePattern(searchKey(filter.search))}%`;
    const host = `%${escapeLikePattern(filter.search.trim().toLowerCase())}%`;
    conditions.push(
      Prisma.sql`(d.normalized_asset_code LIKE ${code} ESCAPE '\\' OR lower(d.hostname) LIKE ${host} ESCAPE '\\')`,
    );
  }
  if (filter.state) conditions.push(Prisma.sql`${STATE_SQL} = ${filter.state}`);

  return Prisma.join(conditions, ' AND ');
}

/** The reads of the register: a page of machines and the detail of one. Reads only; no lock. */
@Injectable()
export class RegistryQueryRepo {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One page of the register ordered by asset code and the total of the same filter, read in one snapshot so the total never
   * disagrees with the page. Whether the machine has a signed record is one `EXISTS`, not a read for each row.
   */
  async page(
    filter: DeviceListFilter,
    skip: number,
    take: number,
  ): Promise<{ rows: DeviceSummaryRow[]; total: number }> {
    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<DeviceSummaryRow[]>`
          SELECT ${SUMMARY_COLUMNS}
          ${FROM_SQL} WHERE ${whereOf(filter)}
          ORDER BY d.normalized_asset_code, d.id LIMIT ${take} OFFSET ${skip}`;
        const counted = await tx.$queryRaw<{ total: bigint }[]>`
          SELECT count(*) AS total ${FROM_SQL} WHERE ${whereOf(filter)}`;

        return { rows, total: Number(counted[0]?.total ?? 0n) };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  /** How many machines are in this state: the number `page` reports as its total for the same filter, with no page read. */
  async countByState(organizationId: string, state: CollectionState): Promise<number> {
    const counted = await this.prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) AS total ${FROM_SQL} WHERE ${whereOf({ organizationId, state })}`;

    return Number(counted[0]?.total ?? 0n);
  }

  async one(organizationId: string, id: string): Promise<DeviceSummaryRow | null> {
    const rows = await this.prisma.$queryRaw<DeviceSummaryRow[]>`
      SELECT ${SUMMARY_COLUMNS}
      ${FROM_SQL} WHERE ${whereOf({ organizationId }, id)}`;

    return rows[0] ?? null;
  }

  /**
   * One page of the registrations of a machine, the newest first (the open one, then the ones that ended, the later start before the earlier), and the
   * total, read in one snapshot with the check that the machine is in the register: null when it is not. A page of any size is three statements.
   */
  async registrationsPage(
    organizationId: string,
    deviceId: string,
    skip: number,
    take: number,
  ): Promise<{ rows: DeviceRegistrationRow[]; total: number } | null> {
    return this.prisma.$transaction(
      async (tx) => {
        const known = await tx.$queryRaw<{ id: string }[]>`
          SELECT d.id FROM managed_devices d WHERE d.id = ${deviceId}::uuid AND d.organization_id = ${organizationId}::uuid`;
        if (known.length === 0) return null;
        const rows = await tx.$queryRaw<DeviceRegistrationRow[]>`
          SELECT r.id, r.holder_employee_id AS "holderEmployeeId", r.valid_from AS "validFrom", r.valid_until AS "validUntil",
                 r.ended_at AS "endedAt", r.end_cause AS "endCause", r.acknowledged_from AS "acknowledgedFrom",
                 r.collection_stopped_at AS "collectionStoppedAt", ${SIGNED_SQL} AS "signatureRecorded",
                 ${LAST_ACCEPTED_SQL} AS "lastAcceptedAt"
            FROM device_registrations r WHERE r.device_id = ${deviceId}::uuid
           ORDER BY r.valid_from DESC, r.created_at DESC, r.id DESC LIMIT ${take} OFFSET ${skip}`;
        const counted = await tx.$queryRaw<{ total: bigint }[]>`
          SELECT count(*) AS total FROM device_registrations r WHERE r.device_id = ${deviceId}::uuid`;

        return { rows, total: Number(counted[0]?.total ?? 0n) };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  /** What only the detail of a machine shows: its latest acknowledgement and signed record, how the last registration ended. */
  async extras(deviceId: string, registrationId: string | null): Promise<DeviceExtras> {
    const [acknowledgement, signature, lastEnd, device] = await Promise.all([
      registrationId
        ? this.prisma.deviceAcknowledgement.findFirst({
            where: { registrationId },
            orderBy: [{ acknowledgedAt: 'desc' }, { id: 'desc' }],
            select: { acknowledgedAt: true, noticeVersion: { select: { versionNumber: true } } },
          })
        : null,
      registrationId
        ? this.prisma.deviceSignatureRecord.findFirst({
            where: { registrationId },
            orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
            select: {
              id: true,
              documentId: true,
              recordedAt: true,
              noticeVersion: { select: { versionNumber: true } },
            },
          })
        : null,
      this.prisma.deviceRegistration.findFirst({
        where: { deviceId, endedAt: { not: null } },
        orderBy: [{ endedAt: 'desc' }, { id: 'desc' }],
        select: { holderEmployeeId: true, validUntil: true, endedAt: true, endCause: true },
      }),
      this.prisma.managedDevice.findUnique({ where: { id: deviceId }, select: { retirementReason: true } }),
    ]);

    return {
      latestAcknowledgement: acknowledgement
        ? {
            noticeVersionNumber: acknowledgement.noticeVersion.versionNumber,
            acknowledgedAt: acknowledgement.acknowledgedAt,
          }
        : null,
      latestSignatureRecord: signature
        ? {
            id: signature.id,
            documentId: signature.documentId,
            noticeVersionNumber: signature.noticeVersion.versionNumber,
            recordedAt: signature.recordedAt,
          }
        : null,
      lastEnd:
        lastEnd?.endedAt && lastEnd.validUntil && lastEnd.endCause
          ? {
              holderEmployeeId: lastEnd.holderEmployeeId,
              validUntil: fromDateColumn(lastEnd.validUntil),
              endedAt: lastEnd.endedAt,
              endCause: lastEnd.endCause,
            }
          : null,
      retirementReason: device?.retirementReason ?? null,
    };
  }
}
