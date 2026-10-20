import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { OrganizationService } from '../../organization/organization.service';
import { catalogAuditEvent } from '../mappers/catalog-audit-event';
import { PlanLookupService } from '../plan/plan-lookup.service';
import { SeatOccupancyRegistry } from '../subscription/seat-occupancy.registry';
import { SubscriptionLookupService } from '../subscription/subscription-lookup.service';
import {
  ApplicationAlreadyRetiredError,
  ApplicationNotFoundError,
  type RetirementBlockingAssignment,
  type RetirementBlockingSubscription,
} from './application.errors';
import {
  activeTermSubscriptions,
  assertConfirmable,
  cleanConfirmationNote,
  decideRetirement,
} from './application-retirement.policy';
import { ApplicationRetirementRepo, type RetirementConfirmationRecord } from './application-retirement.repo';
import { ApplicationRepo } from './application.repo';
import type { ApplicationRecord } from './application.types';

export interface RetirementBlockers {
  assignments: (RetirementBlockingAssignment & {
    employeeCode: string | null;
    fullName: string | null;
    planName: string;
  })[];
  subscriptions: (RetirementBlockingSubscription & { planName: string })[];
}

export interface RetirementView {
  status: 'APPROVED' | 'RETIRED';
  retiredAt: Date | null;
  confirmations: RetirementConfirmationRecord[];
  /** The Business Owner of today has confirmed. */
  confirmed: boolean;
  blockers: RetirementBlockers;
  canRetire: boolean;
}

/**
 * Retiring an application (`US-04-01` AC-8, AC-9, AC-14). The Business Owner of today confirms in writing, kept for good;
 * the application is then retired only if no assignment holds a seat of it and no term subscription of it is still running.
 * A refusal lists what holds it and creates nothing: no revocation, no cancellation. The plans of the application are locked
 * for the decision, so a grant that commits first is seen, and one that comes later finds the application retired.
 */
@Injectable()
export class ApplicationRetirementService {
  constructor(
    private readonly applications: ApplicationRepo,
    private readonly retirements: ApplicationRetirementRepo,
    private readonly plans: PlanLookupService,
    private readonly subscriptions: SubscriptionLookupService,
    private readonly occupancy: SeatOccupancyRegistry,
    private readonly organization: OrganizationService,
    private readonly audit: AuditService,
    private readonly runner: TransactionRunner,
  ) {}

  /**
   * Records what the Business Owner confirmed. Throws ApplicationNotFoundError, ApplicationAlreadyRetiredError,
   * ApplicationRetirementNotBusinessOwnerError and ApplicationRetirementNoteRequiredError.
   */
  async confirm(
    actor: AuthenticatedPrincipal,
    applicationId: string,
    input: { businessOwnerEmployeeId: string; note: string },
  ): Promise<RetirementConfirmationRecord> {
    const note = cleanConfirmationNote(input.note);
    const organization = await this.requireOrganization();

    return this.runner.run(async (tx) => {
      const application = await this.applications.lock(tx, applicationId);
      if (!application) throw new ApplicationNotFoundError();
      if (application.status === 'RETIRED') throw new ApplicationAlreadyRetiredError();
      const owner = await this.organization.getEmployee(input.businessOwnerEmployeeId, tx);
      assertConfirmable({
        currentOwnerEmployeeId: application.businessOwnerEmployeeId,
        businessOwnerEmployeeId: input.businessOwnerEmployeeId,
        ownerStatus: owner?.status ?? null,
      });

      const confirmation = await this.retirements.insertConfirmation(tx, {
        organizationId: organization.id,
        applicationId,
        businessOwnerEmployeeId: input.businessOwnerEmployeeId,
        note,
        recordedByAppUserId: actor.appUserId,
      });
      await this.audit.record(
        tx,
        catalogAuditEvent(
          actor,
          organization.id,
          'APPLICATION.RETIREMENT_CONFIRMED',
          'Application',
          applicationId,
          null,
          {
            confirmationId: confirmation.id,
            businessOwnerEmployeeId: input.businessOwnerEmployeeId,
            note,
          },
        ),
      );

      return confirmation;
    });
  }

