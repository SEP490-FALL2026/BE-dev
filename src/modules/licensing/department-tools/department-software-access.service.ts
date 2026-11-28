import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { ToolsDepartmentNotFoundError, ToolsDepartmentOutOfScopeError } from '../public/licensing.errors';
import {
  DepartmentSoftwareNotInChargeError,
  DepartmentSoftwareProposalNotFoundError,
} from './department-software.errors';
import { mayChangeList, mayReadList } from './department-software.policy';

export interface DepartmentActingDecision {
  bySubstitute: boolean;
}

/**
 * Who reaches the list of software of which department (`QĐ-110s`, SPEC P16 to P18): it gathers the facts the policy judges. Reading is
 * for the people placed in the department, its head, every IT Admin and the Super Admin (and proposals are read in the IT Admin's read
 * scope via `getItAdminScope`). Writing and deciding proposals require an acting IT Admin of the department (`getItAdminActingScope`:
 * the usable IT Admin in charge or an appointed usable substitute — never the common queue).
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
  async assertMayChange(
    actor: AuthenticatedPrincipal,
    departmentId: string,
    tx?: DbTx,
  ): Promise<DepartmentActingDecision> {
    if (!(await this.organizationReads.getDepartmentBrief(departmentId, tx))) throw new ToolsDepartmentNotFoundError();
    const acting = await this.resolveActing(actor, departmentId, tx);
    if (!mayChangeList({ roles: actor.roles, inItAdminScope: acting.allowed })) {
      throw new ToolsDepartmentOutOfScopeError();
    }

    return { bySubstitute: acting.bySubstitute };
  }

  /**
   * Checks whether an IT Admin may decide a software proposal for `departmentId`: outside read scope hides the proposal with 404
   * (`DepartmentSoftwareProposalNotFoundError`); inside read scope but outside acting scope refuses with 403
   * (`DepartmentSoftwareNotInChargeError`).
   */
  async assertMayDecideProposal(
    actor: AuthenticatedPrincipal,
    departmentId: string,
    tx?: DbTx,
  ): Promise<DepartmentActingDecision> {
    const inReadScope = actor.roles.includes('IT_ADMIN') && (await this.itAdminScope(actor, tx)).has(departmentId);
    if (!inReadScope) throw new DepartmentSoftwareProposalNotFoundError();
    const acting = await this.resolveActing(actor, departmentId, tx);
    if (!mayChangeList({ roles: actor.roles, inItAdminScope: acting.allowed })) {
      throw new DepartmentSoftwareNotInChargeError();
    }

    return { bySubstitute: acting.bySubstitute };
  }

  /** The departments an IT Admin may read (named in charge, active substitute, and active departments awaiting an IT Admin). */
  async itAdminScope(actor: AuthenticatedPrincipal, tx?: DbTx): Promise<ReadonlySet<string>> {
    if (!actor.roles.includes('IT_ADMIN')) return new Set();

    return new Set(
      await this.organizationReads.getItAdminScope(
        actor.employeeId,
        (ids) => this.identity.findUsableItAdminEmployeeIds(ids, tx),
        tx,
      ),
    );
  }

  /** The active departments an IT Admin may act on (usable in charge or usable appointed substitute; no common queue). */
  async itAdminActingScope(actor: AuthenticatedPrincipal, tx?: DbTx): Promise<ReadonlySet<string>> {
    if (!actor.roles.includes('IT_ADMIN')) return new Set();

    return new Set(
      await this.organizationReads.getItAdminActingScope(
        actor.employeeId,
        (ids) => this.identity.findUsableItAdminEmployeeIds(ids, tx),
        tx,
      ),
    );
  }

  /** The department the person leads today, or null: the one a proposal of theirs is for (`QĐ-110t`). */
  async headedDepartment(actor: AuthenticatedPrincipal): Promise<string | null> {
    const headed = await this.organizationReads.getHeadedDepartment(actor.employeeId);

    return headed?.departmentId ?? null;
  }

  private async resolveActing(
    actor: AuthenticatedPrincipal,
    departmentId: string,
    tx?: DbTx,
  ): Promise<{ allowed: boolean; bySubstitute: boolean }> {
    if (!actor.roles.includes('IT_ADMIN')) return { allowed: false, bySubstitute: false };
    const actingScope = await this.itAdminActingScope(actor, tx);
    if (!actingScope.has(departmentId)) return { allowed: false, bySubstitute: false };
    const resolved = (
      await this.organizationReads.itAdminsActingFor(
        [departmentId],
        (ids) => this.identity.findUsableItAdminEmployeeIds(ids, tx),
        tx,
      )
    ).get(departmentId);
    const bySubstitute =
      resolved !== undefined && resolved.substitute === actor.employeeId && resolved.inCharge !== actor.employeeId;

    return { allowed: true, bySubstitute };
  }
}
