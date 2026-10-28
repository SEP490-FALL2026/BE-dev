import { Injectable, OnModuleInit } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OrganizationService } from '../../organization/organization.service';
import type { DepartmentUseReader, UseGroup } from '../../organization/organization-use.types';
import { RequestUseRepo, toUseGroup } from './request-use.repo';

/**
 * The requests of a department that are not over keep it in use (`OPEN_WORK`, `QĐ-90e`, F15): a department with work in progress is not
 * retired. Personnel events and the tasks that are open are told by the modules that hold them. It hands itself to the organization when
 * the module starts, so the organization never imports requests. A draft is not work (spec L.1).
 */
@Injectable()
export class DepartmentOpenRequestsReader implements DepartmentUseReader, OnModuleInit {
  readonly group = 'OPEN_WORK';

  constructor(
    private readonly repo: RequestUseRepo,
    private readonly organization: OrganizationService,
  ) {}

  onModuleInit(): void {
    this.organization.registerDepartmentUseReader(this);
  }

  /** The day does not matter to a request: it is open until it ends, whatever the day. */
  async read(departmentId: string, _day: BusinessDate, limit: number, tx?: DbTx): Promise<UseGroup> {
    return toUseGroup(await this.repo.ofDepartment(departmentId, limit, tx));
  }
}
