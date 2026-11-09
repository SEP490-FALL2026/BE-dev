import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../../infrastructure/config/env-schema';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { CatalogModule } from '../catalog/catalog.module';
import { FinanceModule } from '../finance/finance.module';
import { IdentityAccessFacadeModule } from '../identity-access/identity-access-facade.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OperatingParametersModule } from '../operating-parameters/operating-parameters.module';
import { OrganizationModule } from '../organization/organization.module';
import { AssignmentEndService } from './assignment/assignment-end.service';
import { AssignmentFactsRepo } from './assignment/renewal/assignment-facts.repo';
import { AssignmentRenewalService } from './assignment/renewal/assignment-renewal.service';
import { AssignmentResponsibleService } from './assignment/assignment-responsible.service';
import { ServiceAccountDutiesController } from './assignment/service-account-duty/service-account-duties.controller';
import { ServiceAccountDutyRepo } from './assignment/service-account-duty/service-account-duty.repo';
import { ServiceAccountDutyService } from './assignment/service-account-duty/service-account-duty.service';
import { ServiceAccountDutySweeper } from './assignment/service-account-duty/service-account-duty.job';
import { ServiceAccountSpendingApproverGrantCheck } from './assignment/service-account-duty/spending-approver-grant.listener';
import { AssignmentDepartmentRepo } from './assignment/assignment-department.repo';
import { AssignmentRepo } from './assignment/assignment.repo';
import { RuleSeatsFactsService } from './assignment/rule-seats-facts.service';
import { RuleSeatsRepo } from './assignment/rule-seats.repo';
import { SharedPoolCapacityRepo } from './shared-pool/shared-pool-capacity.repo';
import { SharedPoolService } from './shared-pool/shared-pool.service';
import { SharedPoolVacancyService } from './shared-pool/shared-pool-vacancy.service';
import { AssignmentSeatOccupancy } from './assignment/assignment-seat-occupancy.listener';
import { AssignmentServiceAccountReader } from './assignment/assignment-service-account.listener';
import { AssignmentListService } from './assignment/assignment-list.service';
import { AssignmentService } from './assignment/assignment.service';
import { AssignmentsController } from './assignment/assignments.controller';
import { DashboardFactsRepo } from './dashboard-facts/dashboard-facts.repo';
import { DashboardFactsService } from './dashboard-facts/dashboard-facts.service';
import { DepartmentToolsController } from './department-tools/department-tools.controller';
import { DepartmentToolsService } from './department-tools/department-tools.service';
import { SubscriptionSeatsController } from './assignment/subscription-seats.controller';
import { ExpiryController } from './expiry/expiry.controller';
import { ExpiryQueueRepo } from './expiry/expiry-queue.repo';
import { ExpiryQueueService } from './expiry/expiry-queue.service';
import { ExpiryReminderRepo } from './expiry/expiry-reminder.repo';
import { ExpiryReminderService } from './expiry/expiry-reminder.service';
import { ExpiryReminderSweeper } from './expiry/expiry-reminder.job';
import { HandoverAlertService } from './handover/handover-alert.service';
import { HandoverCaseFacts } from './handover/handover-case-facts.service';
import { HandoverConfirmationService } from './handover/handover-confirmation.service';
import { HandoverConfirmerResolver } from './handover/handover-confirmer.service';
import { HandoverDutiesController } from './handover/handover-duties.controller';
import { HandoverDutySweeper } from './handover/handover-duty.job';
import { HandoverIssueService } from './handover/handover-issue.service';
import { HandoverListRepo } from './handover/handover-list.repo';
import { HandoverOverdueService } from './handover/handover-overdue.service';
import { HandoverRevocationHook } from './handover/handover-revocation.listener';
import { HandoverViewService } from './handover/handover-view.service';
import { HandoverRepo } from './handover/handover.repo';
import { HandoverService } from './handover/handover.service';
import { LicensingAlerts } from './licensing-alerts.service';
import { LicenseKeyCipher, parsePreviousVaultKeys } from './license-key/license-key-cipher.service';
import { LicenseKeyRepo } from './license-key/license-key.repo';
import { LicenseKeyRevealQuotaRepo } from './license-key/license-key-reveal-quota.repo';
import { LicenseKeyService } from './license-key/license-key.service';
import { LicenseKeysController } from './license-key/license-keys.controller';
import { MySoftwareController } from './my-software/my-software.controller';
import { MySoftwareRepo } from './my-software/my-software.repo';
import { MySoftwareService } from './my-software/my-software.service';
import {
  GrantRequestGateHook,
  RenewalFinancialContributions,
  RenewalHoldHook,
  RenewalUsageContributions,
  ResponsibleDeadlineHook,
  RevocationListeners,
  SeatBaselineClosedListeners,
  SeatBaselinePhaseHook,
} from './public/licensing.extension-points';
import { LicensingApi } from './public/licensing.api';
import { LicensingDashboardApi } from './public/licensing-dashboard.api';
import { LicensingHandoverApi } from './public/licensing-handover.api';
import { LicensingGhostSeatApi } from './public/licensing-ghost-seat.api';
import { LicensingOpenGrantsApi } from './public/licensing-open-grants.api';
import { LicensingRenewalApi } from './public/licensing-renewal.api';
import { LicensingSeatBaselineApi } from './public/licensing-seat-baseline.api';
import { LicensingServiceAccountApi } from './public/licensing-service-account.api';
import { ProvisioningCancellationService } from './provisioning/grant-cancellation/provisioning-cancellation.service';
import { ProvisioningDecisionService } from './provisioning/tasks/provisioning-decision.service';
import { ProvisioningFailureService } from './provisioning/provisioning-failure.service';
import { ProvisioningHolderService } from './provisioning/tasks/provisioning-holder.service';
import { ProvisioningGrantPlanner } from './provisioning/tasks/provisioning-grant-planner.service';
import { ProvisioningGrantService } from './provisioning/tasks/provisioning-grant.service';
import { ProvisioningGrantWriter } from './provisioning/tasks/provisioning-grant-writer.service';
import { ProvisioningService } from './provisioning/tasks/provisioning.service';
import { ProvisioningTaskFrame } from './provisioning/provisioning-task-frame.service';
import { ProvisioningTaskViewService } from './provisioning/provisioning-task-view.service';
import { ProvisioningTaskRepo } from './provisioning/provisioning-task.repo';
import { ProvisioningTasksController } from './provisioning/tasks/provisioning-tasks.controller';
import { RevocationTasksController } from './provisioning/revocation-completion/revocation-tasks.controller';
import { DepartmentOpenWorkReader } from './provisioning/department-use/department-open-work.listener';
import { ProvisioningDepartmentUseRepo } from './provisioning/department-use/provisioning-department-use.repo';
import { RevocationCompletionService } from './provisioning/revocation-completion/revocation-completion.service';
import { RevocationLeaverAlert } from './provisioning/revocation-completion/revocation-leaver-alert.service';
import { OpenGrantTaskRepo } from './provisioning/open-grants/open-grant-task.repo';
import { OpenGrantTaskService } from './provisioning/open-grants/open-grant-task.service';
import { RevocationReadRepo } from './provisioning/revocation-read.repo';
import { RevocationViewService } from './provisioning/revocation-view.service';
import { RevocationRecorder } from './provisioning/revocation-recorder.service';
import { RevocationTaskFactory } from './provisioning/revocation-task-factory.service';
import { RevocationService } from './provisioning/revocation.service';
import { RevocationWithdrawalService } from './provisioning/revocation-withdrawal/revocation-withdrawal.service';
import { ProvisioningTaskReasonRepo } from './provisioning/provisioning-task-reason.repo';
import { SaasIssueCalendar } from './saas-issue/saas-issue-calendar.service';
import { SaasIssueFactsRepo } from './saas-issue/saas-issue-facts.repo';
import { SaasIssueHandlingService } from './saas-issue/saas-issue-handling.service';
import { SaasIssueRepo } from './saas-issue/saas-issue.repo';
import { SaasIssueService } from './saas-issue/saas-issue.service';
import { SaasIssueSweepService } from './saas-issue/saas-issue-sweep.service';
import { SaasIssueSweeper } from './saas-issue/saas-issue.job';
import { SaasIssueViewService } from './saas-issue/saas-issue-view.service';
import { SaasIssuesController } from './saas-issue/saas-issues.controller';
import { SeatBaselineController } from './seat-baseline/seat-baseline.controller';
import { SeatBaselinePhaseListener } from './seat-baseline/seat-baseline-phase.listener';
import { SeatBaselineRepo } from './seat-baseline/seat-baseline.repo';
import { SeatBaselineService } from './seat-baseline/seat-baseline.service';
import { RenewalAlertsService } from './subscription-renewal/alerts/renewal-alerts.service';
import { RenewalDeadlineService } from './subscription-renewal/deadline/renewal-deadline.service';
import { RenewalDecisionTrail } from './subscription-renewal/decision/renewal-decision-trail.service';
import { RenewalDecisionService } from './subscription-renewal/decision/renewal-decision.service';
import { RenewalOutcomeService } from './subscription-renewal/outcome/renewal-outcome.service';
import { RenewalProposalService } from './subscription-renewal/proposal/renewal-proposal.service';
import { RenewalNotifier } from './subscription-renewal/subscription-renewal-notifier.service';
import { RenewalPartiesService } from './subscription-renewal/subscription-renewal-parties.service';
import { RenewalRankingService } from './subscription-renewal/subscription-renewal-ranking.service';
import { SubscriptionRenewalSeatRepo } from './subscription-renewal/subscription-renewal-seat.repo';
import { SubscriptionRenewalSweepService } from './subscription-renewal/subscription-renewal-sweep.service';
import { RenewalViewService } from './subscription-renewal/subscription-renewal-view.service';
import { SubscriptionRenewalSweeper } from './subscription-renewal/subscription-renewal.job';
import { SubscriptionRenewalRepo } from './subscription-renewal/subscription-renewal.repo';
import { SubscriptionRenewalsController } from './subscription-renewal/subscription-renewals.controller';

