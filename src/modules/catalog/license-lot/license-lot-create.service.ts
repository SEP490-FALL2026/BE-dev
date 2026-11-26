import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { catalogAuditEvent } from '../catalog-audit-event.mapper';
import { PlanFactsService, type LockedPlan } from '../plan/plan-facts.service';
import { needsVendorAdmins } from '../plan/plan-vendor-admins.policy';
import { SeatBaselinePhaseHook } from '../public/catalog.extension-points';
import type { CreateLicenseLotInput } from '../public/license-lot.types';
import { WorkspaceForSubscriptionService } from '../workspace/workspace-for-subscription.service';
import { assertCreatable, assertLotVendorAdminsRecorded } from './license-lot.policy';
import { LicenseLotRepo } from './license-lot.repo';
import { LicenseLotPriceService } from './license-lot-price.service';
import type { LicenseLotRecord } from './license-lot.types';

/**
 * Makes a lot of licenses of a K4 plan. The IT Admin who makes it answers for it.
 *
 * Lock order: the workspace of the new lot first (tier 5b), then the plan `FOR SHARE` (tier 7); the lot does not exist before it is written, so there is nothing of
 * it to lock. One audit event. The facts other modules own (a lot for a request needs an open grant task of that request) are checked by the module that owns
 * them, before it calls here.
 */
@Injectable()
export class LicenseLotCreateService {
  constructor(
    private readonly lots: LicenseLotRepo,
    private readonly plans: PlanFactsService,
    private readonly workspaces: WorkspaceForSubscriptionService,
    private readonly pricing: LicenseLotPriceService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
    private readonly baselinePhase: SeatBaselinePhaseHook,
  ) {}

  /**
   * Throws LicenseLotPlanNotK4Error, LicenseLotPurposeNotAvailableError, LicenseLotRequestRequiredError, LicenseLotRequestTakenError, LicenseLotMismatchError
   * (contract, workspace), LicenseLotVendorAdminsRequiredError, the errors of the workspace of the vendor (WorkspaceRequiredError, WorkspaceVendorMismatchError,
   * WorkspaceNotFoundError) and of the money.
   */
  async create(
    actor: AuthenticatedPrincipal,
    input: CreateLicenseLotInput,
    existingTx?: DbTx,
  ): Promise<LicenseLotRecord> {
    const unitPrice = await this.pricing.readUnitPrice(input.unitPrice, 'unitPrice');
    const original = input.originalUnitPrice
      ? await this.pricing.readOriginal(input.originalUnitPrice, 'originalUnitPrice')
      : null;
    const organization = await this.organizationReads.getOrganization(existingTx);
    if (!organization) throw new Error('A lot was made before installation');

    const write = async (tx: DbTx): Promise<LicenseLotRecord> => {
      const workspaceId = await this.lockWorkspace(tx, actor, organization.id, input);
      const plan = await this.lockPlan(tx, input);
      await this.assertVendorAdmins(tx, plan, organization.id, workspaceId);
      const created = await this.lots.insert(tx, {
        organizationId: organization.id,
        planId: input.planId,
        workspaceId,
        purchasedOn: input.purchasedOn,
        licenseCount: input.licenseCount,
        unitPriceMinor: unitPrice.amountMinor,
        originalUnitPriceMinor: original?.amountMinor ?? null,
        originalCurrency: original?.currency ?? null,
        purpose: input.purpose,
        requestId: input.requestId ?? null,
        contractId: input.contractId ?? null,
        responsibleItAdminEmployeeId: actor.employeeId,
        note: input.note ?? null,
      });
      await this.recordCreated(tx, actor, organization.id, created);

      return created;
    };

    return existingTx ? write(existingTx) : this.runner.run(write);
  }

  /** The plan is judged as it is read without a lock, to find the vendor and say early; the workspace is locked on that vendor (5b). */
  private async lockWorkspace(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    organizationId: string,
    input: CreateLicenseLotInput,
  ): Promise<string | null> {
    const [unlocked] = await this.plans.lookups([input.planId], tx);
    this.assertFits(unlocked ?? null, input);

    return this.workspaces.resolveAndLock(
      tx,
      actor,
      organizationId,
      {
        vendorId: unlocked?.applicationVendorId ?? null,
        needsWorkspace: needsVendorAdmins(unlocked?.provisioningType ?? 'NONE', unlocked?.hasAdminConsole ?? false),
      },
      input.workspaceId,
    );
  }

  /** The plan held for sharing (7), and judged again as it stands under the lock: a change of its kind waits for this write. */
  private async lockPlan(tx: DbTx, input: CreateLicenseLotInput): Promise<LockedPlan> {
    const plan = await this.plans.lockShared(tx, input.planId);
    this.assertFits(plan, input);

    return plan as LockedPlan;
  }

  /**
   * A K4 plan with an admin console needs at least two working IT Admins recorded on its workspace once the seat baseline is closed (`QĐ-110k`, `QĐ-117e`).
   * While the baseline is open, the gate lets creation through. Throws LicenseLotVendorAdminsRequiredError.
   */
  private async assertVendorAdmins(
    tx: DbTx,
    plan: LockedPlan,
    organizationId: string,
    workspaceId: string | null,
  ): Promise<void> {
    const needs = needsVendorAdmins(plan.provisioningType, plan.hasAdminConsole);
    if (!needs) return;
    // Nobody to say the baseline is still open: take it as closed, so nothing is let through by accident.
    const closed = !this.baselinePhase.isBound() || (await this.baselinePhase.get().isClosed(tx, organizationId));
    if (!closed) return;
    const given = workspaceId === null ? 0 : await this.workspaces.workingAdminCount(tx, workspaceId);
    assertLotVendorAdminsRecorded({ needs, given, planId: plan.id });
  }

  private assertFits(plan: LockedPlan | null, input: CreateLicenseLotInput): void {
    assertCreatable({
      purpose: input.purpose,
      planProvisioningType: plan?.provisioningType ?? 'NONE',
      keyBinding: plan?.keyBinding ?? null,
      requestId: input.requestId,
    });
  }

  private recordCreated(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    organizationId: string,
    created: LicenseLotRecord,
  ): Promise<void> {
    return this.audit.record(
      tx,
      catalogAuditEvent(actor, organizationId, 'LICENSE_LOT.CREATED', 'LicenseLot', created.id, null, {
        planId: created.planId,
        licenseCount: created.licenseCount,
        unitPriceMinor: created.unitPriceMinor.toString(),
        purpose: created.purpose,
        workspaceId: created.workspaceId,
        contractId: created.contractId,
      }),
    );
  }
}
