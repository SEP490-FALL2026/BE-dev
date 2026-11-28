import { DONG } from '../../../core/money/money';
import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { isCheckViolation, isUniqueViolation } from '../../../infrastructure/database/unique-violation';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { FinanceApi } from '../../finance/public/finance.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { ApplicationFactsService } from '../catalog-entry/application-facts.service';
import { catalogAuditEvent } from '../catalog-audit-event.mapper';
import {
  PlanApplicationNotFoundError,
  PlanApplicationRetiredError,
  PlanNameTakenError,
  PlanNotFoundError,
  PlanProvisioningTypeMismatchError,
  PlanReferencePriceNotPositiveError,
  PlanReferencePriceNotVndError,
  PlanChangeBlock,
  PlanInUseBlocksChangeError,
  PlanTermsBlockTypeChangeError,
  PlanUpdateEmptyError,
  PlanWorkspaceProfileBlocksTypeChangeError,
} from './plan.errors';
import {
  assertPlanShape,
  assertPricingModelDerived,
  assertReferenceCommitmentMonths,
  assertReferencePrice,
  assertReferencePriceKind,
  cleanPlanName,
  cleanRevocationNote,
  derivedPricingModel,
  referenceCommitmentOnKindChange,
  referencePriceOnKindChange,
} from './plan.policy';
import { planAuditSnapshot as snapshot } from './plan.mapper';
import { PlanRepo } from './plan.repo';
import { assertAdminConsoleApplicable } from './plan-vendor-admins.policy';
import { assertDeviceBundledShape, keyBindingOf } from './plan-key-binding.policy';
import { PlanWorkspaceService } from './plan-workspace.service';
import type {
  ControlLevel,
  KeyBinding,
  PlanChanges,
  PlanRecord,
  PlanSummaryRecord,
  PricingModel,
  ProvisioningType,
  ReferenceCommitmentMonths,
  ReferencePrice,
  SharingPolicy,
  WorkspaceProfileView,
} from './plan.types';

export interface DeclarePlanInput {
  applicationId: string;
  name: string;
  provisioningType: ProvisioningType;
  /** A K4 plan only: how it is bound once bought. A K4 plan that gives none is bound to an account; any other kind that gives one is refused. */
  keyBinding?: KeyBinding;
  pricingModel?: PricingModel;
  controlLevel?: ControlLevel;
  revocationNote?: string | null;
  dataLossOnRemoval?: boolean;
  sharingPolicy?: SharingPolicy;
  /** A `K4` plan only (`R-53`); any other kind that gives it is refused. */
  hasAdminConsole?: boolean;
  /** The price in dong before tax, as text (`QĐ-113a`): K1/K2 for one seat one month, K4 for one purchase; none for K5. */
  referencePrice?: { amount: string; currency: string };
  referenceCommitmentMonths?: ReferenceCommitmentMonths;
}

