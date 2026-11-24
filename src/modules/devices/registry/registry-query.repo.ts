import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { fromDateColumn, type BusinessDate } from '../../../core/business-date';
import { escapeLikePattern, searchKey } from '../../../core/search-key';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AssetDeviceType } from '../asset-code/asset-code.policy';
import type { CollectionState } from '../devices-collection-state.policy';
import type { DeviceCondition, DeviceCustody } from '../devices-custody.policy';
import type { DeviceRegistrationEndCause } from '../public/devices.types';

export interface DeviceActivationDeviceSummary {
  id: string;
  assetCode: string;
  custody: DeviceCustody;
  condition: DeviceCondition;
}

export interface HeldDeviceSummary {
  id: string;
  assetCode: string;
  hostname: string;
}

/** One machine as the register lists it: the machine and the registration open on it, if any. */
export interface DeviceSummaryRow {
  id: string;
  assetCode: string;
  deviceType: AssetDeviceType;
  serialNumber: string | null;
  assetCodeOrigin: 'GENERATED' | 'LEGACY';
  hostname: string;
  os: string;
  condition: DeviceCondition;
  retirementKind: 'DISPOSED' | 'LOST' | null;
  retiredAt: Date | null;
  voidedAt: Date | null;
  updatedAt: Date;
  registrationId: string | null;
  holderEmployeeId: string | null;
  validFrom: Date | null;
  acknowledgedFrom: Date | null;
  collectionStoppedAt: Date | null;
  collectorInstalled: boolean | null;
  hasOpenReturnTask: boolean;
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
  collectorInstalled: boolean;
  signatureRecorded: boolean;
  lastAcceptedAt: Date | null;
}

export interface DeviceListFilter {
  organizationId: string;
  search?: string | undefined;
  holderEmployeeId?: string | undefined;
  state?: CollectionState | undefined;
  custody?: 'IN_STOCK' | 'ASSIGNED' | 'AWAITING_RETURN' | 'RETIRED' | undefined;
  condition?: DeviceCondition | undefined;
  deviceType?: AssetDeviceType | undefined;
  signatureMissing?: boolean | undefined;
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
  conditionNote: string | null;
  voidReason: string | null;
  openReturnTask: {
    id: string;
    dueOn: BusinessDate;
    departmentId: string | null;
    employeeId: string;
  } | null;
}

/** The same decision as `collectionStateOf`, in SQL: a list filtered by state reads exactly what the detail shows. */
const STATE_SQL = Prisma.sql`CASE
  WHEN d.retired_at IS NOT NULL THEN 'RETIRED'
  WHEN r.id IS NULL THEN 'UNREGISTERED'
  WHEN NOT r.collector_installed THEN 'NO_COLLECTOR'
  WHEN r.collection_stopped_at IS NOT NULL THEN 'COLLECTION_STOPPED'
  WHEN r.acknowledged_from IS NOT NULL THEN 'ACTIVE'
  ELSE 'AWAITING_ACKNOWLEDGEMENT' END`;

const OPEN_RETURN_TASK_SQL = Prisma.sql`EXISTS (SELECT 1 FROM device_return_tasks t WHERE t.device_id = d.id AND t.state = 'OPEN')`;

/** The same precedence as `custodyOf` in SQL: VOIDED -> RETIRED -> AWAITING_RETURN -> ASSIGNED -> IN_STOCK. */
const CUSTODY_SQL = Prisma.sql`CASE
  WHEN d.voided_at IS NOT NULL THEN 'VOIDED'
  WHEN d.retired_at IS NOT NULL THEN 'RETIRED'
  WHEN ${OPEN_RETURN_TASK_SQL} THEN 'AWAITING_RETURN'
  WHEN r.id IS NOT NULL THEN 'ASSIGNED'
  ELSE 'IN_STOCK' END`;

/**
 * Whether a registration has a signed record, and the last instant any of its credentials was accepted: two reads of tables the register does not
 * list, each one a sub-select of the row, so a page of any size is one statement.
 */
const SIGNED_SQL = Prisma.sql`EXISTS (SELECT 1 FROM device_signature_records s WHERE s.registration_id = r.id)`;
const SIGNATURE_MISSING_SQL = Prisma.sql`(r.id IS NOT NULL AND NOT ${SIGNED_SQL})`;
const LAST_ACCEPTED_SQL = Prisma.sql`(SELECT max(c.last_accepted_at) FROM device_credentials c WHERE c.registration_id = r.id)`;

