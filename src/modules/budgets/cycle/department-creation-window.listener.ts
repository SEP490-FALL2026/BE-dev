import { Injectable, OnModuleInit } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import {
  DepartmentCreationWindowHook,
  type DepartmentCreationWindow,
  type DepartmentCreationWindowReader,
} from '../../organization/public/organization.extension-points';
import { windowOf } from './cycle.policy';
import { CycleRepo } from './cycle.repo';

/**
 * Tells the organization whether a department may be made today (`QĐ-104e(3)`, `R-I10`): only while the budget cycle of the next
 * year exists and was never published. It binds itself to the hook of the organization when the module starts, so the organization
 * never imports budgets. The cycle is read `FOR SHARE` in the transaction of the creation: a publication made at the same time
 * waits for the department (and then finds its ceiling missing), or the creation waits and is refused.
 */
@Injectable()
export class DepartmentCreationWindowListener implements DepartmentCreationWindowReader, OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [DepartmentCreationWindowHook] as const;

  constructor(
    private readonly cycles: CycleRepo,
    private readonly hook: DepartmentCreationWindowHook,
  ) {}

  onModuleInit(): void {
    this.hook.bind(this);
  }

  async windowOn(tx: DbTx, organizationId: string, today: BusinessDate): Promise<DepartmentCreationWindow> {
    const nextYear = Number(today.slice(0, 4)) + 1;
    const next = await this.cycles.lockByYear(tx, organizationId, nextYear, 'SHARE');

    return windowOf({
      nextYear,
      nextCycle: next ? { neverPublished: next.firstPublishedAt === null } : null,
      anyCycle: next !== null || (await this.cycles.anyExists(organizationId, tx)),
    });
  }
}
