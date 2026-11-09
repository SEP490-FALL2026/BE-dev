import { Injectable } from '@nestjs/common';
import { fromDateColumn } from '../../../core/business-date';
import { DevicesApi } from '../../devices/public/devices.api';
import { DeviceNotFoundError } from '../../devices/public/devices.errors';
import { IntakeRejectionRepo, type RejectionReason } from './intake-rejection.repo';

/** Why data from a machine was refused, newest first: what the IT Admin reads to see why a machine is quiet. */
@Injectable()
export class IntakeRejectionQueryService {
  constructor(
    private readonly rejections: IntakeRejectionRepo,
    private readonly devices: DevicesApi,
  ) {}

  /** Throws DeviceNotFoundError. */
  async ofDevice(
    deviceId: string,
    query: { reasonCode?: RejectionReason | undefined; page: number; pageSize: number },
  ) {
    if (!(await this.devices.deviceExists(deviceId))) throw new DeviceNotFoundError();
    const { rows, total } = await this.rejections.pageOfDevice(
      deviceId,
      query.reasonCode,
      (query.page - 1) * query.pageSize,
      query.pageSize,
    );

    return {
      items: rows.map((row) => ({
        id: row.id,
        endpoint: row.endpoint,
        date: row.usageDate ? fromDateColumn(row.usageDate) : null,
        reasonCode: row.reasonCode,
        rejectedAt: row.rejectedAt.toISOString(),
      })),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems: total,
        totalPages: Math.ceil(total / query.pageSize),
      },
    };
  }
}
