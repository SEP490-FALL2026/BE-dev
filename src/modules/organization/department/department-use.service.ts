import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import {
  CostCenterUseContributions,
  DepartmentUseContributions,
  type CostCenterUseReader,
  type DepartmentUseReader,
} from '../public/organization.extension-points';
import type { CostCenterUse, DepartmentUse, UseGroup } from '../public/organization-use.types';
import { UseReaderMissingError } from './department.errors';

/** The first `limit` things of all the readers of a group, in the order they were added, and how many there are in all. */
function mergeGroups(groups: readonly UseGroup[], limit: number): UseGroup {
  return {
    items: groups.flatMap((group) => group.items).slice(0, limit),
    total: groups.reduce((sum, group) => sum + group.total, 0),
  };
}

/**
 * What keeps a department (`QĐ-90e`) or a Cost Center (`QĐ-87d(2)`) in use, asked of the readers the modules that hold the facts
 * add when they start: the organization never imports them. A group with no reader fails loudly, and a reader that says nothing
 * is left means nothing is. Several modules may tell the same group (open work is the Requests of the department, its personnel
 * events and its open tasks); each is asked in turn in the caller's transaction.
 */
@Injectable()
export class DepartmentUseService {
  constructor(
    private readonly departmentReaders: DepartmentUseContributions,
    private readonly costCenterReaders: CostCenterUseContributions,
  ) {}

  /** What keeps the department in use on `day`: the first `limit` of each group and the totals. */
  async readDepartment(departmentId: string, day: BusinessDate, limit: number, tx?: DbTx): Promise<DepartmentUse> {
    const ask = async (group: DepartmentUseReader['group']): Promise<UseGroup> => {
      const readers = this.departmentReaders.all().filter((reader) => reader.group === group);
      if (readers.length === 0) throw new UseReaderMissingError(group);
      const answers: UseGroup[] = [];
      for (const reader of readers) answers.push(await reader.read(departmentId, day, limit, tx));

      return mergeGroups(answers, limit);
    };

    return { openWork: await ask('OPEN_WORK'), subscriptions: await ask('SUBSCRIPTIONS') };
  }

  /** What keeps the Cost Center in use: the first `limit` of each group and the totals. */
  async readCostCenter(costCenterId: string, limit: number, tx?: DbTx): Promise<CostCenterUse> {
    const ask = async (group: CostCenterUseReader['group']): Promise<UseGroup> => {
      const readers = this.costCenterReaders.all().filter((reader) => reader.group === group);
      if (readers.length === 0) throw new UseReaderMissingError(group);
      const answers: UseGroup[] = [];
      for (const reader of readers) answers.push(await reader.read(costCenterId, limit, tx));

      return mergeGroups(answers, limit);
    };

    return { requests: await ask('REQUESTS'), commitments: await ask('COMMITMENTS') };
  }
}
