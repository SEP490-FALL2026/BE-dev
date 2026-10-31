import { Injectable, OnModuleInit } from '@nestjs/common';
import { EmployeeAccountsHook } from '../../organization/public/organization.extension-points';
import { AccountDirectoryService } from './account-directory.service';

/**
 * Hands the organization how it reads the account of an employee (D5), so that the organization never imports identity-access:
 * the department use cases refuse a head who holds SUPER_ADMIN and an IT Admin in charge whose account is not usable. Each method
 * is the method of `AccountDirectoryService` that the facade of the same name calls, so the statements and the lock order (the
 * employee, then the account `FOR SHARE`) are the ones of the facade.
 */
@Injectable()
export class EmployeeAccountsListener implements OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [EmployeeAccountsHook] as const;

  constructor(
    private readonly hook: EmployeeAccountsHook,
    private readonly accounts: AccountDirectoryService,
  ) {}

  onModuleInit(): void {
    this.hook.bind({
      inspectEmployeeAccount: (tx, employeeId) => this.accounts.inspectEmployeeAccount(tx, employeeId),
      findUsableItAdminEmployeeIds: (employeeIds) => this.accounts.findUsableItAdminEmployeeIds(employeeIds),
    });
  }
}
