import { Injectable, OnModuleInit } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { DepartmentUseReader, UseGroup } from '../../organization/organization-use.types';
import { OrganizationService } from '../../organization/organization.service';
import { DepartmentOpenWorkRepo } from './department-open-work.repo';

/**
 * The personnel part of the group `OPEN_WORK` of what keeps a department in use (F15): the events and notices that are not over. It
 * hands itself to the organization when the module starts, so the organization never imports personnel; the Requests and the open
 * tasks are told by the modules that hold them. Retiring a department with no reader for the group fails, so this one must be here.
 */
@Injectable()
export class DepartmentOpenWorkReader implements DepartmentUseReader, OnModuleInit {
  readonly group = 'OPEN_WORK' as const;

  constructor(
    private readonly repo: DepartmentOpenWorkRepo,
    private readonly organization: OrganizationService,
  ) {}

  onModuleInit(): void {
    this.organization.registerDepartmentUseReader(this);
  }

  /** The day does not matter here: an event that waits keeps the department in use whatever its date. */
  read(departmentId: string, _day: BusinessDate, limit: number, tx?: DbTx): Promise<UseGroup> {
    return this.repo.read(departmentId, limit, tx);
  }
}
