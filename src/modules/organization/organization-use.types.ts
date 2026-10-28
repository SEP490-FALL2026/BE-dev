import type { BusinessDate } from '../../core/business-date';
import type { DbTx } from '../../infrastructure/database/transaction-runner';

// What keeps a department or a Cost Center in use, told by the modules that hold the fact (`QĐ-90e`, `QĐ-87d(2)`): the types of the
// readers they register with the organization facade and of what it hands back. Public types of the organization, like `organization.types.ts`.

/**
 * One thing that keeps a department or a Cost Center in use: what kind it is, its id and a short label (a code or a name), never
 * a figure or the record of a person. The modules that hold the fact tell it; the organization only lists it (`QĐ-90e`, `QĐ-87d(2)`).
 */
export interface UseItem {
  kind: string;
  id: string;
  label: string | null;
}

/** The first of the things of one kind that keep it in use and how many there are in all. */
export interface UseGroup {
  items: UseItem[];
  total: number;
}

export type DepartmentUseGroupName = 'OPEN_WORK' | 'SUBSCRIPTIONS';
export type CostCenterUseGroupName = 'REQUESTS' | 'COMMITMENTS';

/**
 * Tells one kind of thing that keeps a department in use: the Requests and personnel events that are not over and the tasks that
 * are open (`OPEN_WORK`), or the subscriptions and purchases that still owe a payment (`SUBSCRIPTIONS`). The module that holds the
 * fact registers it when it starts (as `licensing` does for service accounts); several may tell the same group.
 */
export interface DepartmentUseReader {
  readonly group: DepartmentUseGroupName;
  read(departmentId: string, day: BusinessDate, limit: number, tx?: DbTx): Promise<UseGroup>;
}

/** The same for a Cost Center: the Requests with a cost that are not over (`REQUESTS`) and the commitments still held (`COMMITMENTS`). */
export interface CostCenterUseReader {
  readonly group: CostCenterUseGroupName;
  read(costCenterId: string, limit: number, tx?: DbTx): Promise<UseGroup>;
}

export interface DepartmentUse {
  openWork: UseGroup;
  subscriptions: UseGroup;
}

export interface CostCenterUse {
  requests: UseGroup;
  commitments: UseGroup;
}
