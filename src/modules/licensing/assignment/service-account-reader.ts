import { Injectable, OnModuleInit } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OrganizationService } from '../../organization/organization.service';
import type { DepartmentServiceAccountReader } from '../../organization/organization.types';
import { AssignmentRepo } from './assignment.repo';

/**
 * What the organization may ask of the service accounts this module holds (`QĐ-86c`): the open ones a department owns. It
 * hands itself to the organization when the module starts, so the organization never imports licensing.
 */
@Injectable()
export class AssignmentServiceAccountReader implements DepartmentServiceAccountReader, OnModuleInit {
  constructor(
    private readonly repo: AssignmentRepo,
    private readonly organization: OrganizationService,
  ) {}

  onModuleInit(): void {
    this.organization.registerServiceAccountReader(this);
  }

  ownedBy(departmentId: string, day: BusinessDate, limit: number, tx?: DbTx) {
    return this.repo.ownedServiceAccounts(departmentId, day, limit, tx);
  }
}
