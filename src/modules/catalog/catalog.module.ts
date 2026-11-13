import { CatalogPricingFacadeModule } from './catalog-pricing-facade.module';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { ObjectStorageModule } from '../../infrastructure/object-storage/object-storage.module';
import { AuditModule } from '../audit/audit.module';
import { FinanceModule } from '../finance/finance.module';
import { IdentityAccessFacadeModule } from '../identity-access/identity-access-facade.module';
import { OperatingParametersModule } from '../operating-parameters/operating-parameters.module';
import { OrganizationModule } from '../organization/organization.module';
import { CatalogApi } from './public/catalog.api';
import { CatalogResponsibilityApi } from './public/catalog-responsibility.api';
import { SeatBaselinePhaseHook, SeatOccupancyHook } from './public/catalog.extension-points';
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
import { VendorAdminRolesService } from './plan/vendor-admin-roles.service';
import { PlanRepo } from './plan/plan.repo';
import { PlanService } from './plan/plan.service';
import { PlansController } from './plan/plans.controller';
import { PlanTermsController } from './plan-terms/plan-terms.controller';
import { PlanTermsRepo } from './plan-terms/plan-terms.repo';
import { PlanTermsService } from './plan-terms/plan-terms.service';
import { RequestableSoftwareController } from './requestable-software/requestable-software.controller';
import { RequestableSoftwareRepo } from './requestable-software/requestable-software.repo';
import { RequestableSoftwareService } from './requestable-software/requestable-software.service';
import { OnboardingFactsService } from './subscription/onboarding-facts.service';
import { SeatTargetService } from './subscription/seat-target.service';
import { SubscriptionDepartmentUseReader } from './subscription/subscription-department-use.listener';
import { SubscriptionFactsService } from './subscription/subscription-facts.service';
import { SubscriptionNoticeService } from './subscription/subscription-notice.service';
import { SubscriptionPeriodService } from './subscription/subscription-period.service';
import { SubscriptionPeriodApi } from './public/subscription-period.api';
import { SubscriptionObligationService } from './subscription/obligation/subscription-obligation.service';
import { SubscriptionGrantingRepo } from './subscription/subscription-granting.repo';
import { SubscriptionChangeGuard } from './subscription/subscription-change-guard.service';
import { SubscriptionChangeService } from './subscription/subscription-change.service';
import { SubscriptionService } from './subscription/subscription.service';
import { SubscriptionPoolService } from './subscription/pool/subscription-pool.service';
import { SubscriptionPricingService } from './subscription/subscription-pricing.service';
import { SubscriptionViewService } from './subscription/subscription-view.service';
import { SubscriptionsController } from './subscription/subscriptions.controller';
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
    ObjectStorageModule,
  ],
  controllers: [
    VendorDictionaryController,
    ApplicationsController,
    FunctionalGroupsController,
    PlansController,
    PlanTermsController,
    VendorsController,
    SubscriptionsController,
    ApplicationRetirementController,
    ApplicationResponsibilityController,
    ContractsController,
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
    ApplicationViewService,
    ApplicationListService,
    ApplicationVendorLinkService,
    ApplicationRepo,
    ApplicationFactsService,
    PlanService,
    PlanWorkspaceService,
    VendorAdminRolesService,
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
    SubscriptionService,
    SubscriptionPoolService,
    SubscriptionPricingService,
    SubscriptionObligationService,
    SubscriptionDepartmentUseReader,
    SubscriptionGrantingRepo,
    SubscriptionViewService,
    SubscriptionNoticeService,
    SubscriptionPeriodService,
    SeatTargetService,
    OnboardingFactsService,
    SeatOccupancyHook,
    SeatBaselinePhaseHook,
    ContractRepo,
    ContractService,
    DocumentRepo,
    DocumentService,
    DocumentExpirySweeper,
    SubscriptionFactsService,
    ApplicationRetirementRepo,
    ApplicationRetirementService,
    CatalogApi,
    CatalogResponsibilityApi,
    SubscriptionPeriodApi,
    RequestableSoftwareRepo,
    RequestableSoftwareService,
  ],
  // The facade licensing reads the seat targets through (ADR-0013), and the hook licensing binds its reader of occupied seats to
  // (`public/catalog.extension-points.ts`), and the facade the hand-over of an IT Admin who leaves moves their subscriptions and applications through
  // (`public/catalog-responsibility.api.ts`); the capability services and repos stay private.
  exports: [CatalogApi, CatalogResponsibilityApi, SubscriptionPeriodApi, SeatOccupancyHook, SeatBaselinePhaseHook],
})
export class CatalogModule {}