export interface UpdatePlanInput {
  name?: string;
  provisioningType?: ProvisioningType;
  keyBinding?: KeyBinding;
  pricingModel?: PricingModel | null;
  controlLevel?: ControlLevel | null;
  revocationNote?: string | null;
  dataLossOnRemoval?: boolean;
  sharingPolicy?: SharingPolicy | null;
  hasAdminConsole?: boolean;
  /** `null` clears the reference price (`QĐ-113a`). */
  referencePrice?: { amount: string; currency: string } | null;
  referenceCommitmentMonths?: ReferenceCommitmentMonths | null;
}

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
    private readonly applications: ApplicationFactsService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly finance: FinanceApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  async list(query: {
    applicationId?: string;
    provisioningType?: ProvisioningType;
    keyBinding?: KeyBinding;
    functionalGroupId?: string;
    status?: 'APPROVED' | 'RETIRED';
    search?: string;
    page: number;
    pageSize: number;
  }): Promise<Page<PlanSummaryRecord>> {
    const { items, total } = await this.plans.list({
      ...(query.applicationId ? { applicationId: query.applicationId } : {}),
      ...(query.provisioningType ? { provisioningType: query.provisioningType } : {}),
      ...(query.keyBinding ? { keyBinding: query.keyBinding } : {}),
      ...(query.functionalGroupId ? { functionalGroupId: query.functionalGroupId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search ? { search: query.search } : {}),
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
  async declare(actor: AuthenticatedPrincipal, input: DeclarePlanInput, outer?: DbTx): Promise<PlanRecord> {
    const name = cleanPlanName(input.name);
    const revocationNote = cleanRevocationNote(input.revocationNote);
    const organizationId = await this.requireOrganizationId();

    const write = async (tx: DbTx): Promise<PlanRecord> => {
      {
        const application = await this.applications.lockShared(tx, input.applicationId);
        if (!application) throw new PlanApplicationNotFoundError();
        if (application.status === 'RETIRED') throw new PlanApplicationRetiredError();
        // The kind is judged before the money is read, so a K5 plan with a price in dollars is not applicable, not a currency error (`QĐ-113a`).
        const referencePrice = input.referencePrice
          ? await this.readReferencePrice(input.provisioningType, input.referencePrice)
          : null;

        const plan = {
          organizationId,
          applicationId: application.id,
          name,
          provisioningType: input.provisioningType,
          keyBinding: keyBindingOf(input.provisioningType, input.keyBinding, null),
          pricingModel: input.pricingModel ?? derivedPricingModel(input.provisioningType),
          controlLevel: input.controlLevel ?? null,
          revocationNote,
          dataLossOnRemoval: input.dataLossOnRemoval ?? false,
          sharingPolicy: input.sharingPolicy ?? null,
          hasAdminConsole: input.hasAdminConsole ?? false,
          referencePrice,
          referenceCommitmentMonths: input.referenceCommitmentMonths ?? null,
        };
        assertPlanShape({ ...plan, applicationKind: application.kind });
        assertPricingModelDerived(input.provisioningType, input.pricingModel);
        assertAdminConsoleApplicable(plan.provisioningType, input.hasAdminConsole);
        assertReferencePrice(plan.provisioningType, referencePrice);
        assertReferenceCommitmentMonths(plan.provisioningType, plan.referenceCommitmentMonths);
        assertDeviceBundledShape(plan.keyBinding, referencePrice, plan.hasAdminConsole);

        const created = await this.plans.insert(tx, plan);
        await this.audit.record(
          tx,
          catalogAuditEvent(actor, organizationId, 'PLAN.CREATED', 'Plan', created.id, null, snapshot(created)),
        );

        return created;
      }
    };

    try {
      return await (outer ? write(outer) : this.runner.run(write));
    } catch (error) {
      throw await this.mapWriteError(error, { applicationId: input.applicationId, name });
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
        const sentPrice = input.referencePrice
          ? await this.readReferencePrice(input.provisioningType ?? current.provisioningType, input.referencePrice)
          : input.referencePrice;

        const next = {
          name: name ?? current.name,
          provisioningType: input.provisioningType ?? current.provisioningType,
          keyBinding: keyBindingOf(input.provisioningType ?? current.provisioningType, input.keyBinding, current),
          pricingModel: this.pricingModelOf(current, input),
          controlLevel: input.controlLevel === undefined ? current.controlLevel : input.controlLevel,
          revocationNote: revocationNote === undefined ? current.revocationNote : revocationNote,
          dataLossOnRemoval: input.dataLossOnRemoval ?? current.dataLossOnRemoval,
          sharingPolicy: input.sharingPolicy === undefined ? current.sharingPolicy : input.sharingPolicy,
          // The flag belongs to a K4 plan: a plan that stops being one loses it (the row says so too), and one that is not K4 cannot be given it.
          hasAdminConsole:
            input.hasAdminConsole ??
            ((input.provisioningType ?? current.provisioningType) === 'K4' ? current.hasAdminConsole : false),
          referencePrice: this.referencePriceOf(current, input.provisioningType ?? current.provisioningType, sentPrice),
          referenceCommitmentMonths: this.referenceCommitmentOf(
            current,
            input.provisioningType ?? current.provisioningType,
            input.referenceCommitmentMonths,
          ),
        };
        assertPlanShape({ ...next, applicationKind: current.applicationKind });
        assertPricingModelDerived(next.provisioningType, input.pricingModel);
        assertAdminConsoleApplicable(next.provisioningType, input.hasAdminConsole);
        assertReferencePrice(next.provisioningType, next.referencePrice);
        assertReferenceCommitmentMonths(next.provisioningType, next.referenceCommitmentMonths);
        assertDeviceBundledShape(next.keyBinding, next.referencePrice, next.hasAdminConsole);
        if (
          next.provisioningType !== current.provisioningType &&
          next.provisioningType !== 'K2' &&
          next.provisioningType !== 'K4' &&
          (await this.plans.findProfile(id, tx))
        ) {
          throw new PlanWorkspaceProfileBlocksTypeChangeError();
        }

        const changes = changesOf(current, next);
        if (Object.keys(changes).length === 0) return current;

        const updated = await this.plans.update(tx, id, changes);
        await this.audit.record(
          tx,
          catalogAuditEvent(actor, organizationId, 'PLAN.UPDATED', 'Plan', id, snapshot(current), snapshot(updated)),
        );

        return updated;
      });
    } catch (error) {
      throw await this.mapWriteError(error, { planId: id, name });
    }
  }

  /**
   * The reference price after an update (`QĐ-113a`): the one sent (`null` clears it); else the one the plan has, cleared when the kind moves to K5 or
   * between a per-seat kind and K4 (the IT Admin enters it again; the audit of the change keeps the one cleared).
   */
  private referencePriceOf(
    current: PlanRecord,
    nextType: ProvisioningType,
    sent: ReferencePrice | null | undefined,
  ): ReferencePrice | null {
    if (sent !== undefined) return sent;

    return referencePriceOnKindChange(current.provisioningType, nextType) === 'CLEAR' ? null : current.referencePrice;
  }

  private referenceCommitmentOf(
    current: PlanRecord,
    nextType: ProvisioningType,
    sent: ReferenceCommitmentMonths | null | undefined,
  ): ReferenceCommitmentMonths | null {
    if (sent !== undefined) return sent;

    return referenceCommitmentOnKindChange(current.provisioningType, nextType) === 'CLEAR'
      ? null
      : current.referenceCommitmentMonths;
  }

  /**
   * The reference price as money in dong, above zero (`QĐ-113a`: a price of 0 is no price, as a request counts it): the kind is judged first, then the
   * currency before the amount is read (`SUBSCRIPTION.PRICE_NOT_VND`'s counterpart for a plan).
   */
  private async readReferencePrice(
    type: ProvisioningType,
    price: { amount: string; currency: string },
  ): Promise<ReferencePrice> {
    assertReferencePriceKind(type);
    if (price.currency !== DONG) throw new PlanReferencePriceNotVndError(price.currency);
    const money = await this.finance.parseMoney(price, 'referencePrice');
    if (money.amountMinor <= 0n) throw new PlanReferencePriceNotPositiveError();

    return money;
  }

  /** The pricing model after an update: the one named, else the one the plan has, else (the kind changed) the one the new kind implies (`B-5`). */
  private pricingModelOf(current: PlanRecord, input: UpdatePlanInput): PricingModel | null {
    if (input.pricingModel !== undefined) return input.pricingModel;
    if (input.provisioningType === undefined || input.provisioningType === current.provisioningType) {
      return current.pricingModel;
    }

    return derivedPricingModel(input.provisioningType);
  }

  /** What the database refused, as a rule of the catalog; a name already taken carries the plan that has it. */
  private async mapWriteError(
    error: unknown,
    context: { applicationId?: string; planId?: string; name?: string },
  ): Promise<unknown> {
    if (isUniqueViolation(error, 'normalized_name')) return new PlanNameTakenError(await this.planNamed(context));
    if (isCheckViolation(error, 'keeps a numeric install limit')) return new PlanTermsBlockTypeChangeError();
    const blocked = changeBlockOf(error);
    if (blocked) return new PlanInUseBlocksChangeError(blocked);
    if (isCheckViolation(error)) return new PlanProvisioningTypeMismatchError();

    return error;
  }

  /** The plan that holds the name a write wanted, read after the write failed; null when it cannot be found. */
  private async planNamed(context: { applicationId?: string; planId?: string; name?: string }) {
    if (context.name === undefined) return null;
    const applicationId =
      context.applicationId ?? (context.planId ? (await this.plans.find(context.planId))?.applicationId : undefined);

    return applicationId ? this.plans.findByName(applicationId, context.name) : null;
  }

  private async requireOrganizationId(): Promise<string> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('The plans were used before installation');

    return organization.id;
  }
}

