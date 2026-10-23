import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { isCheckViolation, isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { OrganizationService } from '../../organization/organization.service';
import { ApplicationLookupService } from '../catalog-entry/application-lookup.service';
import { catalogAuditEvent } from '../mappers/catalog-audit-event';
import {
  PlanApplicationNotFoundError,
  PlanApplicationRetiredError,
  PlanNameTakenError,
  PlanNotFoundError,
  PlanProvisioningTypeMismatchError,
  PlanChangeBlock,
  PlanInUseBlocksChangeError,
  PlanTermsBlockTypeChangeError,
  PlanUpdateEmptyError,
  PlanWorkspaceProfileBlocksTypeChangeError,
} from './plan.errors';
import { assertPlanShape, cleanPlanName, cleanRevocationNote } from './plan.policy';
import { PlanRepo } from './plan.repo';
import { PlanWorkspaceService } from './plan-workspace.service';
import type {
  ControlLevel,
  PlanChanges,
  PlanRecord,
  PlanSummaryRecord,
  PricingModel,
  ProvisioningType,
  SharingPolicy,
  WorkspaceProfileView,
} from './plan.types';

export interface DeclarePlanInput {
  applicationId: string;
  name: string;
  provisioningType: ProvisioningType;
  pricingModel?: PricingModel;
  controlLevel?: ControlLevel;
  revocationNote?: string | null;
  dataLossOnRemoval?: boolean;
  sharingPolicy?: SharingPolicy;
}

export interface UpdatePlanInput {
  name?: string;
  provisioningType?: ProvisioningType;
  pricingModel?: PricingModel | null;
  controlLevel?: ControlLevel | null;
  revocationNote?: string | null;
  dataLossOnRemoval?: boolean;
  sharingPolicy?: SharingPolicy | null;
}

const snapshot = (plan: PlanRecord) => ({
  applicationId: plan.applicationId,
  name: plan.name,
  provisioningType: plan.provisioningType,
  pricingModel: plan.pricingModel,
  controlLevel: plan.controlLevel,
  revocationNote: plan.revocationNote,
  dataLossOnRemoval: plan.dataLossOnRemoval,
  sharingPolicy: plan.sharingPolicy,
});

/**
 * The plans of an application the IT Admin declares (`US-04-02`). Declaring or changing a plan is one transaction: the
 * application is locked `FOR SHARE` (so it cannot be retired meanwhile), the shape rules are checked against its kind,
 * the plan is written and audited. A unique violation aborts the transaction, so it is caught outside it.
 */
@Injectable()
export class PlanService {
  constructor(
    private readonly plans: PlanRepo,
    private readonly workspace: PlanWorkspaceService,
    private readonly applications: ApplicationLookupService,
    private readonly organization: OrganizationService,
    private readonly audit: AuditService,
    private readonly runner: TransactionRunner,
  ) {}

  async list(query: {
    applicationId?: string;
    provisioningType?: ProvisioningType;
    page: number;
    pageSize: number;
  }): Promise<Page<PlanSummaryRecord>> {
    const { items, total } = await this.plans.list({
      ...(query.applicationId ? { applicationId: query.applicationId } : {}),
      ...(query.provisioningType ? { provisioningType: query.provisioningType } : {}),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return pageOf(items, total, query.page, query.pageSize);
  }

  /** Throws PlanNotFoundError. */
  async get(id: string): Promise<{ plan: PlanRecord; workspaceProfile: WorkspaceProfileView | null }> {
    const plan = await this.plans.find(id);
    if (!plan) throw new PlanNotFoundError();
    const profile = await this.plans.findProfile(id);

    return { plan, workspaceProfile: profile ? await this.workspace.view(profile) : null };
  }

  /**
   * Declares a plan. Throws PlanApplicationNotFoundError, PlanApplicationRetiredError, the name and note errors, the
   * shape errors of `assertPlanShape` and PlanNameTakenError.
   */
  async declare(actor: AuthenticatedPrincipal, input: DeclarePlanInput): Promise<PlanRecord> {
    const name = cleanPlanName(input.name);
    const revocationNote = cleanRevocationNote(input.revocationNote);
    const organizationId = await this.requireOrganizationId();

    try {
      return await this.runner.run(async (tx) => {
        const application = await this.applications.lockShared(tx, input.applicationId);
        if (!application) throw new PlanApplicationNotFoundError();
        if (application.status === 'RETIRED') throw new PlanApplicationRetiredError();

        const plan = {
          organizationId,
          applicationId: application.id,
          name,
          provisioningType: input.provisioningType,
          pricingModel: input.pricingModel ?? null,
          controlLevel: input.controlLevel ?? null,
          revocationNote,
          dataLossOnRemoval: input.dataLossOnRemoval ?? false,
          sharingPolicy: input.sharingPolicy ?? null,
        };
        assertPlanShape({ ...plan, applicationKind: application.kind });

        const created = await this.plans.insert(tx, plan);
        await this.audit.record(
          tx,
          catalogAuditEvent(actor, organizationId, 'PLAN.CREATED', 'Plan', created.id, null, snapshot(created)),
        );

        return created;
      });
    } catch (error) {
      throw this.mapWriteError(error);
    }
  }

  /**
   * Changes a plan. Throws PlanNotFoundError, PlanUpdateEmptyError, the errors of `declare`, and
   * PlanWorkspaceProfileBlocksTypeChangeError. A change that changes nothing is a no-op.
   */
  async update(actor: AuthenticatedPrincipal, id: string, input: UpdatePlanInput): Promise<PlanRecord> {
    if (Object.values(input).every((value) => value === undefined)) throw new PlanUpdateEmptyError();
    const name = input.name === undefined ? undefined : cleanPlanName(input.name);
    const revocationNote = input.revocationNote === undefined ? undefined : cleanRevocationNote(input.revocationNote);
    const organizationId = await this.requireOrganizationId();

    try {
      return await this.runner.run(async (tx) => {
        const current = await this.plans.lock(tx, id);
        if (!current) throw new PlanNotFoundError();

        const next = {
          name: name ?? current.name,
          provisioningType: input.provisioningType ?? current.provisioningType,
          pricingModel: input.pricingModel === undefined ? current.pricingModel : input.pricingModel,
          controlLevel: input.controlLevel === undefined ? current.controlLevel : input.controlLevel,
          revocationNote: revocationNote === undefined ? current.revocationNote : revocationNote,
          dataLossOnRemoval: input.dataLossOnRemoval ?? current.dataLossOnRemoval,
          sharingPolicy: input.sharingPolicy === undefined ? current.sharingPolicy : input.sharingPolicy,
        };
        assertPlanShape({ ...next, applicationKind: current.applicationKind });
        if (
          next.provisioningType !== current.provisioningType &&
          next.provisioningType !== 'K2' &&
          (await this.plans.findProfile(id, tx))
        ) {
          throw new PlanWorkspaceProfileBlocksTypeChangeError();
        }

        const changes: PlanChanges = {};
        if (next.name !== current.name) changes.name = next.name;
        if (next.provisioningType !== current.provisioningType) changes.provisioningType = next.provisioningType;
        if (next.pricingModel !== current.pricingModel) changes.pricingModel = next.pricingModel;
        if (next.controlLevel !== current.controlLevel) changes.controlLevel = next.controlLevel;
        if (next.revocationNote !== current.revocationNote) changes.revocationNote = next.revocationNote;
        if (next.dataLossOnRemoval !== current.dataLossOnRemoval) changes.dataLossOnRemoval = next.dataLossOnRemoval;
        if (next.sharingPolicy !== current.sharingPolicy) changes.sharingPolicy = next.sharingPolicy;
        if (Object.keys(changes).length === 0) return current;

        const updated = await this.plans.update(tx, id, changes);
        await this.audit.record(
          tx,
          catalogAuditEvent(actor, organizationId, 'PLAN.UPDATED', 'Plan', id, snapshot(current), snapshot(updated)),
        );

        return updated;
      });
    } catch (error) {
      throw this.mapWriteError(error);
    }
  }

  private mapWriteError(error: unknown): unknown {
    if (isUniqueViolation(error, 'normalized_name')) return new PlanNameTakenError();
    if (isCheckViolation(error, 'keeps a numeric install limit')) return new PlanTermsBlockTypeChangeError();
    const blocked = changeBlockOf(error);
    if (blocked) return new PlanInUseBlocksChangeError(blocked);
    if (isCheckViolation(error)) return new PlanProvisioningTypeMismatchError();

    return error;
  }

  private async requireOrganizationId(): Promise<string> {
    const organization = await this.organization.getOrganization();
    if (!organization) throw new Error('The plans were used before installation');

    return organization.id;
  }
}

const CHANGE_BLOCKS: readonly PlanChangeBlock[] = [
  'ACTIVE_SUBSCRIPTION_WITHOUT_QUANTITY',
  'LICENSE_KEYS',
  'SUBSCRIPTIONS',
];

/** The reason the plan trigger gave (`plan_change_blocked: REASON`), or null for any other refusal. */
function changeBlockOf(error: unknown): PlanChangeBlock | null {
  if (!isCheckViolation(error, 'plan_change_blocked:')) return null;
  const haystack = JSON.stringify((error as { meta?: unknown }).meta ?? {});

  return CHANGE_BLOCKS.find((reason) => haystack.includes(`plan_change_blocked: ${reason}`)) ?? null;
}
