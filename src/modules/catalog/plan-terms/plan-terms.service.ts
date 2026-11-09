import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import type { BusinessDate } from '../../../core/business-date';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { catalogAuditEvent } from '../catalog-audit-event.mapper';
import { PlanFactsService } from '../plan/plan-facts.service';
import { SubscriptionNoticeService } from '../subscription/subscription-notice.service';
import {
  PlanTermsNotApplicableError,
  PlanTermsPlanNotFoundError,
  PlanTermsTextInvalidError,
} from './plan-terms.errors';
import {
  assertInstallLimit,
  assertReviewDate,
  assertTermsApplicable,
  cleanTermsText,
  cleanTermsUrl,
  reviewDue,
} from './plan-terms.policy';
import { PlanTermsRepo } from './plan-terms.repo';
import type { OpinionView, ReviewWarning, SharingPolicy, TermsContent, TermsRecord } from './plan-terms.types';

export interface TermsInput {
  termsUrl?: string | null;
  lastReviewedOn?: BusinessDate | null;
  aiTraining?: string | null;
  dataLocation?: string | null;
  installLimit?: { maxDevicesPerKey?: number | null; note?: string | null } | null;
  commercialUse?: string | null;
  cancellationRefund?: string | null;
}

export interface PlanTermsView {
  planId: string;
  applicable: boolean;
  sharingPolicy: SharingPolicy | null;
  terms: TermsRecord | null;
  /** The newest opinions, at most `OPINIONS_IN_VIEW`; `opinionTotal` counts them all. */
  opinions: OpinionView[];
  opinionTotal: number;
  /** The earliest review alerts, at most `WARNINGS_IN_VIEW`; `warningTotal` counts them all. */
  warnings: ReviewWarning[];
  warningTotal: number;
}

export const OPINIONS_IN_VIEW = 50;
export const WARNINGS_IN_VIEW = 50;

const snapshot = (terms: TermsContent | null) =>
  terms === null
    ? null
    : {
        termsUrl: terms.termsUrl,
        lastReviewedOn: terms.lastReviewedOn,
        aiTraining: terms.aiTraining,
        dataLocation: terms.dataLocation,
        installLimitMaxDevices: terms.installLimitMaxDevices,
        installLimitNote: terms.installLimitNote,
        commercialUse: terms.commercialUse,
        cancellationRefund: terms.cancellationRefund,
      };

const contentOf = (terms: TermsRecord): TermsContent => ({
  termsUrl: terms.termsUrl,
  lastReviewedOn: terms.lastReviewedOn,
  aiTraining: terms.aiTraining,
  dataLocation: terms.dataLocation,
  installLimitMaxDevices: terms.installLimitMaxDevices,
  installLimitNote: terms.installLimitNote,
  commercialUse: terms.commercialUse,
  cancellationRefund: terms.cancellationRefund,
});

/**
 * What IT read in the terms of a plan, the opinions the Business Owner gave on them, and the alert that says the terms
 * need a new review. The alert is derived when it is read from the active subscriptions and the date of the last review;
 * it is not stored, so it closes by itself when IT records a review. The system keeps the words as given and judges
 * nothing (`US-04-11` AC-2).
 */
