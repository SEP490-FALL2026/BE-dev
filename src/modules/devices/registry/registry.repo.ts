import { Injectable } from '@nestjs/common';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { DeviceCondition } from '../devices-custody.policy';
import type { DeviceRegistrationEndCause } from '../public/devices.types';

export interface DeviceRecord {
  id: string;
  organizationId: string;
  assetCode: string;
  hostname: string;
  os: string;
  condition: DeviceCondition;
  conditionNote: string | null;
  retiredAt: Date | null;
  retirementReason: string | null;
  retirementKind: 'DISPOSED' | 'LOST' | null;
  voidedAt: Date | null;
}

export interface RegistrationRecord {
  id: string;
  organizationId: string;
  deviceId: string;
  holderEmployeeId: string;
  validFrom: BusinessDate;
  validUntil: BusinessDate | null;
  endedAt: Date | null;
  endCause: DeviceRegistrationEndCause | null;
  acknowledgedFrom: Date | null;
  collectionStoppedAt: Date | null;
}

export interface SignatureRecordRow {
  id: string;
  registrationId: string;
  documentId: string;
  noticeVersionNumber: number;
  recordedAt: Date;
}

const DEVICE_SELECT = {
  id: true,
  organizationId: true,
  assetCode: true,
  hostname: true,
  os: true,
  condition: true,
  conditionNote: true,
  retiredAt: true,
  retirementReason: true,
  retirementKind: true,
  voidedAt: true,
} as const;

interface RegistrationRow extends Omit<RegistrationRecord, 'validFrom' | 'validUntil'> {
  validFrom: Date;
  validUntil: Date | null;
}

export function toRegistrationRecord(row: RegistrationRow): RegistrationRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    deviceId: row.deviceId,
    holderEmployeeId: row.holderEmployeeId,
    validFrom: fromDateColumn(row.validFrom),
    validUntil: row.validUntil ? fromDateColumn(row.validUntil) : null,
    endedAt: row.endedAt,
    endCause: row.endCause,
    acknowledgedFrom: row.acknowledgedFrom,
    collectionStoppedAt: row.collectionStoppedAt,
  };
}

/**
 * The writer of the register: the machines, their registrations and the records of `BM-06`. Every writer takes the locks in one
 * order — the machine, then its registration — so two writers on one machine queue instead of waiting on each other.
 */
@Injectable()
export class RegistryRepo {
  constructor(private readonly prisma: PrismaService) {}

  findDevice(id: string, tx?: DbTx): Promise<DeviceRecord | null> {
    return (tx ?? this.prisma).managedDevice.findUnique({ where: { id }, select: DEVICE_SELECT });
  }

  /** The machine locked `FOR UPDATE` until the transaction ends, or null. */
  async lockDevice(tx: DbTx, id: string): Promise<DeviceRecord | null> {
    const locked = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM managed_devices WHERE id = ${id}::uuid FOR UPDATE`;

    return locked.length === 0 ? null : this.findDevice(id, tx);
  }

  async deviceIdByAssetCode(tx: DbTx, organizationId: string, normalizedAssetCode: string): Promise<string | null> {
    const row = await tx.managedDevice.findUnique({
      where: { organizationId_normalizedAssetCode: { organizationId, normalizedAssetCode } },
      select: { id: true },
    });

    return row?.id ?? null;
  }

  insertDevice(
    tx: DbTx,
    input: {
      organizationId: string;
      assetCode: string;
      normalizedAssetCode: string;
      assetCodeOrigin: 'GENERATED' | 'LEGACY';
      deviceType: 'LAP' | 'PC' | 'OTH';
      serialNumber: string | null;
      normalizedSerialNumber: string | null;
      hostname: string;
      os: string;
      createdByAppUserId: string;
    },
  ): Promise<DeviceRecord> {
    return tx.managedDevice.create({ data: input, select: DEVICE_SELECT });
  }

  async retireDevice(tx: DbTx, id: string, retiredAt: Date, reason: string): Promise<void> {
    await tx.managedDevice.update({
      where: { id },
      data: { retiredAt, retirementReason: reason, retirementKind: 'DISPOSED' },
    });
  }

  async hasOpenReturnTask(tx: DbTx, deviceId: string): Promise<boolean> {
    return (await tx.deviceReturnTask.count({ where: { deviceId, state: 'OPEN' }, take: 1 })) > 0;
  }

  async findOpenReturnTaskDepartmentId(
    tx: DbTx,
    deviceId: string,
  ): Promise<{ found: boolean; departmentId: string | null }> {
    const task = await tx.deviceReturnTask.findFirst({
      where: { deviceId, state: 'OPEN' },
      select: { departmentId: true },
    });

    return { found: task !== null, departmentId: task?.departmentId ?? null };
  }

  async updateCondition(tx: DbTx, id: string, condition: DeviceCondition, conditionNote: string | null): Promise<void> {
    await tx.managedDevice.update({
      where: { id },
      data: { condition, conditionNote },
    });
  }

  async findRegistration(id: string, tx?: DbTx): Promise<RegistrationRecord | null> {
    const row = await (tx ?? this.prisma).deviceRegistration.findUnique({ where: { id } });

    return row ? toRegistrationRecord(row) : null;
  }

  /** The open registration of a machine locked `FOR UPDATE`, or null when nobody holds it. */
  async lockOpenRegistration(tx: DbTx, deviceId: string): Promise<RegistrationRecord | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM device_registrations WHERE device_id = ${deviceId}::uuid AND ended_at IS NULL FOR UPDATE`;

    return locked[0] ? this.findRegistration(locked[0].id, tx) : null;
  }

