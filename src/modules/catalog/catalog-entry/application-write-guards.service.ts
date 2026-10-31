import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { isCheckViolation, isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import { EmployeeNotFoundError } from '../../organization/public/organization.errors';
import { OrganizationApi } from '../../organization/public/organization.api';
import { FunctionalGroupLookupService } from '../functional-group/functional-group-lookup.service';
import { VendorDictionaryGroupChangedError, VendorNameHeldByAnotherGroupError } from '../vendor/vendor.errors';
import {
  ApplicationBusinessOwnerInvalidError,
  ApplicationDictionaryLineMismatchError,
  ApplicationDictionaryLineTakenError,
  ApplicationFunctionalGroupInvalidError,
  ApplicationNameTakenError,
  ApplicationVendorGroupChangedError,
} from './application.errors';

/**
 * What a write of an application checks about what it refers to (`US-04-01`, `INV-06`): that the organization exists, that the Business
 * Owner still works (the employee is locked `FOR SHARE` so a departure cannot slip in), that the functional group is active; and the
 * answer to what the database refused by the column it names.
 */
@Injectable()
export class ApplicationWriteGuards {
  constructor(
    private readonly organization: OrganizationApi,
    private readonly functionalGroups: FunctionalGroupLookupService,
  ) {}

  /** Locks the employee `FOR SHARE` so a departure cannot slip in, then requires them to be still working (`INV-06`). */
  async requireWorkingOwner(tx: DbTx, employeeId: string): Promise<void> {
    try {
      await this.organization.lockEmployeeForShare(tx, employeeId);
    } catch (error) {
      if (error instanceof EmployeeNotFoundError) throw new ApplicationBusinessOwnerInvalidError();
      throw error;
    }
    const employee = await this.organization.getEmployee(employeeId, tx);
    if (!employee || employee.status !== 'ACTIVE') throw new ApplicationBusinessOwnerInvalidError();
  }

  async requireActiveGroup(tx: DbTx, id: string): Promise<{ id: string; name: string }> {
    const group = await this.functionalGroups.findActive(tx, id);
    if (!group) throw new ApplicationFunctionalGroupInvalidError();

    return group;
  }

  mapWriteError(error: unknown): unknown {
    if (error instanceof VendorNameHeldByAnotherGroupError) return new ApplicationDictionaryLineMismatchError();
    if (error instanceof VendorDictionaryGroupChangedError) return new ApplicationVendorGroupChangedError();
    if (isUniqueViolation(error, 'dictionary_line_id')) return new ApplicationDictionaryLineTakenError();
    if (isUniqueViolation(error, 'normalized_name')) return new ApplicationNameTakenError();
    if (isCheckViolation(error)) return new ApplicationDictionaryLineMismatchError();

    return error;
  }

  async requireOrganizationId(): Promise<string> {
    const organization = await this.organization.getOrganization();
    if (!organization) throw new Error('The application catalog was used before installation');

    return organization.id;
  }
}
