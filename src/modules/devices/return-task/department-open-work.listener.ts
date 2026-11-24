import { Injectable, OnModuleInit } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import {
  DepartmentUseContributions,
  type DepartmentUseReader,
} from '../../organization/public/organization.extension-points';
import type { UseGroup } from '../../organization/public/organization-use.types';
import { DeviceReturnTaskRepo } from './device-return-task.repo';

/**
 * Open device return tasks that keep a department in use (`OPEN_WORK`): a department with an open return task
 * cannot be retired until the task is completed or cancelled. Registers with `DepartmentUseContributions` so
 * `organization` never imports `devices`.
 */
@Injectable()
export class DeviceReturnTaskOpenWorkReader implements DepartmentUseReader, OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [DepartmentUseContributions] as const;

  readonly group = 'OPEN_WORK' as const;

  constructor(
    private readonly repo: DeviceReturnTaskRepo,
    private readonly departmentUse: DepartmentUseContributions,
  ) {}

  onModuleInit(): void {
    this.departmentUse.add('devices.return-tasks-open-work', this);
  }

  async read(departmentId: string, _day: BusinessDate, limit: number, tx?: DbTx): Promise<UseGroup> {
    const { items, total } = await this.repo.openOfDepartment(departmentId, limit, tx);

    return {
      total,
      items: items.map((item) => ({
        kind: 'DEVICE_RETURN_TASK',
        id: item.id,
        label: item.assetCode,
      })),
    };
  }
}