const CHANGE_BLOCKS: readonly PlanChangeBlock[] = [
  'ACTIVE_SUBSCRIPTION_WITHOUT_QUANTITY',
  'LICENSE_KEYS',
  'LICENSE_LOTS',
  'PERPETUAL_SUBSCRIPTIONS',
  'TERM_SUBSCRIPTIONS',
  'CONTRACT_LINKS',
  'KEY_BINDING_PURCHASES',
  'KEY_BINDING_ASSIGNMENTS',
  'DEVICE_ACTIVATIONS',
  'SUBSCRIPTIONS',
];

/** The reason the plan trigger gave (`plan_change_blocked: REASON`), or null for any other refusal. */
function changeBlockOf(error: unknown): PlanChangeBlock | null {
  if (!isCheckViolation(error, 'plan_change_blocked:')) return null;
  const haystack = JSON.stringify((error as { meta?: unknown }).meta ?? {});

  return CHANGE_BLOCKS.find((reason) => haystack.includes(`plan_change_blocked: ${reason}`)) ?? null;
}

const samePrice = (a: ReferencePrice | null, b: ReferencePrice | null): boolean =>
  a === null || b === null ? a === b : a.amountMinor === b.amountMinor && a.currency === b.currency;

/** What a plan becomes after an update, every field given. */
type PlanState = Required<PlanChanges>;

