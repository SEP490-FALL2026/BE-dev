import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { fromDateColumn, toDateColumn } from '../../../core/business-date';
import type { PlanRevocationInfo, PlanSummary, WorkspaceDuty } from '../public/catalog.types';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { searchKey } from '../vendor-dictionary/vendor-matcher.policy';
import type {
  NewPlan,
  PlanChanges,
  PlanListFilter,
  PlanLookup,
  PlanRecord,
  PlanSummaryRecord,
  ProvisioningType,
  WorkspaceProfileRecord,
} from './plan.types';

const WITH_APPLICATION = { application: { select: { name: true, kind: true } } } as const;
type PlanRow = Prisma.PlanGetPayload<{ include: typeof WITH_APPLICATION }>;
type ProfileRow = Prisma.PlanWorkspaceProfileGetPayload<{ include: { members: true } }>;

const toPlan = (row: PlanRow): PlanRecord => ({
  id: row.id,
  applicationId: row.applicationId,
  applicationName: row.application.name,
  applicationKind: row.application.kind,
  name: row.name,
  provisioningType: row.provisioningType,
  pricingModel: row.pricingModel,
  controlLevel: row.controlLevel,
  revocationNote: row.revocationNote,
  dataLossOnRemoval: row.dataLossOnRemoval,
  sharingPolicy: row.sharingPolicy,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const toProfile = (row: ProfileRow): WorkspaceProfileRecord => ({
  planId: row.planId,
  primaryOwnerEmployeeId: row.primaryOwnerEmployeeId,
  members: row.members.map((member) => ({ employeeId: member.employeeId, role: member.role })),
  ownerLimit: row.ownerLimit,
  adminLimit: row.adminLimit,
  ownerTransferProcedure: row.ownerTransferProcedure,
  emergencyAccount:
    row.emergencyIdentity === null
      ? null
      : {
          identity: row.emergencyIdentity,
          occupiesSeat: row.emergencyOccupiesSeat as boolean,
          holderEmployeeId: row.emergencyHolderEmployeeId as string,
          lastReviewedOn: fromDateColumn(row.emergencyLastReviewedOn as Date),
        },
  updatedAt: row.updatedAt,
});

/** The one writer of `plans`, `plan_workspace_profiles` and `plan_workspace_admins`: the plan aggregate (US-04-02). */
@Injectable()
export class PlanRepo {
  constructor(private readonly prisma: PrismaService) {}

  async insert(tx: DbTx, input: NewPlan): Promise<PlanRecord> {
    const row = await tx.plan.create({
      data: {
        organizationId: input.organizationId,
        applicationId: input.applicationId,
        name: input.name,
        normalizedName: searchKey(input.name),
        provisioningType: input.provisioningType,
        pricingModel: input.pricingModel,
        controlLevel: input.controlLevel,
        revocationNote: input.revocationNote,
        dataLossOnRemoval: input.dataLossOnRemoval,
        sharingPolicy: input.sharingPolicy,
      },
      include: WITH_APPLICATION,
    });

    return toPlan(row);
  }

  /** The plan, locked for the rest of the transaction, or null. */
  async lock(tx: DbTx, id: string): Promise<PlanRecord | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM plans WHERE id = ${id}::uuid FOR UPDATE`;
    if (locked.length === 0) return null;

    return this.find(id, tx);
  }

  /** The plans of the application, locked `FOR UPDATE` for the rest of the transaction, so a grant that holds one is waited for. */
  async lockOfApplication(tx: DbTx, applicationId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM plans WHERE application_id = ${applicationId}::uuid ORDER BY id FOR UPDATE`;
  }

  /** The plans declared under an application, by name: the plan, its name and its kind of provisioning. */
  async findOfApplication(
    applicationId: string,
    tx?: DbTx,
  ): Promise<{ id: string; name: string; provisioningType: ProvisioningType }[]> {
    const rows = await (tx ?? this.prisma).plan.findMany({
      where: { applicationId },
      select: { id: true, name: true, provisioningType: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });

    return rows;
  }

  async count(): Promise<number> {
    return this.prisma.plan.count();
  }

  async find(id: string, tx?: DbTx): Promise<PlanRecord | null> {
    const row = await (tx ?? this.prisma).plan.findUnique({ where: { id }, include: WITH_APPLICATION });

    return row ? toPlan(row) : null;
  }

  async update(tx: DbTx, id: string, changes: PlanChanges): Promise<PlanRecord> {
    const row = await tx.plan.update({
      where: { id },
      data: {
        ...(changes.name !== undefined ? { name: changes.name, normalizedName: searchKey(changes.name) } : {}),
        ...(changes.provisioningType !== undefined ? { provisioningType: changes.provisioningType } : {}),
        ...(changes.pricingModel !== undefined ? { pricingModel: changes.pricingModel } : {}),
        ...(changes.controlLevel !== undefined ? { controlLevel: changes.controlLevel } : {}),
        ...(changes.revocationNote !== undefined ? { revocationNote: changes.revocationNote } : {}),
        ...(changes.dataLossOnRemoval !== undefined ? { dataLossOnRemoval: changes.dataLossOnRemoval } : {}),
        ...(changes.sharingPolicy !== undefined ? { sharingPolicy: changes.sharingPolicy } : {}),
      },
      include: WITH_APPLICATION,
    });

    return toPlan(row);
  }

  /** An unlocked read of the plan as the capabilities that hang off it need it (subscriptions, terms); null when absent. */
  async findLookup(id: string, tx?: DbTx): Promise<PlanLookup | null> {
    const row = await (tx ?? this.prisma).plan.findUnique({
      where: { id },
      include: {
        application: { select: { name: true, kind: true, catalogStatus: true, businessOwnerEmployeeId: true } },
      },
    });

    return row
      ? {
          id: row.id,
          name: row.name,
          provisioningType: row.provisioningType,
          pricingModel: row.pricingModel,
          sharingPolicy: row.sharingPolicy,
          applicationId: row.applicationId,
          applicationName: row.application.name,
          applicationKind: row.application.kind,
          applicationStatus: row.application.catalogStatus,
          businessOwnerEmployeeId: row.application.businessOwnerEmployeeId,
        }
      : null;
  }

  /** The plans with these ids as `findLookup` answers them, in one read; an id that does not exist is absent. */
  async findLookups(ids: readonly string[], tx?: DbTx): Promise<PlanLookup[]> {
    if (ids.length === 0) return [];
    const rows = await (tx ?? this.prisma).plan.findMany({
      where: { id: { in: [...ids] } },
      include: {
        application: { select: { name: true, kind: true, catalogStatus: true, businessOwnerEmployeeId: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      provisioningType: row.provisioningType,
      pricingModel: row.pricingModel,
      sharingPolicy: row.sharingPolicy,
      applicationId: row.applicationId,
      applicationName: row.application.name,
      applicationKind: row.application.kind,
      applicationStatus: row.application.catalogStatus,
      businessOwnerEmployeeId: row.application.businessOwnerEmployeeId,
    }));
  }

  /** How the seats of these plans are taken away, in one read; a plan that does not exist is absent. */
  async findRevocationInfos(ids: readonly string[], tx?: DbTx): Promise<PlanRevocationInfo[]> {
    if (ids.length === 0) return [];
    const rows = await (tx ?? this.prisma).plan.findMany({
      where: { id: { in: [...ids] } },
      select: {
        id: true,
        name: true,
        applicationId: true,
        provisioningType: true,
        revocationNote: true,
        dataLossOnRemoval: true,
        application: { select: { name: true } },
      },
    });

    return rows.map((row) => ({
      planId: row.id,
      planName: row.name,
      applicationId: row.applicationId,
      applicationName: row.application.name,
      provisioningType: row.provisioningType,
      revocationNote: row.revocationNote,
      dataLossOnRemoval: row.dataLossOnRemoval,
    }));
  }

  /** The plans with these ids, as far as they exist, with the name of their application. */
  async findSummaries(ids: readonly string[]): Promise<PlanSummary[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.plan.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, name: true, applicationId: true, application: { select: { name: true } } },
    });

    return rows.map((row) => ({
      planId: row.id,
      planName: row.name,
      applicationId: row.applicationId,
      applicationName: row.application.name,
    }));
  }

  /**
   * The plans of the other applications in the functional group of this plan's application: what a person may already
   * have that does the same work (`US-05-04` AC-3). Empty when the application is in no group. The first `limit` by id.
   */
  async findSimilarIds(planId: string, limit: number, tx?: DbTx): Promise<string[]> {
    const rows = await (tx ?? this.prisma).$queryRaw<{ id: string }[]>`
      SELECT other.id
        FROM plans own
        JOIN applications own_app ON own_app.id = own.application_id
        JOIN applications other_app
          ON other_app.functional_group_id = own_app.functional_group_id AND other_app.id <> own_app.id
        JOIN plans other ON other.application_id = other_app.id
       WHERE own.id = ${planId}::uuid AND own_app.functional_group_id IS NOT NULL
       ORDER BY other.id
       LIMIT ${limit}`;

    return rows.map((row) => row.id);
  }

  /** The vendor of the application of the plan: null when the application has none (internal software) or the plan does not exist. */
  async findVendorId(planId: string, tx?: DbTx): Promise<string | null> {
    const row = await (tx ?? this.prisma).plan.findUnique({
      where: { id: planId },
      select: { application: { select: { vendorId: true } } },
    });

    return row?.application.vendorId ?? null;
  }

  /** The Business Owner the application of the plan has now; null when the plan does not exist. */
  async findBusinessOwnerId(planId: string, tx?: DbTx): Promise<string | null> {
    const row = await (tx ?? this.prisma).plan.findUnique({
      where: { id: planId },
      select: { application: { select: { businessOwnerEmployeeId: true } } },
    });

    return row?.application.businessOwnerEmployeeId ?? null;
  }

  /** The same, locked `FOR SHARE` for the rest of the transaction so its kind cannot change under the caller. */
  async lockSharedLookup(tx: DbTx, id: string): Promise<PlanLookup | null> {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM plans WHERE id = ${id}::uuid FOR SHARE`;
    if (locked.length === 0) return null;

    return this.findLookup(id, tx);
  }

  /**
   * One page by application name then plan name, and the total for the same filter, from one snapshot. The revocation note
   * (up to 2000 characters a plan) is not selected: the list does not show it (`LD-05`).
   */
  async list(filter: PlanListFilter): Promise<{ items: PlanSummaryRecord[]; total: number }> {
    const where: Prisma.PlanWhereInput = {
      ...(filter.applicationId ? { applicationId: filter.applicationId } : {}),
      ...(filter.provisioningType ? { provisioningType: filter.provisioningType } : {}),
    };

    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.plan.findMany({
          where,
          select: {
            id: true,
            applicationId: true,
            name: true,
            provisioningType: true,
            pricingModel: true,
            controlLevel: true,
            dataLossOnRemoval: true,
            sharingPolicy: true,
            createdAt: true,
            updatedAt: true,
            application: { select: { name: true, kind: true } },
          },
          orderBy: [{ application: { normalizedName: 'asc' } }, { normalizedName: 'asc' }, { id: 'asc' }],
          skip: filter.skip,
          take: filter.take,
        });

        return {
          items: rows.map(({ application, ...row }) => ({
            ...row,
            applicationName: application.name,
            applicationKind: application.kind,
          })),
          total: await tx.plan.count({ where }),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async findProfile(planId: string, tx?: DbTx): Promise<WorkspaceProfileRecord | null> {
    const row = await (tx ?? this.prisma).planWorkspaceProfile.findUnique({
      where: { planId },
      include: { members: true },
    });

    return row ? toProfile(row) : null;
  }

  /** The workspaces these people own or administer, one row for each person and plan, the primary owner first (one read, `US-03-04` AC-28). */
  async findWorkspaceDuties(employeeIds: readonly string[], tx?: DbTx): Promise<WorkspaceDuty[]> {
    if (employeeIds.length === 0) return [];
    const ids = [...employeeIds];
    const profiles = await (tx ?? this.prisma).planWorkspaceProfile.findMany({
      where: { OR: [{ primaryOwnerEmployeeId: { in: ids } }, { members: { some: { employeeId: { in: ids } } } }] },
      select: {
        planId: true,
        primaryOwnerEmployeeId: true,
        emergencyIdentity: true,
        members: { where: { employeeId: { in: ids } }, select: { employeeId: true, role: true } },
        plan: { select: { name: true, application: { select: { name: true } } } },
      },
      orderBy: { planId: 'asc' },
    });

    return profiles.flatMap((profile) => {
      const named = {
        planId: profile.planId,
        planName: profile.plan.name,
        applicationName: profile.plan.application.name,
        emergencyAccountDeclared: profile.emergencyIdentity !== null,
      };
      const owner = ids.includes(profile.primaryOwnerEmployeeId) ? profile.primaryOwnerEmployeeId : null;
      const members = profile.members.filter((member) => member.employeeId !== owner);

      return [
        ...(owner ? [{ ...named, employeeId: owner, role: 'PRIMARY_OWNER' as const }] : []),
        ...members.map((member) => ({ ...named, employeeId: member.employeeId, role: member.role })),
      ];
    });
  }

  /** Writes the whole profile of the plan: the profile row, then its members replaced by the given list. */
  async replaceProfile(tx: DbTx, profile: Omit<WorkspaceProfileRecord, 'updatedAt'>): Promise<WorkspaceProfileRecord> {
    const data = {
      primaryOwnerEmployeeId: profile.primaryOwnerEmployeeId,
      ownerLimit: profile.ownerLimit,
      adminLimit: profile.adminLimit,
      ownerTransferProcedure: profile.ownerTransferProcedure,
      emergencyIdentity: profile.emergencyAccount?.identity ?? null,
      emergencyOccupiesSeat: profile.emergencyAccount?.occupiesSeat ?? null,
      emergencyHolderEmployeeId: profile.emergencyAccount?.holderEmployeeId ?? null,
      emergencyLastReviewedOn: profile.emergencyAccount ? toDateColumn(profile.emergencyAccount.lastReviewedOn) : null,
    };
    await tx.planWorkspaceProfile.upsert({
      where: { planId: profile.planId },
      create: { planId: profile.planId, ...data },
      update: data,
    });
    await tx.planWorkspaceAdmin.deleteMany({ where: { planId: profile.planId } });
    await tx.planWorkspaceAdmin.createMany({
      data: profile.members.map((member) => ({
        planId: profile.planId,
        employeeId: member.employeeId,
        role: member.role,
      })),
    });
    const stored = await this.findProfile(profile.planId, tx);

    return stored as WorkspaceProfileRecord;
  }
}
