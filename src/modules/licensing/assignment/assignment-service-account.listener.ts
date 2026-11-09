import { Injectable, OnModuleInit } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import {
  DepartmentServiceAccountReaderHook,
  type DepartmentServiceAccountReader,
} from '../../organization/public/organization.extension-points';
import { AssignmentRepo } from './assignment.repo';

/**
 * What the organization may ask of the service accounts this module holds (`QĐ-86c`): the open ones a department owns. It
 * binds itself to the organization's hook when the module starts, so the organization never imports licensing.
 */
@Injectable()
export class AssignmentServiceAccountReader implements DepartmentServiceAccountReader, OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [DepartmentServiceAccountReaderHook] as const;

  constructor(
    private readonly repo: AssignmentRepo,
    private readonly hook: DepartmentServiceAccountReaderHook,
  ) {}

  onModuleInit(): void {
    this.hook.bind(this);
  }

  ownedBy(departmentId: string, day: BusinessDate, limit: number, tx?: DbTx) {
    return this.repo.ownedServiceAccounts(departmentId, day, limit, tx);
  }
}