/** The fields an update changes, each as the plan will have it; none when nothing differs. */
function changesOf(current: PlanRecord, next: PlanState): PlanChanges {
  const changes: PlanChanges = {};
  if (next.name !== current.name) changes.name = next.name;
  if (next.provisioningType !== current.provisioningType) changes.provisioningType = next.provisioningType;
  if (next.keyBinding !== current.keyBinding) changes.keyBinding = next.keyBinding;
  if (next.pricingModel !== current.pricingModel) changes.pricingModel = next.pricingModel;
  if (next.controlLevel !== current.controlLevel) changes.controlLevel = next.controlLevel;
  if (next.revocationNote !== current.revocationNote) changes.revocationNote = next.revocationNote;
  if (next.dataLossOnRemoval !== current.dataLossOnRemoval) changes.dataLossOnRemoval = next.dataLossOnRemoval;
  if (next.sharingPolicy !== current.sharingPolicy) changes.sharingPolicy = next.sharingPolicy;
  if (next.hasAdminConsole !== current.hasAdminConsole) changes.hasAdminConsole = next.hasAdminConsole;
  if (!samePrice(next.referencePrice, current.referencePrice)) changes.referencePrice = next.referencePrice;
  if (next.referenceCommitmentMonths !== current.referenceCommitmentMonths) {
    changes.referenceCommitmentMonths = next.referenceCommitmentMonths;
  }

  return changes;
}
