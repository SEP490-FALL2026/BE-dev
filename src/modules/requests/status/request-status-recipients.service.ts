import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { FactNeed, RequestFacts, StatusFacts } from './request-status.types';

export type RoleHolders = Pick<
  StatusFacts,
  | 'departmentHeadEmployeeId'
  | 'itAdminEmployeeId'
  | 'grantItAdminEmployeeIds'
  | 'financeEmployeeId'
  | 'superAdminEmployeeId'
>;

/**
 * Who holds the roles a notice is addressed to, as they stand today: the head of the department of the request, the IT Admin in
 * charge of the department of the requester, Finance and the Super Admin, each read through the facade of the module that knows
 * them. A role nobody can act in is empty, so nobody is told in its place; and the people a notice would reach who have left are
 * taken out last (`stillWorking`).
 */
@Injectable()
export class RequestStatusRecipientsService {
  constructor(
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
  ) {}

  /** Only the roles the rule asked for are read. */
  async holdersOf(needs: readonly FactNeed[], request: RequestFacts | null, today: BusinessDate): Promise<RoleHolders> {
    const holders: RoleHolders = {
      departmentHeadEmployeeId: null,
      itAdminEmployeeId: null,
      grantItAdminEmployeeIds: [],
      financeEmployeeId: null,
      superAdminEmployeeId: null,
    };
    if (request !== null && needs.includes('DEPARTMENT_HEAD')) {
      const heads = await this.organizationReads.getDepartmentHeads([request.departmentId], today);
      holders.departmentHeadEmployeeId = heads.get(request.departmentId)?.employeeId ?? null;
    }
    if (request !== null && needs.includes('IT_ADMIN')) {
      holders.itAdminEmployeeId =
        (await this.organizationReads.getItAdminInCharge(request.requesterEmployeeId, today))?.itAdminEmployeeId ??
        null;
    }
    holders.grantItAdminEmployeeIds = await this.grantItAdminsOf(needs, request);
    if (needs.includes('FINANCE')) holders.financeEmployeeId = await this.identity.findUsableFinanceEmployeeId();
    if (needs.includes('SUPER_ADMIN'))
      holders.superAdminEmployeeId = await this.identity.findUsableSuperAdminEmployeeId();

    return holders;
  }

  /**
   * Who the grant of a request of this department is told to, as the queue of grants shares it: the IT Admin in charge of the
   * department when their account can act, otherwise every IT Admin whose account can act.
   */
  private async grantItAdminsOf(needs: readonly FactNeed[], request: RequestFacts | null): Promise<string[]> {
    if (request === null || !needs.includes('GRANT_IT_ADMINS')) return [];
    const departmentId = request.departmentId;
    const inCharge = await this.organizationReads.getItAdminInChargeOfDepartment(departmentId);
    if (inCharge !== null && (await this.identity.findUsableItAdminEmployeeIds([inCharge])).has(inCharge)) {
      return [inCharge];
    }

    return this.identity.findAllUsableItAdminEmployeeIds();
  }

  /** Among these employees, those who still work: a person who has left is told nothing. */
  async stillWorking(employeeIds: readonly string[]): Promise<Set<string>> {
    if (employeeIds.length === 0) return new Set();
    const people = await this.organizationReads.getEmployees([...new Set(employeeIds)]);

    return new Set(people.filter((person) => person.status === 'ACTIVE').map((person) => person.id));
  }

  /** The employee behind each account that acted, by account id. */
  actorsOf(appUserIds: readonly string[]): Promise<Map<string, string>> {
    return this.identity.employeeIdsOfAccounts([...new Set(appUserIds)]);
  }

  businessToday(now: Date): Promise<BusinessDate> {
    return this.organizationReads.businessToday(now);
  }
}
