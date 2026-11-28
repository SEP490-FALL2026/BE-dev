import { Injectable, OnModuleInit } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import {
  DepartmentUseContributions,
  type DepartmentUseReader,
} from '../../organization/public/organization.extension-points';
import type { UseGroup } from '../../organization/public/organization-use.types';
import { SaasIssueRepo } from './saas-issue.repo';

/**
 * Unclosed SaaS issue reports that keep a department in use (`OPEN_WORK`): a department with an unclosed report
 * (anything other than `CLOSED` or `DUPLICATE`) cannot be retired. Registers with `DepartmentUseContributions` so
 * `organization` never imports `licensing`.
 */
@Injectable()
export class SaasIssueOpenWorkReader implements DepartmentUseReader, OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [DepartmentUseContributions] as const;

  readonly group = 'OPEN_WORK' as const;

  constructor(
    private readonly repo: SaasIssueRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly departmentUse: DepartmentUseContributions,
  ) {}

  onModuleInit(): void {
    this.departmentUse.add('licensing.saas-issues-open-work', this);
  }

  async read(departmentId: string, day: BusinessDate, limit: number, tx?: DbTx): Promise<UseGroup> {
    const memberIds = await this.organizationReads.getMemberIdsOfDepartments([departmentId], day, tx);
    const { items, total } = await this.repo.openOfDepartment(departmentId, memberIds, limit, tx);

    return {
      total,
      items: items.map((item) => ({
        kind: 'SAAS_ISSUE',
        id: item.id,
        label: item.code,
      })),
    };
  }
}
