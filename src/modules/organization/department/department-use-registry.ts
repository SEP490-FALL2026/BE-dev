import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type {
  CostCenterUse,
  CostCenterUseReader,
  DepartmentUse,
  DepartmentUseReader,
  UseGroup,
} from '../organization-use.types';

/**
 * Nobody has registered a reader of one group of what keeps a department or a Cost Center in use, so retiring it could pass what
 * the organization cannot see: a configuration error that fails loudly instead of letting the retirement through.
 */
export class UseReaderNotRegisteredError extends Error {
  constructor(readonly group: string) {
    super(`No module has registered a reader of ${group}, which keeps a department or a Cost Center in use.`);
    this.name = 'UseReaderNotRegisteredError';
  }
}

/** The first `limit` things of all the readers of a group, in the order they registered, and how many there are in all. */
function mergeGroups(groups: readonly UseGroup[], limit: number): UseGroup {
  return {
    items: groups.flatMap((group) => group.items).slice(0, limit),
    total: groups.reduce((sum, group) => sum + group.total, 0),
  };
}

/**
 * Where the modules that hold the facts hand the organization what keeps a department (`QĐ-90e`) or a Cost Center
 * (`QĐ-87d(2)`) in use, when they start: the organization never imports them. Retiring asks here, a group with no reader fails
 * loudly, and a reader that says nothing is left means nothing is. Several modules may tell the same group (open work is the
 * Requests of the department, its personnel events and its open tasks); each is asked in turn in the caller's transaction.
 */
@Injectable()
export class DepartmentUseRegistry {
  private readonly departmentReaders: DepartmentUseReader[] = [];
  private readonly costCenterReaders: CostCenterUseReader[] = [];

  registerDepartment(reader: DepartmentUseReader): void {
    this.departmentReaders.push(reader);
  }

  registerCostCenter(reader: CostCenterUseReader): void {
    this.costCenterReaders.push(reader);
  }

  /** What keeps the department in use on `day`: the first `limit` of each group and the totals. */
  async readDepartment(departmentId: string, day: BusinessDate, limit: number, tx?: DbTx): Promise<DepartmentUse> {
    const ask = async (group: DepartmentUseReader['group']): Promise<UseGroup> => {
      const readers = this.departmentReaders.filter((reader) => reader.group === group);
      if (readers.length === 0) throw new UseReaderNotRegisteredError(group);
      const answers: UseGroup[] = [];
      for (const reader of readers) answers.push(await reader.read(departmentId, day, limit, tx));

      return mergeGroups(answers, limit);
    };

    return { openWork: await ask('OPEN_WORK'), subscriptions: await ask('SUBSCRIPTIONS') };
  }

  /** What keeps the Cost Center in use: the first `limit` of each group and the totals. */
  async readCostCenter(costCenterId: string, limit: number, tx?: DbTx): Promise<CostCenterUse> {
    const ask = async (group: CostCenterUseReader['group']): Promise<UseGroup> => {
      const readers = this.costCenterReaders.filter((reader) => reader.group === group);
      if (readers.length === 0) throw new UseReaderNotRegisteredError(group);
      const answers: UseGroup[] = [];
      for (const reader of readers) answers.push(await reader.read(costCenterId, limit, tx));

      return mergeGroups(answers, limit);
    };

    return { requests: await ask('REQUESTS'), commitments: await ask('COMMITMENTS') };
  }
}
