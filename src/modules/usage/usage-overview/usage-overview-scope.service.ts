import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { DevicesApi } from '../../devices/public/devices.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';

/** A person of the scope of an IT Admin, and the department they are read under. */
export interface ScopedPerson {
  employeeId: string;
  departmentId: string;
}

/** One person asked for by id, and whether their usage is the IT Admin's to read. */
export interface ScopedEmployee extends ScopedPerson {
  employeeCode: string;
}

/**
 * Whose usage an IT Admin reads (`QĐ-111ax`, R-20, D8): the people of the departments that name them and, while a department has no usable IT
 * Admin, of that one too (`getItAdminScope`) — never a department the caller sends. A filter outside that reach finds nobody, an id outside
 * it finds nothing (the caller answers 404): a department or a person outside the scope is not told apart from one that does not exist.
 * Writing keeps `IT Admin khác xử lý thay`; only reading usage is bound here.
 */
@Injectable()
export class UsageOverviewScopeService {
  constructor(
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
    private readonly devices: DevicesApi,
  ) {}

  /** The departments the IT Admin reads. */
  scopeOf(actor: AuthenticatedPrincipal): Promise<string[]> {
    return this.organizationReads.getItAdminScope(actor.employeeId, (ids) =>
      this.identity.findUsableItAdminEmployeeIds(ids),
    );
  }

  /**
   * The people a list reads: those placed today in the department asked for, or in any department of the scope when none is asked for, or
   * the one person asked for. A department or a person outside the scope gives nobody (a filter outside the scope is an empty answer, D8).
   */
  async peopleOf(
    actor: AuthenticatedPrincipal,
    filter: { departmentId?: string | undefined; employeeId?: string | undefined },
    today: BusinessDate,
  ): Promise<ScopedPerson[]> {
    const scope = await this.scopeOf(actor);
    if (filter.departmentId !== undefined && !scope.includes(filter.departmentId)) return [];
    const departmentIds = filter.departmentId === undefined ? scope : [filter.departmentId];
    if (departmentIds.length === 0) return [];
    if (filter.employeeId !== undefined) {
      const one = await this.employeeIn(filter.employeeId, departmentIds, today);

      return one ? [{ employeeId: one.employeeId, departmentId: one.departmentId }] : [];
    }
    const memberIds = await this.organizationReads.getMemberIdsOfDepartments(departmentIds, today);
    const units = await this.organizationReads.getOwningUnits(memberIds, today);

    return memberIds.flatMap((employeeId) => {
      const unit = units.get(employeeId);

      return unit && departmentIds.includes(unit.departmentId) ? [{ employeeId, departmentId: unit.departmentId }] : [];
    });
  }

  /** The person asked for by id when their department (the last one they were placed in, if they left) is in the scope; null otherwise. */
  async employeeInScope(
    actor: AuthenticatedPrincipal,
    employeeId: string,
    today: BusinessDate,
  ): Promise<ScopedEmployee | null> {
    return this.employeeIn(employeeId, await this.scopeOf(actor), today);
  }

  /**
   * The registrations of a machine, ended ones too, held by a person the IT Admin reads: the days a collector counted on a machine are the usage
   * of whoever held it that day, so a machine that changed hands shows each IT Admin only the registrations of the people of their departments.
   * Empty when none is (the caller answers an empty page, D8).
   */
  async registrationIdsOfDevice(actor: AuthenticatedPrincipal, deviceId: string): Promise<string[]> {
    const registrations = await this.devices.registrationsOfDevice(deviceId);
    if (registrations.length === 0) return [];
    const today = await this.organizationReads.businessToday();
    const inScope = new Map<string, boolean>();
    for (const { holderEmployeeId } of registrations) {
      if (!inScope.has(holderEmployeeId)) {
        inScope.set(holderEmployeeId, (await this.employeeInScope(actor, holderEmployeeId, today)) !== null);
      }
    }

    return registrations.filter(({ holderEmployeeId }) => inScope.get(holderEmployeeId)).map(({ id }) => id);
  }

  private async employeeIn(
    employeeId: string,
    departmentIds: readonly string[],
    today: BusinessDate,
  ): Promise<ScopedEmployee | null> {
    if (departmentIds.length === 0) return null;
    const placement = await this.organizationReads.getLastPlacement(employeeId, today);
    if (!placement || !departmentIds.includes(placement.departmentId)) return null;
    const employee = await this.organizationReads.getEmployee(employeeId);

    return employee ? { employeeId, departmentId: placement.departmentId, employeeCode: employee.employeeCode } : null;
  }
}
