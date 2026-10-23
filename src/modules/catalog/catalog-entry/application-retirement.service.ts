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
  RETIREMENT_LIST_LIMIT,
} from './application-retirement.policy';
import { ApplicationRetirementRepo, type RetirementConfirmationRecord } from './application-retirement.repo';
import { ApplicationRepo } from './application.repo';

/** What holds the application: the first of each (`RETIREMENT_LIST_LIMIT`), and the counts of all of them (`LD-06`). */
export interface RetirementBlockers {
  assignments: (RetirementBlockingAssignment & {
    employeeCode: string | null;
    fullName: string | null;
    planName: string;
  })[];
  assignmentTotal: number;
  /** How many assignments hold each plan, so a long list is still readable as a whole. */
  assignmentsByPlan: { planId: string; planName: string; count: number }[];
  subscriptions: (RetirementBlockingSubscription & { planName: string })[];
  subscriptionTotal: number;
}

export interface RetirementView {
  status: 'APPROVED' | 'RETIRED';
  retiredAt: Date | null;
  /** The newest confirmations, at most `RETIREMENT_LIST_LIMIT`; `confirmationTotal` counts them all. */
  confirmations: RetirementConfirmationRecord[];
  confirmationTotal: number;
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
      // The owner must still be working when the confirmation is kept (INV-06): a departure being recorded is waited for.
      // Only the current owner can confirm, so only that employee (who exists) is locked; anyone else is refused below.
      if (input.businessOwnerEmployeeId === application.businessOwnerEmployeeId) {
        await this.organization.lockEmployeeForShare(tx, input.businessOwnerEmployeeId);
      }
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
    const confirmations = await this.retirements.confirmations(applicationId, RETIREMENT_LIST_LIMIT);
    const state = await this.retirements.stateOf(applicationId);
    const blockers = await this.blockersOf(applicationId, today);
    const confirmed = (await this.retirements.latestBy(applicationId, application.businessOwnerEmployeeId)) !== null;

    return {
      status: application.status,
      retiredAt: state?.retiredAt ?? null,
      confirmations: confirmations.items,
      confirmationTotal: confirmations.total,
      confirmed,
      blockers,
      canRetire:
        application.status === 'APPROVED' &&
        confirmed &&
        blockers.assignmentTotal === 0 &&
        blockers.subscriptionTotal === 0,
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
      const confirmation = await this.retirements.latestBy(applicationId, application.businessOwnerEmployeeId, tx);
      const blockers = await this.blockersOf(applicationId, today, tx);

      decideRetirement({
        retired: application.status === 'RETIRED',
        confirmedByCurrentOwner: confirmation !== null,
        assignments: blockers.assignments,
        subscriptions: blockers.subscriptions,
        assignmentTotal: blockers.assignmentTotal,
        subscriptionTotal: blockers.subscriptionTotal,
      });
      if (!confirmation) return;

      await this.applications.markRetired(tx, applicationId, {
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

  private async blockersOf(applicationId: string, today: BusinessDate, tx?: DbTx): Promise<RetirementBlockers> {
    const plans = await this.plans.plansOfApplication(applicationId, tx);
    const planIds = plans.map((plan) => plan.id);
    const planName = new Map(plans.map((plan) => [plan.id, plan.name]));
    const holdings = await this.occupancy.current().openAssignmentsOfPlans(planIds, today, RETIREMENT_LIST_LIMIT, tx);
    const people = new Map(
      (await this.organization.getEmployees([...new Set(holdings.items.map((holding) => holding.employeeId))], tx)).map(
        (employee) => [employee.id, employee],
      ),
    );
    const running = activeTermSubscriptions(await this.subscriptions.termsOfPlans(planIds, tx), today);

    return {
      assignments: holdings.items.map((holding) => ({
        ...holding,
        employeeCode: people.get(holding.employeeId)?.employeeCode ?? null,
        fullName: people.get(holding.employeeId)?.fullName ?? null,
        planName: planName.get(holding.planId) ?? '',
      })),
      assignmentTotal: holdings.total,
      assignmentsByPlan: [...holdings.byPlan]
        .sort((a, b) => b.count - a.count || a.planId.localeCompare(b.planId))
        .slice(0, RETIREMENT_LIST_LIMIT)
        .map((plan) => ({ ...plan, planName: planName.get(plan.planId) ?? '' })),
      subscriptions: running.slice(0, RETIREMENT_LIST_LIMIT).map((subscription) => ({
        subscriptionId: subscription.subscriptionId,
        planId: subscription.planId,
        endDate: subscription.endDate,
        planName: planName.get(subscription.planId) ?? '',
      })),
      subscriptionTotal: running.length,
    };
  }

  private async requireOrganization() {
    const organization = await this.organization.getOrganization();
    if (!organization) throw new Error('An application was retired before installation');

    return organization;
  }
}
