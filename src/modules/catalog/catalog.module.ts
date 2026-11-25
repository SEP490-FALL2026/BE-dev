import { CatalogPricingFacadeModule } from './catalog-pricing-facade.module';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { ObjectStorageModule } from '../../infrastructure/object-storage/object-storage.module';
import { AuditModule } from '../audit/audit.module';
import { FinanceModule } from '../finance/finance.module';
import { IdentityAccessFacadeModule } from '../identity-access/identity-access-facade.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OperatingParametersModule } from '../operating-parameters/operating-parameters.module';
import { OrganizationModule } from '../organization/organization.module';
import { CatalogApi } from './public/catalog.api';
import { CatalogContractApi } from './public/catalog-contract.api';
import { CatalogPlanTermsApi } from './public/catalog-plan-terms.api';
import { CatalogResponsibilityApi } from './public/catalog-responsibility.api';
import { SeatBaselinePhaseHook, SeatOccupancyHook } from './public/catalog.extension-points';
import { ApplicationIntakeController } from './application-intake/application-intake.controller';
import { ApplicationIntakeService } from './application-intake/application-intake.service';
import { ApplicationFactsService } from './catalog-entry/application-facts.service';
import { ApplicationRetirementController } from './application-retirement/application-retirement.controller';
import { ApplicationResponsibilityController } from './application-responsibility/application-responsibility.controller';
import { ApplicationResponsibilityService } from './application-responsibility/application-responsibility.service';
import { ResponsibilityHandoverService } from './application-responsibility/responsibility-handover.service';
import { ApplicationRetirementRepo } from './application-retirement/application-retirement.repo';
import { ApplicationRetirementService } from './application-retirement/application-retirement.service';
import { ApplicationRepo } from './catalog-entry/application.repo';
import { ApplicationListService } from './catalog-entry/application-list.service';
import { ApplicationWriteGuards } from './catalog-entry/application-write-guards.service';
import { ApplicationService } from './catalog-entry/application.service';
import { ApplicationPlans } from './catalog-entry/application-plans.types';
import { ApplicationViewService } from './catalog-entry/application-view.service';
import { ApplicationVendorLinkService } from './catalog-entry/application-vendor-link.service';
import { ApplicationsController } from './catalog-entry/applications.controller';
import { ContractQueryService } from './contract/contract-query.service';
import { ContractSubscriptionRepo } from './contract/contract-subscription.repo';
import { ContractSubscriptionService } from './contract/contract-subscription.service';
import { ContractSubscriptionsController } from './contract/contract-subscriptions.controller';
import { ContractRepo } from './contract/contract.repo';
import { ContractService } from './contract/contract.service';
import { ContractsController } from './contract/contracts.controller';
import { DocumentExpirySweeper } from './contract/document-expiry.job';
import { DocumentRepo } from './contract/document.repo';
import { DocumentService } from './contract/document.service';
import { DocumentsController } from './contract/documents.controller';
import { FunctionalGroupFactsService } from './functional-group/functional-group-facts.service';
import { FunctionalGroupRepo } from './functional-group/functional-group.repo';
import { FunctionalGroupService } from './functional-group/functional-group.service';
import { FunctionalGroupsController } from './functional-group/functional-groups.controller';
import { PlanFactsService } from './plan/plan-facts.service';
import { PlanUsageRepo } from './plan/plan-usage.repo';
import { PlanWorkspaceService } from './plan/plan-workspace.service';
import { VendorAdminMinimumService } from './plan/vendor-admin/vendor-admin-minimum.service';
import { VendorAdminRolesService } from './plan/vendor-admin/vendor-admin-roles.service';
import { PlanRepo } from './plan/plan.repo';
import { PlanService } from './plan/plan.service';
import { PlanQuotePriceService } from './plan/plan-quote-price.service';
import { PlansController } from './plan/plans.controller';
import { PlanTermsController } from './plan-terms/plan-terms.controller';
import { PlanTermsRepo } from './plan-terms/plan-terms.repo';
import { PlanTermsService } from './plan-terms/plan-terms.service';
import { CatalogNotificationNamesListener } from './requestable-software/catalog-notification-names.listener';
import { RequestableSoftwareController } from './requestable-software/requestable-software.controller';
import { RequestableSoftwareRepo } from './requestable-software/requestable-software.repo';
import { RequestableSoftwareService } from './requestable-software/requestable-software.service';
import { OnboardingFactsService } from './subscription/onboarding-facts.service';
import { SeatTargetService } from './subscription/seat-target.service';
import { SubscriptionFactsService } from './subscription/subscription-facts.service';
import { SubscriptionNoticeService } from './subscription/subscription-notice.service';
import { SubscriptionPeriodRepo } from './subscription/period/subscription-period.repo';
import { SubscriptionPeriodService } from './subscription/period/subscription-period.service';
import { SubscriptionPeriodApi } from './public/subscription-period.api';
import { SubscriptionSeatIncreaseService } from './subscription/seat-increase/subscription-seat-increase.service';
import { SubscriptionGrantingRepo } from './subscription/subscription-granting.repo';
import { SubscriptionChangeGuard } from './subscription/subscription-change-guard.service';
import { SubscriptionChangeService } from './subscription/subscription-change.service';
import { SubscriptionService } from './subscription/subscription.service';
import { SubscriptionPoolService } from './subscription/pool/subscription-pool.service';
import { SubscriptionPricingService } from './subscription/subscription-pricing.service';
import { SubscriptionViewService } from './subscription/subscription-view.service';
import { SubscriptionWindowsService } from './subscription/subscription-windows.service';
import { SubscriptionsController } from './subscription/subscriptions.controller';
import { SubscriptionResponsibleController } from './subscription/responsible/subscription-responsible.controller';
import { SubscriptionResponsibleService } from './subscription/responsible/subscription-responsible.service';
import { VendorDictionaryController } from './vendor-dictionary/vendor-dictionary.controller';
import { VendorDictionaryFactsService } from './vendor-dictionary/vendor-dictionary-facts.service';
import { VendorDictionaryRepo } from './vendor-dictionary/vendor-dictionary.repo';
import { VendorDictionaryService } from './vendor-dictionary/vendor-dictionary.service';
import { VendorProposalIntakeService } from './vendor-dictionary/vendor-proposal-intake.service';
import { VendorProposalRepo } from './vendor-dictionary/vendor-proposal.repo';
import { VendorProposalService } from './vendor-dictionary/vendor-proposal.service';
import { VendorRecognitionService } from './vendor-dictionary/vendor-recognition.service';
import { VendorRecordService } from './vendor/vendor-record.service';
import { InternalSoftwareRegistrationService } from './internal-software-registration/internal-software-registration.service';
import { VendorFactsService } from './vendor/vendor-facts.service';
import { VendorQueryService } from './vendor/vendor-query.service';
import { VendorTaxService } from './vendor/vendor-tax.service';
import { VendorsController } from './vendor/vendors.controller';
import { VendorRepo } from './vendor/vendor.repo';
import { WorkspaceApi } from './public/workspace.api';
import { WorkspaceAdminsService } from './workspace/workspace-admins.service';
import { WorkspaceForSubscriptionService } from './workspace/workspace-for-subscription.service';
import { WorkspaceResponsibleService } from './workspace/workspace-responsible.service';
import { WorkspaceService } from './workspace/workspace.service';
import { WorkspaceRepo } from './workspace/workspace.repo';
import { LicenseLotLockService } from './license-lot/license-lot-lock.service';
import { LicenseLotRepo } from './license-lot/license-lot.repo';
import { LicenseLotApi } from './public/license-lot.api';
import { SeatLedgerRepo } from './subscription-line/ledger/seat-ledger.repo';
import { SeatPurchaseRepo } from './subscription-line/purchase/seat-purchase.repo';
import { SubscriptionLineRepo } from './subscription-line/subscription-line.repo';
import { WorkspaceViewService } from './workspace/workspace-view.service';
import { WorkspacesController } from './workspace/workspaces.controller';

