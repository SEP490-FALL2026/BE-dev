import { Injectable } from '@nestjs/common';
import { TransactionRunner, DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { EmployeeNotFoundError } from '../../organization/public/organization.errors';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { catalogAuditEvent } from '../catalog-audit-event.mapper';
import {
  PlanNotFoundError,
  PlanWorkspacePersonInvalidError,
  PlanWorkspaceProfileNotApplicableError,
  PlanWorkspaceTextInvalidError,
} from './plan.errors';
import { assertWorkspaceShape, cleanWorkspaceText } from './plan.policy';
import { PlanFactsService } from './plan-facts.service';
import { PlanRepo } from './plan.repo';
import { assertVendorAdminsEnough, needsVendorAdmins } from './plan-vendor-admins.policy';
import type {
  PersonView,
  WorkspaceMemberRecord,
  WorkspaceProfileRecord,
  WorkspaceProfileView,
  WorkspaceRole,
} from './plan.types';

export interface WorkspaceProfileInput {
  primaryOwnerEmployeeId: string;
  members: Array<{ employeeId: string; role: WorkspaceRole }>;
  ownerLimit?: number | null;
  adminLimit?: number | null;
  ownerTransferProcedure?: string | null;
  emergencyAccount?: {
    identity: string;
    occupiesSeat: boolean;
    holderEmployeeId: string;
    lastReviewedOn: string;
  } | null;
  ownerAccountEmail?: string | null;
  adminNote?: string | null;
}

const snapshot = (profile: WorkspaceProfileRecord | null) =>
  profile === null
    ? null
    : {
        primaryOwnerEmployeeId: profile.primaryOwnerEmployeeId,
        members: profile.members.map((member) => `${member.employeeId}:${member.role}`).sort(),
        ownerLimit: profile.ownerLimit,
        adminLimit: profile.adminLimit,
        ownerTransferProcedure: profile.ownerTransferProcedure,
        emergencyIdentity: profile.emergencyAccount?.identity ?? null,
        emergencyOccupiesSeat: profile.emergencyAccount?.occupiesSeat ?? null,
        emergencyHolderEmployeeId: profile.emergencyAccount?.holderEmployeeId ?? null,
        emergencyLastReviewedOn: profile.emergencyAccount?.lastReviewedOn ?? null,
        ownerAccountEmail: profile.ownerAccountEmail,
        adminNote: profile.adminNote,
      };

const sameSnapshot = (a: ReturnType<typeof snapshot>, b: ReturnType<typeof snapshot>): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * The workspace profile of a plan the company administers at the vendor (`QĐ-77d`, `QĐ-110k`, `QĐ-110u`): a K2 plan, or a K4 plan the IT Admin
 * said has an admin console. Who owns and administers it, the emergency account, the email of the company account that owns it there and a note,
 * recorded as a whole and replaced as a whole. Every person named must be an employee still working with a usable IT Admin account, and at least
 * two different ones administer the plan; no password or secret is stored or accepted.
 */
@Injectable()
export class PlanWorkspaceService {
  constructor(
    private readonly plans: PlanRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
    private readonly facts: PlanFactsService,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Replaces the profile. Throws PlanNotFoundError, PlanWorkspaceProfileNotApplicableError (a plan that needs no admins at the vendor), the shape
   * errors of `assertWorkspaceShape`, PlanVendorAdminsInvalidError, PlanWorkspaceTextInvalidError and PlanWorkspacePersonInvalidError.
   */
  async set(
    actor: AuthenticatedPrincipal,
    planId: string,
    input: WorkspaceProfileInput,
  ): Promise<WorkspaceProfileView> {
    const ownerLimit = input.ownerLimit ?? null;
    const adminLimit = input.adminLimit ?? null;
    const procedure = cleanWorkspaceText(input.ownerTransferProcedure);
    const emergency = input.emergencyAccount ? this.cleanEmergency(input.emergencyAccount) : null;
    const adminNote = cleanWorkspaceText(input.adminNote);
    const ownerAccountEmail = cleanWorkspaceText(input.ownerAccountEmail);
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('The workspace profile was used before installation');

    const stored = await this.runner.run(async (tx) => {
      const plan = await this.plans.lock(tx, planId);
      if (!plan) throw new PlanNotFoundError();
      if (!needsVendorAdmins(plan.provisioningType, plan.hasAdminConsole))
        throw new PlanWorkspaceProfileNotApplicableError();
      assertWorkspaceShape({
        primaryOwnerEmployeeId: input.primaryOwnerEmployeeId,
        members: input.members,
        ownerLimit,
        adminLimit,
      });
      assertVendorAdminsEnough(input.members.map((member) => member.employeeId));

      await this.requirePeople(tx, input, emergency);

      const before = await this.plans.findProfile(planId, tx);
      const members: WorkspaceMemberRecord[] = input.members.map((member) => ({
        employeeId: member.employeeId,
        role: member.role,
      }));
      const next = {
        planId,
        primaryOwnerEmployeeId: input.primaryOwnerEmployeeId,
        members,
        ownerLimit,
        adminLimit,
        ownerTransferProcedure: procedure,
        emergencyAccount: emergency,
        ownerAccountEmail,
        adminNote,
      };
      if (before && sameSnapshot(snapshot(before), snapshot({ ...next, updatedAt: before.updatedAt }))) return before;

      const after = await this.plans.replaceProfile(tx, next);
      await this.audit.record(
        tx,
        catalogAuditEvent(
          actor,
          organization.id,
          'PLAN.WORKSPACE_PROFILE_SET',
          'Plan',
          planId,
          snapshot(before),
          snapshot(after),
        ),
      );

      return after;
    });

    return this.view(stored);
  }

  /**
   * Every person the profile names (owner, admins, the holder of the emergency account) is an IT Admin who works now, in id order: an account that can
   * act, whose departure has not blocked yet (`workingAdminsAmong`, the judgment of the flags and of the hand-over).
   */
  private async requirePeople(
    tx: DbTx,
    input: WorkspaceProfileInput,
    emergency: { holderEmployeeId: string } | null,
  ): Promise<void> {
    const people = new Set<string>([
      input.primaryOwnerEmployeeId,
      ...input.members.map((member) => member.employeeId),
      ...(emergency ? [emergency.holderEmployeeId] : []),
    ]);
    const ordered = [...people].sort();
    for (const employeeId of ordered) await this.requireItAdmin(tx, employeeId);
    const working = await this.facts.workingAdminsAmong(ordered, tx);
    const gone = ordered.find((employeeId) => !working.has(employeeId));
    if (gone !== undefined) throw new PlanWorkspacePersonInvalidError(gone);
  }

  /** The profile with its people named from the organization. */
  async view(profile: WorkspaceProfileRecord): Promise<WorkspaceProfileView> {
    const ids = new Set<string>([
      profile.primaryOwnerEmployeeId,
      ...profile.members.map((member) => member.employeeId),
      ...(profile.emergencyAccount ? [profile.emergencyAccount.holderEmployeeId] : []),
    ]);
    const employees = await this.organizationReads.getEmployees([...ids]);
    const people = new Map<string, PersonView>(
      employees.map((employee) => [
        employee.id,
        { employeeId: employee.id, employeeCode: employee.employeeCode, fullName: employee.fullName },
      ]),
    );
    const person = (employeeId: string): PersonView => {
      const found = people.get(employeeId);
      if (!found) throw new Error('A person of a workspace profile is not an employee');

      return found;
    };

    return {
      primaryOwner: person(profile.primaryOwnerEmployeeId),
      members: profile.members.map((member) => ({ ...person(member.employeeId), role: member.role })),
      ownerLimit: profile.ownerLimit,
      adminLimit: profile.adminLimit,
      ownerTransferProcedure: profile.ownerTransferProcedure,
      ownerAccountEmail: profile.ownerAccountEmail,
      adminNote: profile.adminNote,
      emergencyAccount: profile.emergencyAccount
        ? {
            identity: profile.emergencyAccount.identity,
            occupiesSeat: profile.emergencyAccount.occupiesSeat,
            holder: person(profile.emergencyAccount.holderEmployeeId),
            lastReviewedOn: profile.emergencyAccount.lastReviewedOn,
          }
        : null,
      updatedAt: profile.updatedAt,
    };
  }

  private cleanEmergency(account: NonNullable<WorkspaceProfileInput['emergencyAccount']>) {
    const identity = cleanWorkspaceText(account.identity);
    if (identity === null) throw new PlanWorkspaceTextInvalidError();

    return { ...account, identity };
  }

  /**
   * The person must be an employee still working with a usable IT Admin account. The employee is locked first and
   * the account second (the lock order of the identity facade), so a departure or a lock cannot slip in.
   */
  private async requireItAdmin(tx: DbTx, employeeId: string): Promise<void> {
    try {
      await this.organizationReads.lockEmployeeForShare(tx, employeeId);
    } catch (error) {
      if (error instanceof EmployeeNotFoundError) throw new PlanWorkspacePersonInvalidError(employeeId);
      throw error;
    }
    const employee = await this.organizationReads.getEmployee(employeeId, tx);
    if (!employee || employee.status !== 'ACTIVE') throw new PlanWorkspacePersonInvalidError(employeeId);
    const account = await this.identity.inspectEmployeeAccount(tx, employeeId);
    if (!account.usable || !account.roles.includes('IT_ADMIN')) throw new PlanWorkspacePersonInvalidError(employeeId);
  }
}
