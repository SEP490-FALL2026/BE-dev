import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { ReturnTaskRecord } from './device-return-task.types';

type TaskRow = Prisma.DeviceReturnTaskGetPayload<Record<string, never>>;

function toRecord(row: TaskRow): ReturnTaskRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    deviceId: row.deviceId,
    registrationId: row.registrationId,
    employeeId: row.employeeId,
    offboardingCaseId: row.offboardingCaseId,
    departmentId: row.departmentId,
    dueOn: fromDateColumn(row.dueOn),
    state: row.state,
    conditionOnReceipt: row.conditionOnReceipt,
    softwareRemoval: row.softwareRemoval,
    softwareRemovalNote: row.softwareRemovalNote,
    outcomeNote: row.outcomeNote,
    handledByAppUserId: row.handledByAppUserId,
    handledAt: row.handledAt,
    overdueNoticedOn: row.overdueNoticedOn ? fromDateColumn(row.overdueNoticedOn) : null,
    createdAt: row.createdAt,
  };
}

/**
 * Persistence writer and locker for offboarding device return tasks. Multi-row updates always lock `managed_devices`
 * in ascending id order before locking `device_return_tasks` in ascending id order.
 */
@Injectable()
export class DeviceReturnTaskRepo {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string, tx?: DbTx): Promise<ReturnTaskRecord | null> {
    const row = await (tx ?? this.prisma).deviceReturnTask.findUnique({ where: { id } });

    return row ? toRecord(row) : null;
  }

  async findExistingRegistrationIds(tx: DbTx, registrationIds: readonly string[]): Promise<Set<string>> {
    if (registrationIds.length === 0) return new Set();
    const rows = await tx.deviceReturnTask.findMany({
      where: { registrationId: { in: [...registrationIds] } },
      select: { registrationId: true },
    });

    return new Set(rows.map((row) => row.registrationId));
  }

  async insertOpen(
    tx: DbTx,
    input: {
      organizationId: string;
      deviceId: string;
      registrationId: string;
      employeeId: string;
      offboardingCaseId: string;
      departmentId: string | null;
      dueOn: BusinessDate;
    },
  ): Promise<ReturnTaskRecord> {
    const row = await tx.deviceReturnTask.create({
      data: {
        id: randomUUID(),
        organizationId: input.organizationId,
        deviceId: input.deviceId,
        registrationId: input.registrationId,
        employeeId: input.employeeId,
        offboardingCaseId: input.offboardingCaseId,
        departmentId: input.departmentId,
        dueOn: toDateColumn(input.dueOn),
        state: 'OPEN',
      },
    });

    return toRecord(row);
  }

  /** Locks parent devices first (ascending id) and then all open return tasks of an offboarding case. */
  async lockOpenByCaseId(tx: DbTx, caseId: string): Promise<ReturnTaskRecord[]> {
    const deviceRows = await tx.deviceReturnTask.findMany({
      where: { offboardingCaseId: caseId, state: 'OPEN' },
      select: { deviceId: true },
    });
    if (deviceRows.length === 0) return [];
    const deviceIds = [...new Set(deviceRows.map((row) => row.deviceId))].sort();
    await tx.$queryRaw`
      SELECT id FROM managed_devices WHERE id = ANY(${deviceIds}::uuid[]) ORDER BY id ASC FOR UPDATE`;
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM device_return_tasks
       WHERE offboarding_case_id = ${caseId}::uuid AND state = 'OPEN'::"DeviceReturnTaskState"
       ORDER BY id ASC FOR UPDATE`;
    if (locked.length === 0) return [];
    const rows = await tx.deviceReturnTask.findMany({
      where: { id: { in: locked.map((row) => row.id) } },
      orderBy: { id: 'asc' },
    });

    return rows.map(toRecord);
  }

  async updateDueOn(tx: DbTx, id: string, input: { dueOn: BusinessDate; clearOverdueNotice: boolean }): Promise<void> {
    await tx.deviceReturnTask.update({
      where: { id },
      data: {
        dueOn: toDateColumn(input.dueOn),
        ...(input.clearOverdueNotice ? { overdueNoticedOn: null } : {}),
      },
    });
  }

  async markCancelled(tx: DbTx, id: string, at: Date): Promise<void> {
    await tx.deviceReturnTask.update({
      where: { id },
      data: {
        state: 'CANCELLED',
        handledAt: at,
      },
    });
  }
}
