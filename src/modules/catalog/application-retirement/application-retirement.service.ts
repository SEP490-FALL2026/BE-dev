import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { catalogAuditEvent } from '../catalog-audit-event.mapper';
import { PlanFactsService } from '../plan/plan-facts.service';
import { SeatOccupancyHook } from '../public/catalog.extension-points';
import { SubscriptionFactsService } from '../subscription/subscription-facts.service';
import {
  ApplicationNotFoundError,
  type RetirementBlockingAssignment,
  type RetirementBlockingSubscription,
} from '../catalog-entry/application.errors';
import { activeTermSubscriptions, decideRetirement, RETIREMENT_LIST_LIMIT } from './application-retirement.policy';
import { ApplicationRetirementRepo } from './application-retirement.repo';
import { ApplicationRepo } from '../catalog-entry/application.repo';

/** What holds the application: the first of each (`RETIREMENT_LIST_LIMIT`), and the counts of all of them. */
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
  blockers: RetirementBlockers;
  canRetire: boolean;
}

/**
 * Retiring an application (`US-04-01` AC-9, AC-14, `QĐ-111g`). The IT Admin decides, nobody confirms: the application is retired only if no
 * assignment holds a seat of it and no term subscription of it is still running. A refusal lists what holds it and creates nothing: no
 * revocation, no cancellation. The plans of the application are locked for the decision, so a grant that commits first is seen, and one
 * that comes later finds the application retired.
 */
@Injectable()
export class ApplicationRetirementService {
  constructor(
    private readonly applications: ApplicationRepo,
    private readonly retirements: ApplicationRetirementRepo,
    private readonly plans: PlanFactsService,
    private readonly subscriptions: SubscriptionFactsService,
    private readonly occupancy: SeatOccupancyHook,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /** What would stop the retirement now, and whether it would go through: read, not decided. Throws ApplicationNotFoundError. */
  async get(applicationId: string): Promise<RetirementView> {
    const application = await this.applications.find(applicationId);
    if (!application) throw new ApplicationNotFoundError();
    const today = await this.organizationReads.businessToday();
    const state = await this.retirements.stateOf(applicationId);
    const blockers = await this.blockersOf(applicationId, today);

    return {
      status: application.status,
      retiredAt: state?.retiredAt ?? null,
      blockers,
      canRetire:
        application.status === 'APPROVED' && blockers.assignmentTotal === 0 && blockers.subscriptionTotal === 0,
    };
  }

  /**
   * Retires the application, with no confirmation to wait for. Throws ApplicationNotFoundError, ApplicationAlreadyRetiredError
   * and ApplicationRetirementBlockedError (with what holds it).
   */
  async retire(actor: AuthenticatedPrincipal, applicationId: string): Promise<void> {
    const organization = await this.requireOrganization();
    const now = new Date();

    await this.runner.run(async (tx) => {
      const application = await this.applications.lock(tx, applicationId);
      if (!application) throw new ApplicationNotFoundError();
      await this.plans.lockPlansOfApplication(tx, applicationId);
      const today = await this.organizationReads.businessToday(now, tx);
      const blockers = await this.blockersOf(applicationId, today, tx);

      decideRetirement({
        retired: application.status === 'RETIRED',
        assignments: blockers.assignments,
        subscriptions: blockers.subscriptions,
        assignmentTotal: blockers.assignmentTotal,
        subscriptionTotal: blockers.subscriptionTotal,
      });
      // No confirmation to name: the column stays null (the database allows it).
      await this.applications.markRetired(tx, applicationId, { appUserId: actor.appUserId, confirmationId: null, now });
      await this.audit.record(
        tx,
        catalogAuditEvent(
          actor,
          organization.id,
          'APPLICATION.RETIRED',
          'Application',
          applicationId,
          { status: 'APPROVED' },
          { status: 'RETIRED' },
        ),
      );
    });
  }

  private async blockersOf(applicationId: string, today: BusinessDate, tx?: DbTx): Promise<RetirementBlockers> {
    const plans = await this.plans.plansOfApplication(applicationId, tx);
    const planIds = plans.map((plan) => plan.id);
    const planName = new Map(plans.map((plan) => [plan.id, plan.name]));
    const holdings = await this.occupancy.get().openAssignmentsOfPlans(planIds, today, RETIREMENT_LIST_LIMIT, tx);
    const people = new Map(
      (
        await this.organizationReads.getEmployees([...new Set(holdings.items.map((holding) => holding.employeeId))], tx)
      ).map((employee) => [employee.id, employee]),
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
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('An application was retired before installation');

    return organization;
  }
}
