import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import {
  WorkspaceAdminNotItAdminError,
  WorkspaceAdminsTooFewError,
  WorkspaceLimitExceededError,
  WorkspacePrimaryOwnerNotAdminError,
  WorkspaceRequiredError,
  WorkspaceTextInvalidError,
} from '../workspace/workspace.errors';
import { WorkspaceRepo } from '../workspace/workspace.repo';
import { WorkspaceService } from '../workspace/workspace.service';
import { WorkspaceAdminsService } from '../workspace/workspace-admins.service';
import { WorkspaceForSubscriptionService } from '../workspace/workspace-for-subscription.service';
import {
  PlanNotFoundError,
  PlanPrimaryOwnerNotListedError,
  PlanVendorAdminsInvalidError,
  PlanWorkspaceAmbiguousError,
  PlanWorkspaceLimitExceededError,
  PlanWorkspacePersonInvalidError,
  PlanWorkspaceProfileNotApplicableError,
  PlanWorkspaceTextInvalidError,
  PlanWorkspaceVendorRequiredError,
} from './plan.errors';
import { assertWorkspaceShape, cleanWorkspaceText } from './plan.policy';
import { PlanRepo } from './plan.repo';
import { assertVendorAdminsEnough, needsVendorAdmins } from './plan-vendor-admins.policy';
import type { PersonView, WorkspaceProfileRecord, WorkspaceProfileView, WorkspaceRole } from './plan.types';

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
 * The workspace profile of a plan the company administers at the vendor (`QĐ-77d`, `QĐ-110k`, `QĐ-110u`), as the old route records it: a K2
 * plan, or a K4 plan the IT Admin said has an admin console. The profile is the workspace of the vendor of the plan (`QĐ-115c`): the route finds it (the
 * only one of the vendor, or makes one named after the vendor when it has none) and writes through the services of the workspace, the same rules as
 * the routes of the workspace itself. The route, its body and its answer stay as they were; the old table is no longer written.
 */
@Injectable()
export class PlanWorkspaceService {
  constructor(
    private readonly plans: PlanRepo,
    private readonly workspaces: WorkspaceService,
    private readonly workspaceAdmins: WorkspaceAdminsService,
    private readonly forSubscription: WorkspaceForSubscriptionService,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Replaces the profile. Throws PlanNotFoundError, PlanWorkspaceProfileNotApplicableError (a plan that needs no admins at the vendor),
   * PlanWorkspaceVendorRequiredError (its application has no vendor), the shape errors of `assertWorkspaceShape`, PlanVendorAdminsInvalidError,
   * PlanWorkspaceTextInvalidError, PlanWorkspacePersonInvalidError, PlanWorkspaceAmbiguousError (the vendor holds several workspaces) and the refusal
   * of the workspace to anyone who does not answer for it (WorkspaceNotResponsibleError).
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
    const [plan] = await this.plans.findLookups([planId]);
    if (!plan) throw new PlanNotFoundError();
    if (!needsVendorAdmins(plan.provisioningType, plan.hasAdminConsole))
      throw new PlanWorkspaceProfileNotApplicableError();
    const vendorId = plan.applicationVendorId ?? null;
    if (vendorId === null) throw new PlanWorkspaceVendorRequiredError();
    assertWorkspaceShape({
      primaryOwnerEmployeeId: input.primaryOwnerEmployeeId,
      members: input.members,
      ownerLimit,
      adminLimit,
    });
    assertVendorAdminsEnough(input.members.map((member) => member.employeeId));

    const before = await this.plans.findProfile(planId);
    const next = {
      planId,
      primaryOwnerEmployeeId: input.primaryOwnerEmployeeId,
      members: input.members.map((member) => ({ employeeId: member.employeeId, role: member.role })),
      ownerLimit,
      adminLimit,
      ownerTransferProcedure: procedure,
      emergencyAccount: emergency,
      ownerAccountEmail,
      adminNote,
    };
    if (before && sameSnapshot(snapshot(before), snapshot({ ...next, updatedAt: before.updatedAt }))) {
      return this.view(before);
    }

    try {
      await this.writeToWorkspace(actor, vendorId, next, before?.updatedAt);
    } catch (error) {
      throw this.asPlanError(error);
    }

    return this.view((await this.plans.findProfile(planId)) as WorkspaceProfileRecord);
  }

  /**
   * Writes admins and profile fields in one transaction (`T-1`, `W-6`): locks all distinct employees `FOR SHARE` in ascending `id` order
   * (tier 1) before resolving and locking the workspace `FOR UPDATE` (tier 5b), checks limits once against the new profile limits, and rolls back
   * everything together on any failure.
   */
  private async writeToWorkspace(
    actor: AuthenticatedPrincipal,
    vendorId: string,
    profile: Omit<WorkspaceProfileRecord, 'updatedAt'>,
    expectedUpdatedAt?: Date,
  ): Promise<void> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('The workspace profile was used before installation');

    const employeeIds = [
      ...new Set([
        profile.primaryOwnerEmployeeId,
        ...profile.members.map((member) => member.employeeId),
        ...(profile.emergencyAccount ? [profile.emergencyAccount.holderEmployeeId] : []),
      ]),
    ].sort();

    await this.runner.run(async (tx) => {
      await this.workspaces.requireItAdmins(tx, employeeIds);
      const workspaceId = (await this.forSubscription.resolveAndLock(
        tx,
        actor,
        organization.id,
        { vendorId, needsWorkspace: true },
        undefined,
      )) as string;
      const current = await this.workspaceRepo.find(workspaceId, tx);
      if (!current) throw new PlanNotFoundError();
      const withAdmins = await this.workspaceAdmins.setInTx(
        tx,
        actor,
        organization.id,
        workspaceId,
        {
          admins: profile.members,
          primaryOwnerEmployeeId: profile.primaryOwnerEmployeeId,
          expectedUpdatedAt: expectedUpdatedAt ?? current.updatedAt,
        },
        {
          current,
          limits: { ownerLimit: profile.ownerLimit, adminLimit: profile.adminLimit },
          employeesChecked: true,
        },
      );
      await this.workspaces.updateInTx(
        tx,
        actor,
        organization.id,
        workspaceId,
        {
          expectedUpdatedAt: withAdmins.updatedAt,
          ownerLimit: profile.ownerLimit,
          adminLimit: profile.adminLimit,
          ownerTransferProcedure: profile.ownerTransferProcedure,
          emergencyAccount: profile.emergencyAccount,
          ownerAccountEmail: profile.ownerAccountEmail,
          adminNote: profile.adminNote,
        },
        { current: withAdmins, employeeChecked: true },
      );
    });
  }

  /** The error of the workspace as the plan route answers it. */
  private asPlanError(error: unknown): unknown {
    if (error instanceof WorkspaceAdminNotItAdminError) return new PlanWorkspacePersonInvalidError(error.employeeId);
    if (error instanceof WorkspaceTextInvalidError) return new PlanWorkspaceTextInvalidError();
    if (error instanceof WorkspaceLimitExceededError) return new PlanWorkspaceLimitExceededError(error.role);
    if (error instanceof WorkspaceAdminsTooFewError)
      return new PlanVendorAdminsInvalidError(error.given, error.minimum);
    if (error instanceof WorkspacePrimaryOwnerNotAdminError) return new PlanPrimaryOwnerNotListedError();
    if (error instanceof WorkspaceRequiredError) return new PlanWorkspaceAmbiguousError(error.workspaceIds);

    return error;
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
}
