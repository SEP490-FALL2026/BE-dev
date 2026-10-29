import { Injectable, OnModuleInit } from '@nestjs/common';
import { EmployeeAccountsHook } from '../../organization/public/organization.extension-points';
import { IdentityAccessApi } from '../public/identity-access.api';

/**
 * Hands the organization how it reads the account of an employee (D5), so that the organization never imports identity-access:
 * the department use cases refuse a head who holds SUPER_ADMIN and an IT Admin in charge whose account is not usable. Each method
 * is the facade method of the same name, so the statements and the lock order (the employee, then the account `FOR SHARE`) are
 * the ones of the facade.
 */
@Injectable()
export class EmployeeAccountsListener implements OnModuleInit {
  constructor(
    private readonly hook: EmployeeAccountsHook,
    private readonly identity: IdentityAccessApi,
  ) {}

  onModuleInit(): void {
    this.hook.bind({
      inspectEmployeeAccount: (tx, employeeId) => this.identity.inspectEmployeeAccount(tx, employeeId),
      findUsableItAdminEmployeeIds: (employeeIds) => this.identity.findUsableItAdminEmployeeIds(employeeIds),
    });
  }
}
