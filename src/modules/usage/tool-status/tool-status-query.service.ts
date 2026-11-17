import { Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { DevicesApi } from '../../devices/public/devices.api';
import { DeviceNotFoundError } from '../../devices/public/devices.errors';
import { UsageOverviewScopeService } from '../usage-overview/usage-overview-scope.service';
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

/**
 * The latest login and quota of each tool on a machine: for the IT Admin those of the registrations held by the people of the departments they
 * work (`QĐ-111ax`), for a person only the registrations they held.
 */
@Injectable()
export class ToolStatusQueryService {
  constructor(
    private readonly statuses: ToolStatusRepo,
    private readonly devices: DevicesApi,
    private readonly scope: UsageOverviewScopeService,
  ) {}

  /** Throws DeviceNotFoundError. A machine none of whose registrations a person of the scope of the IT Admin held is an empty page (D8). */
  async ofDevice(actor: AuthenticatedPrincipal, deviceId: string, query: { page: number; pageSize: number }) {
    if (!(await this.devices.deviceExists(deviceId))) throw new DeviceNotFoundError();

    return this.read(deviceId, await this.scope.registrationIdsOfDevice(actor, deviceId), query);
  }

  /** Throws DeviceNotFoundError, also for a machine the person never held. */
  async ofMyDevice(employeeId: string, deviceId: string, query: { page: number; pageSize: number }) {
    const registrationIds = await this.devices.holderRegistrationIds(deviceId, employeeId);
    if (registrationIds.length === 0) throw new DeviceNotFoundError();

    return this.read(deviceId, registrationIds, query);
  }

  private async read(deviceId: string, registrationIds: readonly string[], query: { page: number; pageSize: number }) {
    if (registrationIds.length === 0) {
      return { items: [], pagination: { page: query.page, pageSize: query.pageSize, totalItems: 0, totalPages: 0 } };
    }
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