  /**
   * A registration with its machine locked first and then the registration itself, so this writer queues behind a holder change on
   * the same machine; null when the registration does not exist.
   */
  async lockRegistrationChain(tx: DbTx, id: string): Promise<RegistrationRecord | null> {
    const head = await this.findRegistration(id, tx);
    if (!head) return null;
    await this.lockDevice(tx, head.deviceId);
    await tx.$queryRaw`SELECT id FROM device_registrations WHERE id = ${id}::uuid FOR UPDATE`;

    return this.findRegistration(id, tx);
  }

  /**
   * Every open registration of a person, their machines locked first (in id order) and then the registrations, in the order a
   * holder change takes them. Empty when the person holds nothing.
   */
  async lockOpenRegistrationsOfHolder(tx: DbTx, employeeId: string): Promise<RegistrationRecord[]> {
    const heads = await tx.$queryRaw<{ device_id: string }[]>`
      SELECT device_id FROM device_registrations WHERE holder_employee_id = ${employeeId}::uuid AND ended_at IS NULL`;
    if (heads.length === 0) return [];
    const deviceIds = heads.map((row) => row.device_id);
    await tx.$queryRaw`SELECT id FROM managed_devices WHERE id = ANY(${deviceIds}::uuid[]) ORDER BY id FOR UPDATE`;
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM device_registrations
       WHERE holder_employee_id = ${employeeId}::uuid AND ended_at IS NULL ORDER BY id FOR UPDATE`;
    const rows = await tx.deviceRegistration.findMany({
      where: { id: { in: locked.map((row) => row.id) } },
      orderBy: { id: 'asc' },
    });

    return rows.map(toRegistrationRecord);
  }

  async insertRegistration(
    tx: DbTx,
    input: {
      organizationId: string;
      deviceId: string;
      holderEmployeeId: string;
      validFrom: BusinessDate;
      collectorInstalled: boolean;
      createdByAppUserId: string;
    },
  ): Promise<RegistrationRecord> {
    const row = await tx.deviceRegistration.create({ data: { ...input, validFrom: toDateColumn(input.validFrom) } });

    return toRegistrationRecord(row);
  }

  async endRegistration(
    tx: DbTx,
    id: string,
    end: {
      endedAt: Date;
      validUntil: BusinessDate;
      cause: DeviceRegistrationEndCause;
      softwareRemoval?: { outcome: 'REMOVED' | 'NOT_REMOVABLE'; note: string | null };
    },
  ): Promise<void> {
    await tx.deviceRegistration.update({
      where: { id },
      data: {
        endedAt: end.endedAt,
        validUntil: toDateColumn(end.validUntil),
        endCause: end.cause,
        ...(end.softwareRemoval
          ? { softwareRemoval: end.softwareRemoval.outcome, softwareRemovalNote: end.softwareRemoval.note }
          : {}),
      },
    });
  }

  /** The head of the chain of acknowledgements still in force; a stopped collection is turned back on with it. */
  async setAcknowledged(tx: DbTx, id: string, at: Date): Promise<void> {
    await tx.$executeRaw`
      UPDATE device_registrations
         SET acknowledged_from = COALESCE(acknowledged_from, ${at}), collection_stopped_at = NULL
       WHERE id = ${id}::uuid`;
  }

  /**
   * Collection of the registration stops at `at`. One `UPDATE` sets both columns: the table never lets the head of acknowledgements and
   * the stop be set together, so the head is cleared with it (the next acknowledgement starts a new one at its own instant).
   */
  async setCollectionStopped(tx: DbTx, id: string, at: Date): Promise<void> {
    await tx.$executeRaw`
      UPDATE device_registrations
         SET collection_stopped_at = ${at}, acknowledged_from = NULL
       WHERE id = ${id}::uuid`;
  }

  /**
   * The registration ended, so the stop requests still waiting on it can never be completed: each becomes invalid, handled at `at` by
   * nobody. Written here, not in `stop-request`, which depends on this folder. Returns how many it closed.
   */
  async invalidateOpenStopRequests(tx: DbTx, registrationId: string, at: Date): Promise<number> {
    return tx.$executeRaw`
      UPDATE device_stop_requests
         SET state = 'INVALID'::"DeviceStopRequestState", invalid_reason = 'REGISTRATION_ENDED'::"DeviceStopInvalidReason",
             handled_at = ${at}
       WHERE registration_id = ${registrationId}::uuid AND state = 'OPEN'::"DeviceStopRequestState"`;
  }

  async hasSignatureRecord(registrationId: string, tx?: DbTx): Promise<boolean> {
    return (await (tx ?? this.prisma).deviceSignatureRecord.count({ where: { registrationId }, take: 1 })) > 0;
  }

  async insertSignatureRecord(
    tx: DbTx,
    input: {
      organizationId: string;
      registrationId: string;
      documentId: string;
      noticeVersionId: string;
      signerEmployeeId: string;
      recordedByAppUserId: string;
    },
    noticeVersionNumber: number,
  ): Promise<SignatureRecordRow> {
    const row = await tx.deviceSignatureRecord.create({ data: input });

    return {
      id: row.id,
      registrationId: row.registrationId,
      documentId: row.documentId,
      noticeVersionNumber,
      recordedAt: row.recordedAt,
    };
  }

  /** Whether the machine is in the register, retired or not. */
  async deviceExists(deviceId: string, tx?: DbTx): Promise<boolean> {
    return (await (tx ?? this.prisma).managedDevice.count({ where: { id: deviceId }, take: 1 })) > 0;
  }

  /** Every registration of the machine this person has held, ended or not, oldest first (`FR-10.1`). */
  async registrationIdsHeldBy(deviceId: string, employeeId: string, tx?: DbTx): Promise<string[]> {
    const rows = await (tx ?? this.prisma).deviceRegistration.findMany({
      where: { deviceId, holderEmployeeId: employeeId },
      select: { id: true },
      orderBy: [{ validFrom: 'asc' }, { id: 'asc' }],
    });

    return rows.map((row) => row.id);
  }

  /** Every registration of the machine, ended or not, with who held it, oldest first. */
  async registrationsOfDevice(deviceId: string, tx?: DbTx): Promise<Array<{ id: string; holderEmployeeId: string }>> {
    return (tx ?? this.prisma).deviceRegistration.findMany({
      where: { deviceId },
      select: { id: true, holderEmployeeId: true },
      orderBy: [{ validFrom: 'asc' }, { id: 'asc' }],
    });
  }

  /** Who holds each of these registrations and over which days: a registration has one holder for its whole life. */
  async holdersOf(
    registrationIds: readonly string[],
    tx?: DbTx,
  ): Promise<Array<{ registrationId: string; employeeId: string; validFrom: Date; validUntil: Date | null }>> {
    if (registrationIds.length === 0) return [];
    const rows = await (tx ?? this.prisma).deviceRegistration.findMany({
      where: { id: { in: [...registrationIds] } },
      select: { id: true, holderEmployeeId: true, validFrom: true, validUntil: true },
    });

    return rows.map((row) => ({
      registrationId: row.id,
      employeeId: row.holderEmployeeId,
      validFrom: row.validFrom,
      validUntil: row.validUntil,
    }));
  }
}
