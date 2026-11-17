import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import { DeviceStopRequestOpenRaceError } from './stop-request.errors';
import type { StopRequestInvalidReason, StopRequestState } from './stop-request.policy';

/** The index that lets one request of a registration be open at a time. */
const ONE_OPEN_INDEX = 'device_stop_requests_one_open';

export interface StopRequestRecord {
  id: string;
  registrationId: string;
  deviceId: string;
  holderEmployeeId: string;
  state: StopRequestState;
  invalidReason: StopRequestInvalidReason | 'IT_ADMIN' | null;
  requestedAt: Date;
  dueAt: Date | null;
  handledAt: Date | null;
  handledByAppUserId: string | null;
  selfHandled: boolean;
}

const SELECT = {
  id: true,
  registrationId: true,
  requesterEmployeeId: true,
  state: true,
  invalidReason: true,
  requestedAt: true,
  dueAt: true,
  handledAt: true,
  handledByAppUserId: true,
  selfHandled: true,
  registration: { select: { deviceId: true } },
} as const;

interface Row {
  id: string;
  registrationId: string;
  requesterEmployeeId: string;
  state: StopRequestState;
  invalidReason: StopRequestInvalidReason | 'IT_ADMIN' | null;
  requestedAt: Date;
  dueAt: Date | null;
  handledAt: Date | null;
  handledByAppUserId: string | null;
  selfHandled: boolean;
  registration: { deviceId: string };
}

function toRecord(row: Row): StopRequestRecord {
  return {
    id: row.id,
    registrationId: row.registrationId,
    deviceId: row.registration.deviceId,
    holderEmployeeId: row.requesterEmployeeId,
    state: row.state,
    invalidReason: row.invalidReason,
    requestedAt: row.requestedAt,
    dueAt: row.dueAt,
    handledAt: row.handledAt,
    handledByAppUserId: row.handledByAppUserId,
    selfHandled: row.selfHandled,
  };
}

/** The requests of holders to stop the collection of their machine: a request is added, then handled once. */
@Injectable()
export class StopRequestRepo {
  constructor(private readonly prisma: PrismaService) {}

  async find(id: string, tx?: DbTx): Promise<StopRequestRecord | null> {
    const row = await (tx ?? this.prisma).deviceStopRequest.findUnique({ where: { id }, select: SELECT });

    return row ? toRecord(row) : null;
  }

  async hasOpen(tx: DbTx, registrationId: string): Promise<boolean> {
    return (await tx.deviceStopRequest.count({ where: { registrationId, state: 'OPEN' }, take: 1 })) > 0;
  }

  /**
   * Adds a request: open, or already closed as invalid with the instant it was handled (the table refuses an invalid row without it).
   * Throws DeviceStopRequestOpenRaceError when the unique index of open requests refuses it; any other violation stays what it is.
   */
  async insert(
    tx: DbTx,
    input: {
      organizationId: string;
      registrationId: string;
      requesterEmployeeId: string;
      requestedAt: Date;
      dueAt: Date;
      invalidReason: StopRequestInvalidReason | null;
    },
  ): Promise<StopRequestRecord> {
    const { invalidReason, ...rest } = input;
    try {
      const row = await tx.deviceStopRequest.create({
        data: {
          ...rest,
          ...(invalidReason === null
            ? { state: 'OPEN' as const }
            : { state: 'INVALID' as const, invalidReason, handledAt: input.requestedAt }),
        },
        select: SELECT,
      });

      return toRecord(row);
    } catch (error) {
      if (isUniqueViolation(error, ONE_OPEN_INDEX)) throw new DeviceStopRequestOpenRaceError();
      throw error;
    }
  }

  async complete(
    tx: DbTx,
    id: string,
    input: { handledByAppUserId: string; handledAt: Date; selfHandled: boolean },
  ): Promise<StopRequestRecord> {
    const row = await tx.deviceStopRequest.update({
      where: { id },
      data: { state: 'COMPLETED', ...input },
      select: SELECT,
    });

    return toRecord(row);
  }

  /** The registration ended while the request waited: the system closes it, nobody handled it. */
  async closeAsRegistrationEnded(tx: DbTx, id: string, handledAt: Date): Promise<StopRequestRecord> {
    const row = await tx.deviceStopRequest.update({
      where: { id },
      data: { state: 'INVALID', invalidReason: 'REGISTRATION_ENDED', handledAt },
      select: SELECT,
    });

    return toRecord(row);
  }

  /** A page of the requests in one state, those due first. */
  async page(
    state: StopRequestState,
    skip: number,
    take: number,
  ): Promise<{ rows: StopRequestRecord[]; total: number }> {
    const where = { state };
    const [rows, total] = await Promise.all([
      this.prisma.deviceStopRequest.findMany({
        where,
        select: SELECT,
        orderBy: [{ dueAt: 'asc' }, { id: 'asc' }],
        skip,
        take,
      }),
      this.prisma.deviceStopRequest.count({ where }),
    ]);

    return { rows: rows.map(toRecord), total };
  }
}
