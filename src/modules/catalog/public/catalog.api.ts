import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type {
  CatalogOnboardingFacts,
  PlanRevocationInfo,
  PlanSummary,
  WorkspaceDuty,
  SeatTarget,
  SeatTargetRef,
} from './catalog.types';
import { OnboardingFactsService } from '../subscription/onboarding-facts.service';
import { DocumentService } from '../contract/document.service';
import {
  DocumentAlreadyAttachedError,
  DocumentNotFoundError,
  DocumentNotReadyToAttachError,
  DocumentPurposeMismatchError,
} from '../contract/contract.errors';
import { DocumentAttachRefusedError } from './catalog.errors';
import { ApplicationFactsService } from '../catalog-entry/application-facts.service';
import { PlanFactsService } from '../plan/plan-facts.service';
import { SubscriptionFactsService } from '../subscription/subscription-facts.service';
import { SeatTargetService } from '../subscription/seat-target.service';
import { VendorFactsService } from '../vendor/vendor-facts.service';
import {
  InternalSoftwareRegistrationService,
  type InternalRegistration,
} from '../internal-software-registration/internal-software-registration.service';

/**
 * The catalog facade other modules call (ADR-0013: `licensing → catalog`). It exposes what the assignments of seats
 * need to know about a subscription or an internal plan and nothing of how the catalog keeps it.
 */
@Injectable()
export class CatalogApi {
  constructor(
    private readonly seatTargets: SeatTargetService,
    private readonly onboarding: OnboardingFactsService,
    private readonly plans: PlanFactsService,
    private readonly subscriptions: SubscriptionFactsService,
    private readonly vendors: VendorFactsService,
    private readonly internalRegistration: InternalSoftwareRegistrationService,
    private readonly applicationLookup: ApplicationFactsService,
    private readonly documents: DocumentService,
  ) {}

  /**
   * Attaches an uploaded signed record (`BM-06`) to the person who signed it, in the transaction of the caller: only the IT Admin
   * who uploaded it, only once. Throws DocumentAttachRefusedError for a file that is not the uploader's, of another kind, not
   * uploaded or already attached.
   */
  async attachSignatureRecord(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: { documentId: string; signerEmployeeId: string },
  ): Promise<void> {
    try {
      await this.documents.attachSignatureRecord(tx, actor, input);
    } catch (error) {
      if (error instanceof DocumentNotFoundError) throw new DocumentAttachRefusedError('NOT_FOUND');
      if (error instanceof DocumentAlreadyAttachedError) throw new DocumentAttachRefusedError('ALREADY_ATTACHED');
      if (error instanceof DocumentNotReadyToAttachError) throw new DocumentAttachRefusedError('NOT_READY_TO_ATTACH');
      if (error instanceof DocumentPurposeMismatchError) throw new DocumentAttachRefusedError('PURPOSE_MISMATCH');
      throw error;
    }
  }

  /**
   * The first `limit` applications in use whose Business Owner is this employee, and how many there are (a read, `US-03-01`
   * AC-13): a person who moves to another department or leaves needs someone to take them over (`US-04-06`).
   */
  getApplicationsOwnedBy(employeeId: string, limit: number, tx?: DbTx) {
    return this.applicationLookup.ownedBy(employeeId, limit, tx);
  }

  /**
   * The applications with these ids as a collector's allowlist needs to judge them: name, kind, whether the application is a
   * communication service (never reported, `QĐ-62o`) and whether it is retired. An id that does not exist is absent.
   */
  getCollectorApplications(ids: readonly string[], tx?: DbTx) {
    return this.applicationLookup.collectorApplications(ids, tx);
  }

  /**
   * The workspaces of K2 plans these employees own (the primary owner) or administer (an owner or administrator on the profile), one
   * row for each person and plan, in one read (`US-03-04` AC-28): what a person who leaves must hand over. No secret is held.
   */
  getWorkspaceDutiesOf(employeeIds: readonly string[], tx?: DbTx): Promise<WorkspaceDuty[]> {
    return this.plans.workspaceDutiesOf(employeeIds, tx);
  }