/**
 * The catalog context (C1, G3 part): the shared vendor dictionary, the application catalog and its vendors and
 * functional groups, plans and their terms, subscriptions, contracts and their files. It
 * exports only the facade `CatalogApi`, which `licensing` imports; the HTTP controllers live in the module itself
 * because no worker or command imports `catalog` (ADR-0013) — a separate HTTP module is made when one does.
 */
@Module({
  imports: [
    CatalogPricingFacadeModule,
    DatabaseModule,
    AuditModule,
    OrganizationModule,
    IdentityAccessFacadeModule,
    FinanceModule,
    OperatingParametersModule,
    NotificationsModule,
    ObjectStorageModule,
  ],
  controllers: [
    VendorDictionaryController,
    ApplicationsController,
    ApplicationIntakeController,
    FunctionalGroupsController,
    PlansController,
    PlanTermsController,
    VendorsController,
    SubscriptionsController,
    SubscriptionResponsibleController,
    WorkspacesController,
    ApplicationRetirementController,
    ApplicationResponsibilityController,
    ContractsController,
    ContractSubscriptionsController,
    DocumentsController,
    RequestableSoftwareController,
  ],
  providers: [
    ApplicationResponsibilityService,
    ResponsibilityHandoverService,
    PlanTermsService,
    PlanTermsRepo,
    VendorDictionaryService,
    VendorRecognitionService,
    VendorProposalService,
    VendorDictionaryRepo,
    VendorProposalRepo,
    VendorDictionaryFactsService,
    VendorProposalIntakeService,
    VendorRecordService,
    VendorRepo,
    FunctionalGroupService,
    FunctionalGroupRepo,
    FunctionalGroupFactsService,
    ApplicationWriteGuards,
    ApplicationService,
    ApplicationIntakeService,
    ApplicationViewService,
    ApplicationListService,
    ApplicationVendorLinkService,
    ApplicationRepo,
    ApplicationFactsService,
    PlanService,
    PlanQuotePriceService,
    PlanWorkspaceService,
    WorkspaceService,
    WorkspaceAdminsService,
    WorkspaceResponsibleService,
    WorkspaceViewService,
    WorkspaceForSubscriptionService,
    WorkspaceRepo,
    SubscriptionLineRepo,
    LicenseLotRepo,
    LicenseLotLockService,
    LicenseLotApi,
    SeatLedgerRepo,
    SeatPurchaseRepo,
    WorkspaceApi,
    VendorAdminRolesService,
    VendorAdminMinimumService,
    PlanRepo,
    PlanUsageRepo,
    InternalSoftwareRegistrationService,
    VendorFactsService,
    VendorQueryService,
    VendorTaxService,
    PlanFactsService,
    // the application names the plans it reads (catalog-entry/application-plans.types.ts); the plans answer
    { provide: ApplicationPlans, useExisting: PlanFactsService },
    SubscriptionChangeGuard,
    SubscriptionChangeService,
    SubscriptionResponsibleService,
    SubscriptionService,
    SubscriptionPoolService,
    SubscriptionSeatIncreaseService,
    SubscriptionPricingService,
    SubscriptionGrantingRepo,
    SubscriptionViewService,
    SubscriptionNoticeService,
    SubscriptionWindowsService,
    SubscriptionPeriodRepo,
    SubscriptionPeriodService,
    SeatTargetService,
    OnboardingFactsService,
    SeatOccupancyHook,
    SeatBaselinePhaseHook,
    ContractRepo,
    ContractService,
    ContractQueryService,
    ContractSubscriptionRepo,
    ContractSubscriptionService,
    DocumentRepo,
    DocumentService,
    DocumentExpirySweeper,
    SubscriptionFactsService,
    ApplicationRetirementRepo,
    ApplicationRetirementService,
    CatalogApi,
    CatalogPlanTermsApi,
    CatalogContractApi,
    CatalogResponsibilityApi,
    SubscriptionPeriodApi,
    RequestableSoftwareRepo,
    RequestableSoftwareService,
    // Names an application, a plan and a subscription in a notification sentence: added to the name sources of `notifications` when the module starts.
    CatalogNotificationNamesListener,
  ],
  // The facade licensing reads the seat targets through (ADR-0013), and the hook licensing binds its reader of occupied seats to
  // (`public/catalog.extension-points.ts`), and the facade the hand-over of an IT Admin who leaves moves their subscriptions and applications through
  // (`public/catalog-responsibility.api.ts`), and the facade `usage` reads the applications of a contract through (`public/catalog-contract.api.ts`), and the facade licensing reads and locks the lots of licenses through (`public/license-lot.api.ts`); the capability services and repos stay private.
  exports: [
    CatalogApi,
    CatalogPlanTermsApi,
    CatalogContractApi,
    CatalogResponsibilityApi,
    LicenseLotApi,
    SubscriptionPeriodApi,
    SeatOccupancyHook,
    SeatBaselinePhaseHook,
  ],
})
export class CatalogModule {}
