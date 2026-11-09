import { Injectable } from '@nestjs/common';
import { DevicesApi } from '../../devices/public/devices.api';
import { DeviceNotFoundError } from '../../devices/public/devices.errors';
import { ToolStatusRepo, type ToolStatusRow } from './tool-status.repo';

const toWire = (row: ToolStatusRow) => ({
  tool: row.tool,
  observedAt: row.observedAt.toISOString(),
  authStatus: row.authStatus,
  quotaStatus: row.quotaStatus,
  windowCode: row.windowCode,
  usedPercent: row.usedPercent,
  resetsAt: row.resetsAt ? row.resetsAt.toISOString() : null,
});

/** The latest login and quota of each tool on a machine: all of it for the IT Admin, only the registrations they held for a person. */
@Injectable()
export class ToolStatusQueryService {
  constructor(
    private readonly statuses: ToolStatusRepo,
    private readonly devices: DevicesApi,
  ) {}

  /** Throws DeviceNotFoundError. */
  async ofDevice(deviceId: string, query: { page: number; pageSize: number }) {
    if (!(await this.devices.deviceExists(deviceId))) throw new DeviceNotFoundError();

    return this.read(deviceId, undefined, query);
  }

  /** Throws DeviceNotFoundError, also for a machine the person never held. */
  async ofMyDevice(employeeId: string, deviceId: string, query: { page: number; pageSize: number }) {
    const registrationIds = await this.devices.holderRegistrationIds(deviceId, employeeId);
    if (registrationIds.length === 0) throw new DeviceNotFoundError();

    return this.read(deviceId, registrationIds, query);
  }

  private async read(
    deviceId: string,
    registrationIds: readonly string[] | undefined,
    query: { page: number; pageSize: number },
  ) {
    const { rows, total } = await this.statuses.latestPage(
      deviceId,
      registrationIds,
      (query.page - 1) * query.pageSize,
      query.pageSize,
    );

    return {
      items: rows.map(toWire),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems: total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }
}