  /** The plans with these ids by name, with their application, as far as they exist. */
  getPlanSummaries(ids: readonly string[]): Promise<PlanSummary[]> {
    return this.onboarding.planSummaries(ids);
  }

  /**
   * What a plan is bought at for a department (unit price and billing cycle), from the newest priced active subscription that
   * department owns; null when it has none. The price of another department's subscription is never used.
   */
  getPlanPrice(planId: string, ownerDepartmentId: string, tx?: DbTx) {
    return this.subscriptions.priceOfPlan(planId, ownerDepartmentId, tx);
  }

  /** The ids of every subscription and purchase a department owns, by id: for a module that finds what belongs to the department through them. */
  getSubscriptionIdsOwnedBy(departmentId: string, tx?: DbTx): Promise<string[]> {
    return this.subscriptions.idsOwnedBy(departmentId, tx);
  }

  /** The vendor of the application of the plan, null for internal software: whose tax profile estimates its price. */
  getPlanVendorId(planId: string, tx?: DbTx): Promise<string | null> {
    return this.plans.vendorIdOf(planId, tx);
  }

  /** The Business Owner of the application of the plan now, or null when the plan does not exist. */
  getPlanBusinessOwnerId(planId: string, tx?: DbTx): Promise<string | null> {
    return this.plans.businessOwnerIdOf(planId, tx);
  }

  /**
   * Registers software the company built itself, with its Business Owner and one plan granted by hand, in the transaction
   * of the caller (`US-05-20`). A Business Owner who has left, or a name already taken, is a `REFUSED` answer.
   */
  registerInternalSoftware(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: { name: string; businessOwnerEmployeeId: string; dataSensitivity: 'LOW' | 'MEDIUM' | 'HIGH' },
  ): Promise<InternalRegistration> {
    return this.internalRegistration.register(tx, actor, input);
  }

  /** The name of the vendor, or null when there is none: for the assessment of software that is not in the catalog. */
  async getVendorName(id: string): Promise<string | null> {
    return this.vendors.nameOf(id);
  }

  /** How the seats of these plans are taken away, in one read: the kind of provisioning, the note and the loss of data on removal. */
  getPlanRevocationInfo(planIds: readonly string[], tx?: DbTx): Promise<PlanRevocationInfo[]> {
    return this.plans.revocationInfos(planIds, tx);
  }

  /** The plans of the other applications in the functional group of the plan's application (at most `limit`, by id). */
  getSimilarPlanIds(planId: string, limit: number, tx?: DbTx): Promise<string[]> {
    return this.plans.similarIds(planId, limit, tx);
  }

  /** How many applications, plans and subscriptions exist, for the onboarding checklist. */
  getOnboardingFacts(): Promise<CatalogOnboardingFacts> {
    return this.onboarding.read();
  }

  /** The seat target without a lock, or null when the subscription or the plan does not exist. */
  findSeatTarget(ref: SeatTargetRef, tx?: DbTx): Promise<SeatTarget | null> {
    return this.seatTargets.find(ref, tx);
  }

  /** The seat targets of many plans in one read, without a lock; a plan that does not exist is absent. */
  findPlanSeatTargets(planIds: readonly string[], tx?: DbTx): Promise<SeatTarget[]> {
    return this.seatTargets.findPlans(planIds, tx);
  }

  /**
   * The seat target, locked until the caller's transaction ends: the subscription `FOR UPDATE`, so writers of its seats
   * queue and a change of its quantity waits; an internal plan `FOR SHARE`. Null when it does not exist.
   */
  lockSeatTarget(tx: DbTx, ref: SeatTargetRef): Promise<SeatTarget | null> {
    return this.seatTargets.lock(tx, ref);
  }
}