@Injectable()
export class PlanTermsService {
  constructor(
    private readonly terms: PlanTermsRepo,
    private readonly plans: PlanFactsService,
    private readonly notices: SubscriptionNoticeService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /** Throws PlanTermsPlanNotFoundError. A K5 plan answers `applicable: false` and no terms. */
  async get(planId: string): Promise<PlanTermsView> {
    const plan = await this.plans.find(planId);
    if (!plan) throw new PlanTermsPlanNotFoundError();
    if (plan.provisioningType === 'K5') {
      return {
        planId,
        applicable: false,
        sharingPolicy: plan.sharingPolicy,
        terms: null,
        opinions: [],
        opinionTotal: 0,
        warnings: [],
        warningTotal: 0,
      };
    }

    const [terms, opinions, warnings] = await Promise.all([
      this.terms.find(planId),
      this.opinionPage(planId, { page: 1, pageSize: OPINIONS_IN_VIEW }),
      this.warningsFor(planId),
    ]);

    return {
      planId,
      applicable: true,
      sharingPolicy: plan.sharingPolicy,
      terms,
      opinions: opinions.items,
      opinionTotal: opinions.pagination.totalItems,
      warnings: warnings.slice(0, WARNINGS_IN_VIEW),
      warningTotal: warnings.length,
    };
  }

  /** Throws PlanTermsPlanNotFoundError. One page of the opinions on a plan, newest first. */
  async opinions(planId: string, query: { page: number; pageSize: number }): Promise<Page<OpinionView>> {
    if (!(await this.plans.find(planId))) throw new PlanTermsPlanNotFoundError();

    return this.opinionPage(planId, query);
  }

  /**
   * Replaces the terms of the plan. Throws PlanTermsPlanNotFoundError, PlanTermsNotApplicableError (a K5 plan), the text,
   * link, review-date and install-limit errors. A terms equal to the current ones records nothing.
   */
  async set(
    actor: AuthenticatedPrincipal,
    planId: string,
    input: TermsInput,
  ): Promise<{ terms: TermsRecord; changed: boolean }> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('Plan terms were used before installation');
    const today = await this.organizationReads.businessToday();
    const content: TermsContent = {
      termsUrl: cleanTermsUrl(input.termsUrl),
      lastReviewedOn: input.lastReviewedOn ?? null,
      aiTraining: cleanTermsText(input.aiTraining),
      dataLocation: cleanTermsText(input.dataLocation),
      installLimitMaxDevices: input.installLimit?.maxDevicesPerKey ?? null,
      installLimitNote: cleanTermsText(input.installLimit?.note),
      commercialUse: cleanTermsText(input.commercialUse),
      cancellationRefund: cleanTermsText(input.cancellationRefund),
    };
    assertReviewDate(content.lastReviewedOn, today);

    return this.runner.run(async (tx) => {
      const plan = await this.plans.lockShared(tx, planId);
      if (!plan) throw new PlanTermsPlanNotFoundError();
      assertTermsApplicable(plan.provisioningType);
      assertInstallLimit(plan.provisioningType, content.installLimitMaxDevices);

      const before = await this.terms.find(planId, tx);
      if (before && JSON.stringify(snapshot(contentOf(before))) === JSON.stringify(snapshot(content))) {
        return { terms: before, changed: false };
      }
      const after = await this.terms.upsert(tx, planId, content);
      await this.audit.record(
        tx,
        catalogAuditEvent(
          actor,
          organization.id,
          'PLAN_TERMS.SET',
          'Plan',
          planId,
          snapshot(before ? contentOf(before) : null),
          snapshot(contentOf(after)),
        ),
      );

      return { terms: after, changed: true };
    });
  }

  /**
   * Records an opinion of the Business Owner of the application, as the IT Admin gives it: one more line, naming who
   * recorded it and when. It adds no step, no deadline and no approver, and nothing waits for it.
   */
  async recordOpinion(actor: AuthenticatedPrincipal, planId: string, input: { opinion: string }): Promise<OpinionView> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('Plan terms were used before installation');
    const text = cleanTermsText(input.opinion);
    if (text === null) throw new PlanTermsTextInvalidError();

