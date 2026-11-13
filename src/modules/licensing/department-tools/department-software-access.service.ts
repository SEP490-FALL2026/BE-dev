import { Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { ToolsDepartmentNotFoundError, ToolsDepartmentOutOfScopeError } from '../public/licensing.errors';
import { mayChangeList, mayReadList } from './department-software.policy';

/**
 * Who reaches the list of software of which department (`QĐ-110s`, SPEC P16 to P18): it gathers the facts the policy judges. Reading is
 * for the people placed in the department, its head, every IT Admin and the Super Admin; writing and deciding are for an IT Admin in
 * charge, which is the scope of `US-01-11` (the departments that name them and, while nobody who can act is named, every active one).
 */
@Injectable()
export class DepartmentSoftwareAccessService {
  constructor(
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
  ) {}

  /** Throws ToolsDepartmentNotFoundError and ToolsDepartmentOutOfScopeError. */
  async assertMayRead(actor: AuthenticatedPrincipal, departmentId: string): Promise<void> {
    if (!(await this.organizationReads.getDepartmentBrief(departmentId))) throw new ToolsDepartmentNotFoundError();
    const sees = actor.roles.includes('IT_ADMIN') || actor.roles.includes('SUPER_ADMIN');
    const today = await this.organizationReads.businessToday();
    const isHead =
      !sees &&
      (await this.organizationReads.getHeadedDepartment(actor.employeeId, today))?.departmentId === departmentId;
    const isMember =
      !sees &&
      !isHead &&
      ((await this.organizationReads.getDepartmentMemberIds(departmentId, today)) ?? []).includes(actor.employeeId);
    if (!mayReadList({ roles: actor.roles, isMember, isHead })) throw new ToolsDepartmentOutOfScopeError();
  }

  /** Throws ToolsDepartmentNotFoundError and ToolsDepartmentOutOfScopeError. */
  async assertMayChange(actor: AuthenticatedPrincipal, departmentId: string): Promise<void> {
    if (!(await this.organizationReads.getDepartmentBrief(departmentId))) throw new ToolsDepartmentNotFoundError();
    const inItAdminScope = (await this.itAdminScope(actor)).has(departmentId);
    if (!mayChangeList({ roles: actor.roles, inItAdminScope })) throw new ToolsDepartmentOutOfScopeError();
  }

  /** The departments an IT Admin is in charge of in the sense of `US-01-11`; empty for anybody who is not an IT Admin. */
  async itAdminScope(actor: AuthenticatedPrincipal): Promise<ReadonlySet<string>> {
    if (!actor.roles.includes('IT_ADMIN')) return new Set();

    return new Set(
      await this.organizationReads.getItAdminScope(actor.employeeId, (ids) =>
        this.identity.findUsableItAdminEmployeeIds(ids),
      ),
    );
  }

  /** The department the person leads today, or null: the one a proposal of theirs is for (`QĐ-110t`). */
  async headedDepartment(actor: AuthenticatedPrincipal): Promise<string | null> {
    const headed = await this.organizationReads.getHeadedDepartment(actor.employeeId);

    return headed?.departmentId ?? null;
  }
}