const SUMMARY_COLUMNS = Prisma.sql`d.id, d.asset_code AS "assetCode", d.device_type AS "deviceType",
  d.serial_number AS "serialNumber", d.asset_code_origin AS "assetCodeOrigin", d.hostname, d.os,
  d.condition, d.retirement_kind AS "retirementKind", d.retired_at AS "retiredAt",
  d.voided_at AS "voidedAt", d.updated_at AS "updatedAt",
  r.id AS "registrationId", r.holder_employee_id AS "holderEmployeeId", r.valid_from AS "validFrom",
  r.acknowledged_from AS "acknowledgedFrom", r.collection_stopped_at AS "collectionStoppedAt",
  r.collector_installed AS "collectorInstalled",
  ${OPEN_RETURN_TASK_SQL} AS "hasOpenReturnTask",
  ${SIGNED_SQL} AS "signatureRecorded", ${LAST_ACCEPTED_SQL} AS "lastAcceptedAt"`;

const FROM_SQL = Prisma.sql`FROM managed_devices d
  LEFT JOIN device_registrations r ON r.device_id = d.id AND r.ended_at IS NULL`;

function whereOf(
  filter: DeviceListFilter,
  options?: { deviceId?: string | undefined; includeVoided?: boolean | undefined },
): Prisma.Sql {
  const conditions = [Prisma.sql`d.organization_id = ${filter.organizationId}::uuid`];
  if (!options?.includeVoided) conditions.push(Prisma.sql`d.voided_at IS NULL`);
  if (options?.deviceId) conditions.push(Prisma.sql`d.id = ${options.deviceId}::uuid`);
  if (filter.holderEmployeeId) conditions.push(Prisma.sql`r.holder_employee_id = ${filter.holderEmployeeId}::uuid`);
  if (filter.search) {
    const code = `%${escapeLikePattern(searchKey(filter.search))}%`;
    const host = `%${escapeLikePattern(filter.search.trim().toLowerCase())}%`;
    conditions.push(
      Prisma.sql`(d.normalized_asset_code LIKE ${code} ESCAPE '\\' OR lower(d.hostname) LIKE ${host} ESCAPE '\\')`,
    );
  }
  if (filter.state) conditions.push(Prisma.sql`${STATE_SQL} = ${filter.state}`);
  if (filter.custody) conditions.push(Prisma.sql`${CUSTODY_SQL} = ${filter.custody}`);
  if (filter.condition) conditions.push(Prisma.sql`d.condition = ${filter.condition}::"DeviceCondition"`);
  if (filter.deviceType) conditions.push(Prisma.sql`d.device_type = ${filter.deviceType}::"DeviceType"`);
  if (filter.signatureMissing !== undefined) {
    conditions.push(Prisma.sql`${SIGNATURE_MISSING_SQL} = ${filter.signatureMissing}`);
  }

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

  /** How many non-voided machines are in this state: the number `page` reports as its total for the same filter, with no page read. */
  async countByState(organizationId: string, state: CollectionState): Promise<number> {
    const counted = await this.prisma.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) AS total ${FROM_SQL} WHERE ${whereOf({ organizationId, state })}`;

    return Number(counted[0]?.total ?? 0n);
  }

  /** Counts open registrations on non-voided, non-retired devices that lack any signed BM-06 record. */
  async countOpenRegistrationsMissingSignature(organizationId: string, tx?: DbTx): Promise<number> {
    const db = tx ?? this.prisma;
    const counted = await db.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) AS total
        FROM device_registrations r
        JOIN managed_devices d ON d.id = r.device_id
       WHERE d.organization_id = ${organizationId}::uuid
         AND d.voided_at IS NULL
         AND d.retired_at IS NULL
         AND r.ended_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM device_signature_records s WHERE s.registration_id = r.id)`;

    return Number(counted[0]?.total ?? 0n);
  }

  async one(organizationId: string, id: string): Promise<DeviceSummaryRow | null> {
    const rows = await this.prisma.$queryRaw<DeviceSummaryRow[]>`
      SELECT ${SUMMARY_COLUMNS}
      ${FROM_SQL} WHERE ${whereOf({ organizationId }, { deviceId: id, includeVoided: true })}`;

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
                 r.collection_stopped_at AS "collectionStoppedAt", r.collector_installed AS "collectorInstalled",
                 ${SIGNED_SQL} AS "signatureRecorded",
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
    const [acknowledgement, signature, lastEnd, device, openReturnTask] = await Promise.all([
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
      this.prisma.managedDevice.findUnique({
        where: { id: deviceId },
        select: { retirementReason: true, conditionNote: true, voidReason: true },
      }),
      this.openReturnTaskOf(deviceId),
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
      lastEnd: mapLastEnd(lastEnd),
      retirementReason: device?.retirementReason ?? null,
      conditionNote: device?.conditionNote ?? null,
      voidReason: device?.voidReason ?? null,
      openReturnTask,
    };
  }

  private async openReturnTaskOf(deviceId: string): Promise<DeviceExtras['openReturnTask']> {
    const row = await this.prisma.deviceReturnTask.findFirst({
      where: { deviceId, state: 'OPEN' },
      select: { id: true, dueOn: true, departmentId: true, employeeId: true },
    });

    return row
      ? { id: row.id, dueOn: fromDateColumn(row.dueOn), departmentId: row.departmentId, employeeId: row.employeeId }
      : null;
  }

  /** Returns matching machine IDs filtered by idle status (`IN_STOCK` excluding `AWAITING_RETURN`, or `IN_REPAIR`/`BROKEN`). */
  async findDeviceIdsByIdle(organizationId: string, idle: boolean, deviceId?: string): Promise<string[]> {
    const deviceClause = deviceId ? Prisma.sql`AND d.id = ${deviceId}::uuid` : Prisma.empty;
    const idleExpr = Prisma.sql`(d.voided_at IS NULL AND d.retired_at IS NULL AND ((r.id IS NULL AND NOT ${OPEN_RETURN_TASK_SQL}) OR d.condition IN ('IN_REPAIR'::"DeviceCondition", 'BROKEN'::"DeviceCondition")))`;
    const matchExpr = idle ? idleExpr : Prisma.sql`NOT ${idleExpr}`;
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT d.id
        FROM managed_devices d
        LEFT JOIN device_registrations r ON r.device_id = d.id AND r.ended_at IS NULL
       WHERE d.organization_id = ${organizationId}::uuid
         ${deviceClause}
         AND ${matchExpr}`;

    return rows.map((row) => row.id);
  }

  /** Reads custody and condition summaries for a batch of machine IDs in one query. */
  async findDeviceSummariesByIds(ids: readonly string[]): Promise<Map<string, DeviceActivationDeviceSummary>> {
    const map = new Map<string, DeviceActivationDeviceSummary>();
    if (ids.length === 0) return map;
    const rows = await this.prisma.$queryRaw<DeviceActivationDeviceSummary[]>`
      SELECT d.id, d.asset_code AS "assetCode", d.condition, ${CUSTODY_SQL} AS custody
        FROM managed_devices d
        LEFT JOIN device_registrations r ON r.device_id = d.id AND r.ended_at IS NULL
       WHERE d.id = ANY(${[...new Set(ids)]}::uuid[])`;
    for (const row of rows) map.set(row.id, row);

    return map;
  }

  /** Reads machines currently held by an employee (open registration, non-voided, non-retired) in one query. */
  async findHeldDevicesByHolder(organizationId: string, holderEmployeeId: string): Promise<HeldDeviceSummary[]> {
    return this.prisma.$queryRaw<HeldDeviceSummary[]>`
      SELECT d.id, d.asset_code AS "assetCode", d.hostname
        FROM device_registrations r
        JOIN managed_devices d ON d.id = r.device_id
       WHERE d.organization_id = ${organizationId}::uuid
         AND d.voided_at IS NULL
         AND d.retired_at IS NULL
         AND r.ended_at IS NULL
         AND r.holder_employee_id = ${holderEmployeeId}::uuid
       ORDER BY d.id ASC`;
  }
}

function mapLastEnd(
  lastEnd: { holderEmployeeId: string; validUntil: Date | null; endedAt: Date | null; endCause: string | null } | null,
): DeviceExtras['lastEnd'] {
  if (!lastEnd?.endedAt || !lastEnd.validUntil || !lastEnd.endCause) return null;
  return {
    holderEmployeeId: lastEnd.holderEmployeeId,
    validUntil: fromDateColumn(lastEnd.validUntil),
    endedAt: lastEnd.endedAt,
    endCause: lastEnd.endCause as NonNullable<DeviceExtras['lastEnd']>['endCause'],
  };
}
