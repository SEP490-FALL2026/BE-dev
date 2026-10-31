import { Injectable, OnModuleInit } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { UseGroup } from '../../organization/public/organization-use.types';
import {
  DepartmentUseContributions,
  type DepartmentUseReader,
} from '../../organization/public/organization.extension-points';
import { DepartmentOpenWorkRepo } from './department-open-work.repo';

/**
 * The personnel part of the group `OPEN_WORK` of what keeps a department in use: the events and notices that are not over. It
 * hands itself to the organization when the module starts, so the organization never imports personnel; the Requests and the open
 * tasks are told by the modules that hold them. Retiring a department with no reader for the group fails, so this one must be here.
 */
@Injectable()
export class DepartmentOpenWorkReader implements DepartmentUseReader, OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [DepartmentUseContributions] as const;

  readonly group = 'OPEN_WORK' as const;

  constructor(
    private readonly repo: DepartmentOpenWorkRepo,
    private readonly departmentUse: DepartmentUseContributions,
  ) {}

  onModuleInit(): void {
    this.departmentUse.add('personnel.open-work', this);
  }

  /** The day does not matter here: an event that waits keeps the department in use whatever its date. */
  read(departmentId: string, _day: BusinessDate, limit: number, tx?: DbTx): Promise<UseGroup> {
    return this.repo.read(departmentId, limit, tx);
  }
}