  /** What would stop the retirement now, and whether it would go through: read, not decided. Throws ApplicationNotFoundError. */
  async get(applicationId: string): Promise<RetirementView> {
    const application = await this.applications.find(applicationId);
    if (!application) throw new ApplicationNotFoundError();
    const today = await this.organization.businessToday();
    const confirmations = await this.retirements.confirmations(applicationId);
    const state = await this.retirements.stateOf(applicationId);
    const blockers = await this.blockersOf(applicationId, today);
    const confirmed = this.confirmedBy(application, confirmations) !== null;

    return {
      status: application.status,
      retiredAt: state?.retiredAt ?? null,
      confirmations,
      confirmed,
      blockers,
      canRetire:
        application.status === 'APPROVED' &&
        confirmed &&
        blockers.assignments.length === 0 &&
        blockers.subscriptions.length === 0,
    };
  }

  /**
   * Retires the application. Throws ApplicationNotFoundError, ApplicationAlreadyRetiredError,
   * ApplicationRetirementNeedsConfirmationError and ApplicationRetirementBlockedError (with what holds it).
   */
  async retire(actor: AuthenticatedPrincipal, applicationId: string): Promise<void> {
    const organization = await this.requireOrganization();
    const now = new Date();

    await this.runner.run(async (tx) => {
      const application = await this.applications.lock(tx, applicationId);
      if (!application) throw new ApplicationNotFoundError();
      await this.plans.lockPlansOfApplication(tx, applicationId);
      const today = await this.organization.businessToday(now, tx);
      const confirmation = this.confirmedBy(application, await this.retirements.confirmations(applicationId, tx));
      const blockers = await this.blockersOf(applicationId, today, tx);

      decideRetirement({
        retired: application.status === 'RETIRED',
        confirmedByCurrentOwner: confirmation !== null,
        assignments: blockers.assignments,
        subscriptions: blockers.subscriptions,
      });
      if (!confirmation) return;

      await this.retirements.markRetired(tx, applicationId, {
        appUserId: actor.appUserId,
        confirmationId: confirmation.id,
        now,
      });
      await this.audit.record(
        tx,
        catalogAuditEvent(
          actor,
          organization.id,
          'APPLICATION.RETIRED',
          'Application',
          applicationId,
          { status: 'APPROVED' },
          {
            status: 'RETIRED',
            confirmationId: confirmation.id,
            businessOwnerEmployeeId: confirmation.businessOwnerEmployeeId,
            note: confirmation.note,
          },
        ),
      );
    });
  }

  /** The newest confirmation by the Business Owner of today, or null: the confirmation of anyone else does not count. */
  private confirmedBy(
    application: ApplicationRecord,
    confirmations: readonly RetirementConfirmationRecord[],
  ): RetirementConfirmationRecord | null {
    return (
      confirmations.find(
        (confirmation) => confirmation.businessOwnerEmployeeId === application.businessOwnerEmployeeId,
      ) ?? null
    );
  }

  private async blockersOf(applicationId: string, today: BusinessDate, tx?: DbTx): Promise<RetirementBlockers> {
    const plans = await this.plans.plansOfApplication(applicationId);
    const planIds = plans.map((plan) => plan.id);
    const planName = new Map(plans.map((plan) => [plan.id, plan.name]));
    const holdings = await this.occupancy.current().openAssignmentsOfPlans(planIds, today);
    const people = new Map(
      (await this.organization.getEmployees([...new Set(holdings.map((holding) => holding.employeeId))])).map(
        (employee) => [employee.id, employee],
      ),
    );
    const running = activeTermSubscriptions(await this.subscriptions.termsOfPlans(planIds, tx), today);

    return {
      assignments: holdings.map((holding) => ({
        ...holding,
        employeeCode: people.get(holding.employeeId)?.employeeCode ?? null,
        fullName: people.get(holding.employeeId)?.fullName ?? null,
        planName: planName.get(holding.planId) ?? '',
      })),
      subscriptions: running.map((subscription) => ({
        subscriptionId: subscription.subscriptionId,
        planId: subscription.planId,
        endDate: subscription.endDate,
        planName: planName.get(subscription.planId) ?? '',
      })),
    };
  }

  private async requireOrganization() {
    const organization = await this.organization.getOrganization();
    if (!organization) throw new Error('An application was retired before installation');

    return organization;
  }
}
