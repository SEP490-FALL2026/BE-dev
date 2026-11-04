import { Injectable } from '@nestjs/common';
import { BusinessDate } from '../../../core/business-date';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CostCenterCatalogueService } from '../cost-center/cost-center-catalogue.service';
import { DepartmentRecordService } from '../department/department-record.service';
import { DepartmentUseService } from '../department/department-use.service';
import { OrganizationChangeService } from '../change-announcement/organization-change.service';
import { EmployeeRecordService } from '../employee/employee-record.service';
import { OrganizationRepo } from '../organization.repo';
import type { CostCenterUse, DepartmentUse } from './organization-use.types';
import {
  CreateCostCenterInput,
  CreateDepartmentInput,
  CreateEmployeeWithPlacementInput,
  CreateOrganizationInput,
  NewOrganizationChange,
  OfficialFieldsPatch,
  OrganizationRecord,
} from './organization.types';

/**
 * Public facade of the organization module for what other modules WRITE or lock for writing, and for the two readers of what keeps a
 * department or a Cost Center in use. Reads are `OrganizationReadApi`. Other modules call it in their own transaction, never the tables.
 */
@Injectable()
export class OrganizationApi {
  constructor(
    private readonly repo: OrganizationRepo,
    private readonly departments: DepartmentRecordService,
    private readonly employees: EmployeeRecordService,
    private readonly costCenters: CostCenterCatalogueService,
    private readonly use: DepartmentUseService,
    private readonly changes: OrganizationChangeService,
  ) {}

  /** Tells the listeners of a change that has taken effect (`OrganizationChangeListeners`), in the caller's transaction; one that throws rolls it back. */
  emitChange(tx: DbTx, change: NewOrganizationChange): Promise<void> {
    return this.changes.emit(tx, change);
  }

  /** Changes the reporting currency; the database locks it once a rate or a converted price exists (AC-9, `55000`). */
  setReportingCurrency(tx: DbTx, organizationId: string, currency: string): Promise<void> {
    return this.repo.setReportingCurrency(tx, organizationId, currency);
  }

  createOrganization(tx: DbTx, input: CreateOrganizationInput): Promise<OrganizationRecord> {
    return this.repo.createOrganization(tx, input);
  }

  createUnitCostCenter(tx: DbTx, input: CreateCostCenterInput): Promise<{ id: string }> {
    return this.costCenters.createUnitForInstallation(tx, input);
  }

  createDepartment(tx: DbTx, input: CreateDepartmentInput): Promise<{ id: string }> {
    return this.departments.createForInstallation(tx, input);
  }

  /** The only way to create an employee: Employee and its first placement, in the caller's transaction. */
  createEmployeeWithPlacement(tx: DbTx, input: CreateEmployeeWithPlacementInput): Promise<{ id: string }> {
    return this.employees.createWithPlacement(tx, input);
  }

  lockEmployeeForUpdate(tx: DbTx, employeeId: string): Promise<void> {
    return this.employees.lock(tx, employeeId, 'UPDATE');
  }

  cancelScheduledFirstPlacement(tx: DbTx, placementId: string): Promise<void> {
    return this.employees.cancelScheduledFirstPlacement(tx, placementId);
  }

  restoreFirstPlacement(
    tx: DbTx,
    input: {
      placementId: string;
      organizationId: string;
      employeeId: string;
      departmentId: string;
      validFrom: BusinessDate;
    },
  ): Promise<void> {
    return this.employees.restoreFirstPlacement(tx, input);
  }

  /** Corrects the official fields of an employee whose row the caller holds `FOR UPDATE` (`US-02-02` AC-19). */
  updateEmployeeOfficialFields(tx: DbTx, employeeId: string, patch: OfficialFieldsPatch): Promise<void> {
    return this.employees.updateOfficialFields(tx, employeeId, patch);
  }

  /** The first `limit` of each thing that keeps the department in use on `day` and how many there are: retiring waits for them. */
  getDepartmentUse(departmentId: string, day: BusinessDate, limit: number, tx?: DbTx): Promise<DepartmentUse> {
    return this.use.readDepartment(departmentId, day, limit, tx);
  }

  /** The same for a Cost Center: Requests with a cost not over and commitments held (`QĐ-87d(2)`), told by their modules. */
  getCostCenterUse(costCenterId: string, limit: number, tx?: DbTx): Promise<CostCenterUse> {
    return this.use.readCostCenter(costCenterId, limit, tx);
  }
}
