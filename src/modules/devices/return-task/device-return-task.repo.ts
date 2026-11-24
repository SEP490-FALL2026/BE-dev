import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { fromDateColumn, toDateColumn, type BusinessDate } from '../../../core/business-date';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { DeviceCondition } from '../devices-custody.policy';
import type {
  DeviceSoftwareRemovalOutcome,
  ReturnTaskCountScope,
  ReturnTaskCounts,
  ReturnTaskListFilter,
  ReturnTaskListRow,
  ReturnTaskRecord,
} from './device-return-task.types';

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

type TaskWithDeviceRow = Prisma.DeviceReturnTaskGetPayload<{
  include: { device: { select: { assetCode: true; hostname: true } } };
}>;

function toListRow(row: TaskWithDeviceRow): ReturnTaskListRow {
  return {
    ...toRecord(row),
    deviceAssetCode: row.device.assetCode,
    deviceHostname: row.device.hostname,
  };
}

function buildListWhere(filter: ReturnTaskListFilter): Prisma.DeviceReturnTaskWhereInput {
  const where: Prisma.DeviceReturnTaskWhereInput = { organizationId: filter.organizationId };
  if (filter.departmentIds) where.departmentId = { in: [...filter.departmentIds] };
  if (filter.excludeEmployeeId) where.employeeId = { not: filter.excludeEmployeeId };

  const todayDate = toDateColumn(filter.today);
  if (filter.overdue === true) {
    where.state = 'OPEN';
    where.dueOn = { lt: todayDate };
  } else if (filter.overdue === false) {
    if (filter.state === 'OPEN') {
      where.state = 'OPEN';
      where.dueOn = { gte: todayDate };
    } else if (filter.state === 'CLOSED') {
      where.state = { in: ['RECEIVED', 'NOT_RECOVERED', 'CANCELLED'] };
    } else {
      where.OR = [{ state: { not: 'OPEN' } }, { dueOn: { gte: todayDate } }];
    }
  } else if (filter.state === 'OPEN') {
    where.state = 'OPEN';
  } else if (filter.state === 'CLOSED') {
    where.state = { in: ['RECEIVED', 'NOT_RECOVERED', 'CANCELLED'] };
  }

  return where;
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

  async lockById(tx: DbTx, id: string): Promise<ReturnTaskRecord | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM device_return_tasks WHERE id = ${id}::uuid FOR UPDATE`;

    return locked.length === 0 ? null : this.findById(id, tx);
  }

  async lockOpenByDeviceId(tx: DbTx, deviceId: string): Promise<ReturnTaskRecord | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM device_return_tasks
       WHERE device_id = ${deviceId}::uuid AND state = 'OPEN'::"DeviceReturnTaskState" FOR UPDATE`;

    return locked[0] ? this.findById(locked[0].id, tx) : null;
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

  async markReceived(
    tx: DbTx,
    id: string,
    input: {
      conditionOnReceipt: DeviceCondition;
      softwareRemoval: DeviceSoftwareRemovalOutcome;
      softwareRemovalNote: string | null;
      handledByAppUserId: string;
      handledAt: Date;
    },
  ): Promise<void> {
    await tx.deviceReturnTask.update({
      where: { id },
      data: {
        state: 'RECEIVED',
        conditionOnReceipt: input.conditionOnReceipt,
        softwareRemoval: input.softwareRemoval,
        softwareRemovalNote: input.softwareRemovalNote,
        handledByAppUserId: input.handledByAppUserId,
        handledAt: input.handledAt,
      },
    });
  }

  async markNotRecovered(
    tx: DbTx,
    id: string,
    input: { outcomeNote: string; handledByAppUserId: string; handledAt: Date },
  ): Promise<void> {
    await tx.deviceReturnTask.update({
      where: { id },
      data: {
        state: 'NOT_RECOVERED',
        outcomeNote: input.outcomeNote,
        handledByAppUserId: input.handledByAppUserId,
        handledAt: input.handledAt,
      },
    });
  }

  async page(
    filter: ReturnTaskListFilter,
    skip: number,
    take: number,
  ): Promise<{ rows: ReturnTaskListRow[]; total: number }> {
    if (filter.departmentIds && filter.departmentIds.length === 0) return { rows: [], total: 0 };
    const where = buildListWhere(filter);

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.deviceReturnTask.findMany({
          where,
          include: { device: { select: { assetCode: true, hostname: true } } },
          orderBy: [{ dueOn: 'asc' }, { id: 'asc' }],
          skip,
          take,
        });
        const total = await tx.deviceReturnTask.count({ where });

        return { rows: rows.map(toListRow), total };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async findDetailById(organizationId: string, id: string): Promise<ReturnTaskListRow | null> {
    const row = await this.prisma.deviceReturnTask.findFirst({
      where: { id, organizationId },
      include: { device: { select: { assetCode: true, hostname: true } } },
    });

    return row ? toListRow(row) : null;
  }

  async countForScope(scope: ReturnTaskCountScope, today: BusinessDate, tx?: DbTx): Promise<ReturnTaskCounts> {
    if (scope.actingDepartmentIds.length === 0) return { open: 0, overdue: 0 };
    const departmentIds = [...new Set(scope.actingDepartmentIds)];
    const todayDate = toDateColumn(today);
    const rows = await (tx ?? this.prisma).$queryRaw<{ open_count: bigint; overdue_count: bigint }[]>`
      SELECT count(*) FILTER (WHERE state = 'OPEN'::"DeviceReturnTaskState") AS open_count,
             count(*) FILTER (WHERE state = 'OPEN'::"DeviceReturnTaskState" AND due_on < ${todayDate}::date) AS overdue_count
        FROM device_return_tasks
       WHERE organization_id = ${scope.organizationId}::uuid
         AND department_id = ANY(${departmentIds}::uuid[])
         AND employee_id <> ${scope.excludeEmployeeId}::uuid
         AND state = 'OPEN'::"DeviceReturnTaskState"`;

    return {
      open: Number(rows[0]?.open_count ?? 0n),
      overdue: Number(rows[0]?.overdue_count ?? 0n),
    };
  }

  async listOverdueCandidateIds(organizationId: string, today: BusinessDate, limit: number): Promise<string[]> {
    const todayDate = toDateColumn(today);
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM device_return_tasks
       WHERE organization_id = ${organizationId}::uuid
         AND state = 'OPEN'::"DeviceReturnTaskState"
         AND due_on < ${todayDate}::date
         AND overdue_noticed_on IS DISTINCT FROM ${todayDate}::date
       ORDER BY due_on ASC, id ASC
       LIMIT ${limit}`;

    return rows.map((row) => row.id);
  }

  async lockOverdueForNoticeSkipLocked(
    tx: DbTx,
    id: string,
  ): Promise<(ReturnTaskRecord & { assetCode: string }) | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM device_return_tasks
       WHERE id = ${id}::uuid AND state = 'OPEN'::"DeviceReturnTaskState"
       FOR UPDATE SKIP LOCKED`;
    if (locked.length === 0) return null;
    const row = await tx.deviceReturnTask.findUnique({
      where: { id },
      include: { device: { select: { assetCode: true } } },
    });

    return row ? { ...toRecord(row), assetCode: row.device.assetCode } : null;
  }

  async markOverdueNoticed(tx: DbTx, id: string, today: BusinessDate): Promise<void> {
    await tx.deviceReturnTask.update({
      where: { id },
      data: { overdueNoticedOn: toDateColumn(today) },
    });
  }
}
