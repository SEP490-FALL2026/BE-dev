import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { BusinessDate } from '../../../core/business-date';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { DepartmentRecordService } from '../department/department-record.service';
import { EmployeeNotFoundError } from '../public/organization.errors';
import { profileNoticesOf } from './profile-notice.mapper';
import {
  CreateEmployeeWithPlacementInput,
  EmployeeCandidate,
  EmployeeImportLookupData,
  EmployeeProfile,
  EmployeeRecord,
  EmployeeWorkState,
  OfficialFieldsPatch,
  PlacementInForce,
  ProfileNotice,
  ProfileNoticeRequest,
  ScheduledStructureChange,
  StructureChangeInput,
} from '../public/organization.types';
import { EmployeeDepartureRepo } from './employee-departure.repo';
import { EmployeeRepo } from './employee.repo';
import { ImportLookupRepo } from './import-lookup.repo';

/**
 * The people of the organization as `OrganizationModule` holds them: the owner of `EmployeeRepo` and `ImportLookupRepo`,
 * which no other provider injects. The organization facade reaches employees through it, for other modules (accounts,
 * recovery, import, installation) and for the manual entry use case. Every call runs in the caller's transaction, in
 * the order the caller makes it; the rules of entry and import stay with their use cases.
 */
@Injectable()
export class EmployeeRecordService {
  constructor(
    private readonly repo: EmployeeRepo,
    private readonly importLookup: ImportLookupRepo,
    private readonly departures: EmployeeDepartureRepo,
    private readonly departments: DepartmentRecordService,
  ) {}

  /**
   * The notices a created or corrected record owes: who they go to follows from the department the person is in on the day
   * and who heads it and is IT Admin in charge of it then. Read in the caller's transaction, so they are right for what it writes.
   */
  async profileNotices(tx: DbTx, request: ProfileNoticeRequest): Promise<ProfileNotice[]> {
    const employee = await this.repo.findEmployee(request.employeeId, tx);
    if (!employee) throw new EmployeeNotFoundError(request.employeeId);
    const placement = await this.repo.placementIdsOn(request.employeeId, request.onDate, tx);
    const departmentId = placement?.departmentId ?? null;
    const head = departmentId
      ? (await this.departments.headsOn([departmentId], request.onDate, tx)).get(departmentId)
      : undefined;

    return profileNoticesOf({
      kind: request.kind,
      organizationId: request.organizationId,
      employee: { id: employee.id, working: employee.status === 'ACTIVE' },
      departmentId,
      headEmployeeId: head?.employeeId ?? null,
      itAdminEmployeeId: departmentId ? await this.departments.itAdminInChargeOf(departmentId, tx) : null,
      eventId: randomUUID(),
    });
  }

  createWithPlacement(tx: DbTx, input: CreateEmployeeWithPlacementInput): Promise<{ id: string }> {
    return this.repo.createEmployeeWithPlacement(tx, input);
  }

  unplacedAmong(employeeIds: readonly string[], tx?: DbTx): Promise<Set<string>> {
    return this.repo.unplacedAmong(employeeIds, tx);
  }

  insertFirstPlacement(
    tx: DbTx,
    input: { organizationId: string; employeeId: string; departmentId: string; effectiveFrom: BusinessDate },
  ): Promise<void> {
    return this.repo.insertFirstPlacement(tx, input);
  }

  scheduledFirstPlacement(
    employeeId: string,
    onDate: BusinessDate,
    tx?: DbTx,
  ): Promise<{ placementId: string; departmentId: string; validFrom: BusinessDate } | null> {
    return this.repo.scheduledFirstPlacement(employeeId, onDate, tx);
  }

  cancelScheduledFirstPlacement(tx: DbTx, placementId: string): Promise<void> {
    return this.repo.cancelScheduledFirstPlacement(tx, placementId);
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
    return this.repo.restoreFirstPlacement(tx, input);
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

  findMany(employeeIds: string[], tx?: DbTx): Promise<EmployeeRecord[]> {
    return this.repo.findEmployees(employeeIds, tx);
  }

  placementOn(employeeId: string, onDate: BusinessDate, tx?: DbTx): Promise<{ departmentId: string } | null> {
    return this.repo.placementIdsOn(employeeId, onDate, tx);
  }

  lastPlacementBy(employeeId: string, onDate: BusinessDate, tx?: DbTx): Promise<{ departmentId: string } | null> {
    return this.repo.lastPlacementIdsBy(employeeId, onDate, tx);
  }

  findManyByCodes(employeeCodes: readonly string[], tx?: DbTx): Promise<EmployeeRecord[]> {
    return this.repo.findEmployeesByCodes(employeeCodes, tx);
  }

  findManyByNormalizedEmails(normalizedEmails: readonly string[], tx?: DbTx) {
    return this.repo.findEmployeesByNormalizedEmails(normalizedEmails, tx);
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

  updateOfficialFields(tx: DbTx, employeeId: string, patch: OfficialFieldsPatch): Promise<void> {
    return this.repo.updateOfficialFields(tx, employeeId, patch);
  }

  isWorkEmailTaken(tx: DbTx, organizationId: string, normalizedWorkEmail: string): Promise<boolean> {
    return this.repo.workEmailExists(tx, organizationId, normalizedWorkEmail);
  }

  lookupForImport(
    tx: DbTx | undefined,
    names: {
      departmentCodes: string[];
      employeeCodes: string[];
      normalizedEmails: string[];
    },
    today: BusinessDate,
  ): Promise<EmployeeImportLookupData> {
    return this.importLookup.lookup(tx, names, today);
  }

  scheduleStructureChange(tx: DbTx, input: StructureChangeInput): Promise<ScheduledStructureChange> {
    return this.repo.scheduleStructureChange(tx, input);
  }

  cancelStructureChange(
    tx: DbTx,
    change: Pick<ScheduledStructureChange, 'closedPlacementId' | 'openedPlacementId'>,
  ): Promise<void> {
    return this.repo.cancelStructureChange(tx, change);
  }

  placementInForce(tx: DbTx, employeeId: string, onDate: BusinessDate): Promise<PlacementInForce | null> {
    return this.repo.placementInForce(tx, employeeId, onDate);
  }

  placementStart(tx: DbTx, placementId: string): Promise<BusinessDate | null> {
    return this.repo.placementStart(tx, placementId);
  }

  setWorkState(tx: DbTx, employeeId: string, workState: EmployeeWorkState): Promise<void> {
    return this.repo.setWorkState(tx, employeeId, workState);
  }

  scheduleDepartureEnd(
    tx: DbTx,
    employeeId: string,
    endsOn: BusinessDate,
  ): Promise<{ closedPlacementId: string; departmentId: string; validFrom: BusinessDate }> {
    return this.departures.scheduleEnd(tx, employeeId, endsOn);
  }

  cancelDepartureEnd(tx: DbTx, placementId: string): Promise<void> {
    return this.departures.cancelEnd(tx, placementId);
  }

  markLeft(tx: DbTx, employeeId: string): Promise<void> {
    return this.departures.markLeft(tx, employeeId);
  }

  lockForImport(tx: DbTx, departmentIds: string[]): Promise<void> {
    return this.importLookup.lockForImport(tx, departmentIds);
  }
}