    const recorded = await this.runner.run(async (tx) => {
      const plan = await this.plans.lockShared(tx, planId);
      if (!plan) throw new PlanTermsPlanNotFoundError();
      assertTermsApplicable(plan.provisioningType);
      // An application declared since QĐ-104 names no Business Owner: there is nobody whose opinion this would be.
      if (plan.businessOwnerEmployeeId === null) {
        throw new PlanTermsNotApplicableError(
          'The application names no Business Owner (QĐ-104): no opinion of one is recorded.',
        );
      }

      const opinion = await this.terms.insertOpinion(tx, {
        planId,
        businessOwnerEmployeeId: plan.businessOwnerEmployeeId,
        opinion: text,
        recordedByAppUserId: actor.appUserId,
      });
      await this.audit.record(
        tx,
        catalogAuditEvent(actor, organization.id, 'PLAN_TERM_OPINION.RECORDED', 'Plan', planId, null, {
          opinionId: opinion.id,
          businessOwnerEmployeeId: opinion.businessOwnerEmployeeId,
          opinion: opinion.opinion,
        }),
      );

      return opinion;
    });

    return (await this.viewOpinions([recorded]))[0];
  }

  /** The open review alerts of every plan, the earliest milestone first. */
  async warnings(query: {
    page: number;
    pageSize: number;
  }): Promise<{ page: Page<ReviewWarning>; asOf: BusinessDate }> {
    const asOf = await this.organizationReads.businessToday();
    const all = await this.warningsFor(undefined, asOf);
    const items = all.slice((query.page - 1) * query.pageSize, query.page * query.pageSize);

    return { page: pageOf(items, all.length, query.page, query.pageSize), asOf };
  }

  private async warningsFor(planId?: string, asOf?: BusinessDate): Promise<ReviewWarning[]> {
    const today = asOf ?? (await this.organizationReads.businessToday());
    const notices = await this.notices.activeNotices(today, planId);
    const reviews = await this.terms.lastReviews([...new Set(notices.map((notice) => notice.planId))]);
    const warnings: ReviewWarning[] = [];

    for (const notice of notices) {
      const lastReviewedOn = reviews.get(notice.planId) ?? null;
      if (!reviewDue({ today, lastReviewedOn, baseDate: notice.baseDate, firstAlertDate: notice.firstAlertDate }))
        continue;
      warnings.push({
        code: 'TERMS_REVIEW_DUE',
        planId: notice.planId,
        planName: notice.planName,
        applicationId: notice.applicationId,
        applicationName: notice.applicationName,
        subscriptionId: notice.subscriptionId,
        noticeDeadline: { value: notice.noticeDeadline, source: notice.noticeSource },
        baseDate: notice.baseDate,
        reviewFrom: notice.firstAlertDate,
        lastReviewedOn,
      });
    }

    return warnings.sort(
      (a, b) =>
        a.reviewFrom.localeCompare(b.reviewFrom) ||
        a.planName.localeCompare(b.planName) ||
        a.subscriptionId.localeCompare(b.subscriptionId),
    );
  }

  private async opinionPage(planId: string, query: { page: number; pageSize: number }): Promise<Page<OpinionView>> {
    const { items, total } = await this.terms.listOpinions(planId, (query.page - 1) * query.pageSize, query.pageSize);

    return pageOf(await this.viewOpinions(items), total, query.page, query.pageSize);
  }

  private async viewOpinions(
    records: Array<{
      id: string;
      businessOwnerEmployeeId: string;
      opinion: string;
      recordedByAppUserId: string;
      recordedAt: Date;
    }>,
  ): Promise<OpinionView[]> {
    const employees = await this.organizationReads.getEmployees([
      ...new Set(records.map((record) => record.businessOwnerEmployeeId)),
    ]);
    const byId = new Map(employees.map((employee) => [employee.id, employee]));

    return records.map((record) => {
      const employee = byId.get(record.businessOwnerEmployeeId);
      if (!employee) throw new Error('The Business Owner of an opinion is not an employee');

      return {
        id: record.id,
        businessOwner: { employeeId: employee.id, employeeCode: employee.employeeCode, fullName: employee.fullName },
        opinion: record.opinion,
        recordedBy: record.recordedByAppUserId,
        recordedAt: record.recordedAt,
      };
    });
  }
}
