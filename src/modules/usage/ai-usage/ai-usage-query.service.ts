import { Injectable } from '@nestjs/common';
import { fromDateColumn } from '../../../core/business-date';
import { DevicesApi } from '../../devices/public/devices.api';
import { DeviceNotFoundError } from '../../devices/public/devices.errors';
import { AI_TOOL_EXPERIMENTAL } from '../allowlist/allowlist.policy';
import { AiUsageRepo, type UsageDayRow } from './ai-usage.repo';

function toWire(row: UsageDayRow) {
  return {
    date: fromDateColumn(row.usageDate),
    tool: row.tool,
    experimental: AI_TOOL_EXPERIMENTAL.has(row.tool),
    coverage: row.coverage,
    responses: row.responses,
    totalTokens: row.totalTokens,
    active: row.responses >= 1,
    generatedAt: row.generatedAt.toISOString(),
  };
}

const paginationOf = (page: number, pageSize: number, total: number) => ({
  page,
  pageSize,
  totalItems: total,
  totalPages: Math.ceil(total / pageSize),
});

interface UsageQuery {
  from?: string | undefined;
  to?: string | undefined;
  page: number;
  pageSize: number;
}

/** What is read of the counted days of a machine: all of it by the IT Admin, only the registrations they held by the person. */
@Injectable()
export class AiUsageQueryService {
  constructor(
    private readonly usage: AiUsageRepo,
    private readonly devices: DevicesApi,
  ) {}

  /** Throws DeviceNotFoundError. */
  async ofDevice(deviceId: string, query: UsageQuery) {
    if (!(await this.devices.deviceExists(deviceId))) throw new DeviceNotFoundError();
    const { rows, total } = await this.usage.page(
      { deviceId, from: query.from, to: query.to },
      (query.page - 1) * query.pageSize,
      query.pageSize,
    );

    return {
      items: rows.map((row) => ({ ...toWire(row), registrationId: row.registrationId })),
      pagination: paginationOf(query.page, query.pageSize, total),
    };
  }

  /** Throws DeviceNotFoundError, also for a machine the person never held: it does not tell that the machine exists. */
  async ofMyDevice(employeeId: string, deviceId: string, query: UsageQuery) {
    const registrationIds = await this.devices.holderRegistrationIds(deviceId, employeeId);
    if (registrationIds.length === 0) throw new DeviceNotFoundError();
    const { rows, total } = await this.usage.page(
      { deviceId, registrationIds, from: query.from, to: query.to },
      (query.page - 1) * query.pageSize,
      query.pageSize,
    );

    return { items: rows.map(toWire), pagination: paginationOf(query.page, query.pageSize, total) };
  }
}
