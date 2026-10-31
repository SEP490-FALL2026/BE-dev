import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { Contributions } from '../../../core/extension/contributions';
import { Hook } from '../../../core/extension/hook';
import { Listeners } from '../../../core/extension/listeners';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { CostCenterUseGroupName, DepartmentUseGroupName, UseGroup } from './organization-use.types';
import type { OrganizationChange } from './organization.types';

// The points the organization opens for the modules above it (`core/extension`): they bind or add to them from a
// `*.listener.ts` when their module starts, so the organization never imports them. One instance of each per application.

/**
 * A module that acts on a change of the organization. It is called in the transaction of the change, in the order the
 * listeners were added; throwing rolls the change back with it.
 */
export interface OrganizationChangeListener {
  onChange(tx: DbTx, change: OrganizationChange): Promise<void>;
}

/**
 * The modules that act on a change of the organization, told in the transaction of the change (`FR-3.16`): whoever writes a
 * change emits it through the facade, the hourly sweep emits the ones dated for a day that has come. With nobody added a change
 * is told to nobody.
 */
@Injectable()
export class OrganizationChangeListeners extends Listeners<OrganizationChange, DbTx> {
  constructor() {
    super('organization.change-listeners');
  }
}

/**
 * Tells one kind of thing that keeps a department in use: the Requests and personnel events that are not over and the tasks that
 * are open (`OPEN_WORK`), or the subscriptions and purchases that still owe a payment (`SUBSCRIPTIONS`). The module that holds the
 * fact adds it when it starts; several may tell the same group.
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

/**
 * What keeps a department in use (`QĐ-90e`), told by the modules that hold the facts. Retiring asks every reader of each group
 * in the order they were added and fails loudly for a group nobody reads (`department/department-use.service.ts`).
 */
@Injectable()
export class DepartmentUseContributions extends Contributions<DepartmentUseReader> {
  constructor() {
    super('organization.department-use-readers');
  }
}

/** What keeps a Cost Center in use (`QĐ-87d(2)`), the same way as `DepartmentUseContributions`. */
@Injectable()
export class CostCenterUseContributions extends Contributions<CostCenterUseReader> {
  constructor() {
    super('organization.cost-center-use-readers');
  }
}

/**
 * What the organization needs to know of the service accounts a department owns (`QĐ-86c`), without importing `licensing`: the
 * first `limit` of those that are open or will be, and how many there are in all.
 */
export interface DepartmentServiceAccountReader {
  ownedBy(
    departmentId: string,
    day: BusinessDate,
    limit: number,
    tx?: DbTx,
  ): Promise<{ items: { assignmentId: string; accountIdentifier: string }[]; total: number }>;
}

/**
 * The reader of the service accounts a department owns, bound by `licensing`. Retiring a department asks it; unbound, it fails
 * loudly instead of letting a department with an open service account go.
 */
@Injectable()
export class DepartmentServiceAccountReaderHook extends Hook<DepartmentServiceAccountReader> {
  constructor() {
    super('organization.department-service-account-reader');
  }
}

/** What the organization needs to know of the account of an employee. Roles are plain names, as in `AuthenticatedPrincipal`. */
export interface EmployeeAccountStanding {
  hasAccount: boolean;
  /** Active, activated: the account can sign in (the employee having left is the organization's to say). */
  usable: boolean;
  /** The roles granted directly and still in force. */
  roles: readonly string[];
}

/** The accounts of the employees, as the department use cases need them (D5: the organization never imports identity-access). */
export interface EmployeeAccounts {
  /**
   * Locks the employee's account `FOR SHARE` in `tx` and reads it in its own statement: the caller holds the employee first, so
   * the order of the lock protocol is the employee, then the account.
   */
  inspectEmployeeAccount(tx: DbTx, employeeId: string): Promise<EmployeeAccountStanding>;
  /** Among these employees, those holding IT_ADMIN on a usable account (an unlocked read, for lists). */
  findUsableItAdminEmployeeIds(employeeIds: readonly string[]): Promise<ReadonlySet<string>>;
}

/**
 * The accounts of the employees, bound by `identity-access`: a head may not hold SUPER_ADMIN (`US-03-06` AC-7) and the IT Admin
 * in charge of a department must hold IT_ADMIN on a usable account. Only the API loads the department use cases, and it binds it.
 */
@Injectable()
export class EmployeeAccountsHook extends Hook<EmployeeAccounts> {
  constructor() {
    super('organization.employee-accounts');
  }
}
