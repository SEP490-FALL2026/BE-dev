import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import {
  CreateEmployeeWithPlacementInput,
  EmployeeCandidate,
  EmployeeImportLookupData,
  EmployeeProfile,
  EmployeeRecord,
} from '../organization.types';
import { EmployeeRepo } from './employee.repo';
import { ImportLookupRepo } from './import-lookup.repo';

/**
 * The people of the organization as `OrganizationModule` holds them: the owner of `EmployeeRepo` and `ImportLookupRepo`,
 * which no other provider injects. The organization facade reaches employees through it, for other modules (accounts,
 * recovery, import, installation) and for the manual entry use case. Every call runs in the caller's transaction, in
 * the order the caller makes it; the rules of entry and import stay with their use cases.
 */
@Injectable()
export class EmployeeDirectoryService {
  constructor(
    private readonly repo: EmployeeRepo,
    private readonly importLookup: ImportLookupRepo,
  ) {}

  createWithPlacement(tx: DbTx, input: CreateEmployeeWithPlacementInput): Promise<{ id: string }> {
    return this.repo.createEmployeeWithPlacement(tx, input);
  }

  lock(tx: DbTx, employeeId: string, mode: 'SHARE' | 'UPDATE'): Promise<void> {
    return this.repo.lockEmployee(tx, employeeId, mode);
  }

  find(employeeId: string, tx?: DbTx): Promise<EmployeeRecord | null> {
    return this.repo.findEmployee(employeeId, tx);
  }

  findByCode(employeeCode: string, tx?: DbTx): Promise<EmployeeRecord | null> {
    return this.repo.findEmployeeByCode(employeeCode, tx);
  }

  findMany(employeeIds: string[]): Promise<EmployeeRecord[]> {
    return this.repo.findEmployees(employeeIds);
  }

  placementOn(employeeId: string, onDate: BusinessDate): Promise<{ departmentId: string; jobTitleId: string } | null> {
    return this.repo.placementIdsOn(employeeId, onDate);
  }

  findManyByCodes(employeeCodes: readonly string[], tx?: DbTx): Promise<EmployeeRecord[]> {
    return this.repo.findEmployeesByCodes(employeeCodes, tx);
  }

  workEmailDomains(tx?: DbTx): Promise<string[]> {
    return this.repo.workEmailDomains(tx);
  }

  countActive(tx?: DbTx): Promise<number> {
    return this.repo.countActive(tx);
  }

  searchActive(
    search: string | undefined,
    onDate: Date,
    limit: number,
    excludeEmployeeIds: readonly string[],
  ): Promise<EmployeeCandidate[]> {
    return this.repo.searchActiveEmployees(search, onDate, limit, excludeEmployeeIds);
  }

  profile(employeeId: string, onDate: Date): Promise<EmployeeProfile | null> {
    return this.repo.findProfile(employeeId, onDate);
  }

  /** The database clock at the start of the caller's transaction: the instant the new employee's `created_at` gets. */
  recordingInstant(tx: DbTx): Promise<Date> {
    return this.repo.databaseNow(tx);
  }

  isCodeTaken(tx: DbTx, organizationId: string, employeeCode: string): Promise<boolean> {
    return this.repo.employeeCodeExists(tx, organizationId, employeeCode);
  }

  isWorkEmailTaken(tx: DbTx, organizationId: string, normalizedWorkEmail: string): Promise<boolean> {
    return this.repo.workEmailExists(tx, organizationId, normalizedWorkEmail);
  }

  lookupForImport(
    tx: DbTx | undefined,
    names: {
      departmentCodes: string[];
      normalizedJobTitleNames: string[];
      employeeCodes: string[];
      normalizedEmails: string[];
    },
  ): Promise<EmployeeImportLookupData> {
    return this.importLookup.lookup(tx, names);
  }

  lockForImport(tx: DbTx, departmentIds: string[], jobTitleIds: string[]): Promise<void> {
    return this.importLookup.lockForImport(tx, departmentIds, jobTitleIds);
  }
}