/**
 * The licensing context (C3, ADR-0013): the assignments of seats, the closing of the seat baseline, the queue of
 * provisioning and the vault of license keys. It reads the
 * catalog through `CatalogApi` and the organization through its facade; nothing in the catalog reads it back. The
 * HTTP controllers live in the module itself because no graph other than the API needs it yet: a separate HTTP module is
 * made when the worker or a command imports `licensing`.
 */
@Module({
  imports: [
    DatabaseModule,
    AuditModule,
    OrganizationModule,
    CatalogModule,
    FinanceModule,
    IdentityAccessFacadeModule,
    NotificationsModule,
    OperatingParametersModule,
  ],
  controllers: [
    AssignmentsController,
    SubscriptionSeatsController,
    DepartmentToolsController,
    ServiceAccountDutiesController,
    SeatBaselineController,
    ProvisioningTasksController,
    RevocationTasksController,
    LicenseKeysController,
    HandoverDutiesController,
    ExpiryController,
    SaasIssuesController,
    MySoftwareController,
    SubscriptionRenewalsController,
  ],
  providers: [
    LicensingAlerts,
    AssignmentRepo,
    AssignmentDepartmentRepo,
    AssignmentSeatOccupancy,
    AssignmentServiceAccountReader,
    DepartmentOpenWorkReader,
    ProvisioningDepartmentUseRepo,
    AssignmentService,
    AssignmentEndService,
    AssignmentFactsRepo,
    AssignmentRenewalService,
    RenewalHoldHook,
    ResponsibleDeadlineHook,
    AssignmentResponsibleService,
    ServiceAccountDutyRepo,
    ServiceAccountDutyService,
    ServiceAccountDutySweeper,
    ServiceAccountSpendingApproverGrantCheck,
    AssignmentListService,
    DepartmentToolsService,
    SeatBaselineRepo,
    SeatBaselineService,
    SeatBaselinePhaseListener,
    SeatBaselineClosedListeners,
    ProvisioningTaskRepo,
    ProvisioningTaskFrame,
    ProvisioningHolderService,
    ProvisioningTaskViewService,
    ProvisioningGrantPlanner,
    ProvisioningGrantWriter,
    ProvisioningGrantService,
    ProvisioningService,
    ProvisioningDecisionService,
    ProvisioningCancellationService,
    ProvisioningFailureService,
    ProvisioningTaskReasonRepo,
    RevocationListeners,
    RevocationTaskFactory,
    RevocationRecorder,
    RevocationService,
    RevocationWithdrawalService,
    RevocationCompletionService,
    RevocationLeaverAlert,
    RevocationReadRepo,
    RevocationViewService,
    OpenGrantTaskRepo,
    OpenGrantTaskService,
    HandoverRepo,
    HandoverListRepo,
    HandoverConfirmerResolver,
    HandoverCaseFacts,
    HandoverAlertService,
    HandoverIssueService,
    HandoverService,
    HandoverRevocationHook,
    HandoverConfirmationService,
    HandoverViewService,
    HandoverOverdueService,
    HandoverDutySweeper,
    ExpiryReminderRepo,
    ExpiryReminderService,
    ExpiryReminderSweeper,
    ExpiryQueueRepo,
    ExpiryQueueService,
    SaasIssueRepo,
    SaasIssueFactsRepo,
    SaasIssueCalendar,
    SaasIssueService,
    SaasIssueHandlingService,
    SaasIssueViewService,
    SaasIssueSweepService,
    SaasIssueSweeper,
    MySoftwareRepo,
    MySoftwareService,
    SubscriptionRenewalRepo,
    SubscriptionRenewalSeatRepo,
    RenewalPartiesService,
    RenewalRankingService,
    RenewalNotifier,
    RenewalProposalService,
    RenewalDecisionTrail,
    RenewalDecisionService,
    RenewalOutcomeService,
    RenewalAlertsService,
    RenewalDeadlineService,
    RenewalViewService,
    SubscriptionRenewalSweepService,
    SubscriptionRenewalSweeper,
    RenewalFinancialContributions,
    RenewalUsageContributions,
    DashboardFactsRepo,
    DashboardFactsService,
    LicenseKeyRepo,
    LicenseKeyRevealQuotaRepo,
    LicenseKeyService,
    {
      provide: LicenseKeyCipher,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => {
        const currentKeyId = config.get('LICENSE_KEY_VAULT_KEY_ID', { infer: true });

        return new LicenseKeyCipher({
          currentKeyId,
          keys: {
            ...parsePreviousVaultKeys(config.get('LICENSE_KEY_VAULT_PREVIOUS_KEYS', { infer: true })),
            [currentKeyId]: config.get('LICENSE_KEY_VAULT_KEY', { infer: true }),
          },
          fingerprintPepper: config.get('LICENSE_KEY_FINGERPRINT_PEPPER', { infer: true }),
        });
      },
    },
    // The extension points licensing opens (public/licensing.extension-points.ts): requests binds the gate.
    GrantRequestGateHook,
    SeatBaselinePhaseHook,
    LicensingApi,
    LicensingDashboardApi,
    LicensingHandoverApi,
    LicensingGhostSeatApi,
    RuleSeatsFactsService,
    RuleSeatsRepo,
    SharedPoolCapacityRepo,
    SharedPoolService,
    SharedPoolVacancyService,
    LicensingOpenGrantsApi,
    LicensingRenewalApi,
    LicensingSeatBaselineApi,
    LicensingServiceAccountApi,
  ],
  // Other modules read through the facade and bind the extension points; the capability services and the repos stay private.
  exports: [
    LicensingApi,
    LicensingDashboardApi,
    LicensingHandoverApi,
    LicensingGhostSeatApi,
    LicensingOpenGrantsApi,
    LicensingRenewalApi,
    LicensingSeatBaselineApi,
    LicensingServiceAccountApi,
    GrantRequestGateHook,
    RevocationListeners,
    RenewalHoldHook,
    ResponsibleDeadlineHook,
    SeatBaselineClosedListeners,
    RenewalFinancialContributions,
    RenewalUsageContributions,
  ],
})
export class LicensingModule {}
