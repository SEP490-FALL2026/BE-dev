import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { ObjectStorageModule } from '../../infrastructure/object-storage/object-storage.module';
import { AuditModule } from '../audit/audit.module';
import { FinanceModule } from '../finance/finance.module';
import { IdentityAccessFacadeModule } from '../identity-access/identity-access-facade.module';
import { OperatingParametersModule } from '../operating-parameters/operating-parameters.module';
import { OrganizationModule } from '../organization/organization.module';
import { CatalogService } from './catalog.service';
import { ApplicationLookupService } from './catalog-entry/application-lookup.service';
import { ApplicationOwnerService } from './catalog-entry/application-owner.service';
import { ApplicationRetirementController } from './catalog-entry/application-retirement.controller';
import { ApplicationRetirementRepo } from './catalog-entry/application-retirement.repo';
import { ApplicationRetirementService } from './catalog-entry/application-retirement.service';
import { ApplicationOwnersController } from './catalog-entry/application-owners.controller';
import { ApplicationRepo } from './catalog-entry/application.repo';
import { ApplicationListService } from './catalog-entry/application-list.service';
import { ApplicationService } from './catalog-entry/application.service';
import { ApplicationViewService } from './catalog-entry/application-view.service';
import { ApplicationVendorLinkService } from './catalog-entry/application-vendor-link.service';
import { ApplicationsController } from './catalog-entry/applications.controller';
import { ContractRepo } from './contract/contract.repo';
import { ContractService } from './contract/contract.service';
import { ContractsController } from './contract/contracts.controller';
import { DocumentExpirySweeper } from './contract/document-expiry.sweeper';
import { DocumentRepo } from './contract/document.repo';
import { DocumentService } from './contract/document.service';
import { DocumentsController } from './contract/documents.controller';
import { FunctionalGroupLookupService } from './functional-group/functional-group-lookup.service';
import { FunctionalGroupRepo } from './functional-group/functional-group.repo';
import { FunctionalGroupService } from './functional-group/functional-group.service';
import { FunctionalGroupsController } from './functional-group/functional-groups.controller';
import { PlanTermsRepo } from './plan-terms/plan-terms.repo';
import { PlanTermsService } from './plan-terms/plan-terms.service';
import { PlanTermsController } from './plan-terms/plan-terms.controller';
import { PlanLookupService } from './plan/plan-lookup.service';
import { PlanWorkspaceService } from './plan/plan-workspace.service';
import { PlanRepo } from './plan/plan.repo';
import { PlanService } from './plan/plan.service';
import { PlansController } from './plan/plans.controller';
import { OnboardingFactsService } from './subscription/onboarding-facts.service';
import { StandardToolsetRepo } from './standard-toolset/standard-toolset.repo';
import { StandardToolsetService } from './standard-toolset/standard-toolset.service';
import { StandardToolsetsController } from './standard-toolset/standard-toolsets.controller';
import { SeatOccupancyRegistry } from './subscription/seat-occupancy.registry';
import { SeatTargetService } from './subscription/seat-target.service';
import { SubscriptionAllocationController } from './subscription/subscription-allocation.controller';
import { SubscriptionAllocationService } from './subscription/subscription-allocation.service';
import { SubscriptionLookupService } from './subscription/subscription-lookup.service';
import { SubscriptionNoticeService } from './subscription/subscription-notice.service';
import { SubscriptionRepo } from './subscription/subscription.repo';
import { SubscriptionService } from './subscription/subscription.service';
import { SubscriptionViewService } from './subscription/subscription-view.service';
import { SubscriptionsController } from './subscription/subscriptions.controller';
import { VendorDictionaryController } from './vendor-dictionary/vendor-dictionary.controller';
import { VendorDictionaryLookupService } from './vendor-dictionary/vendor-dictionary-lookup.service';
import { VendorDictionaryRepo } from './vendor-dictionary/vendor-dictionary.repo';
import { VendorDictionaryService } from './vendor-dictionary/vendor-dictionary.service';
import { VendorProposalIntakeService } from './vendor-dictionary/vendor-proposal-intake.service';
import { VendorProposalRepo } from './vendor-dictionary/vendor-proposal.repo';
import { VendorProposalService } from './vendor-dictionary/vendor-proposal.service';
import { VendorRecognitionService } from './vendor-dictionary/vendor-recognition.service';
import { VendorDirectoryService } from './vendor/vendor-directory.service';
import { InternalSoftwareRegistrationService } from './catalog-entry/internal-software-registration.service';
import { VendorLookupService } from './vendor/vendor-lookup.service';
import { VendorQueryService } from './vendor/vendor-query.service';
import { VendorTaxService } from './vendor/vendor-tax.service';
import { VendorsController } from './vendor/vendors.controller';
import { VendorRepo } from './vendor/vendor.repo';

/**
 * The catalog context (C1, G3 part): the shared vendor dictionary, the application catalog and its vendors and
 * functional groups, plans and their terms, subscriptions, contracts and their files, and standard toolsets. It
 * exports only the facade `CatalogService`, which `licensing` imports; the HTTP controllers live in the module itself
 * because no worker or command imports `catalog` (ADR-0013) — a separate HTTP module is made when one does.
 */
@Module({
  imports: [
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
    VendorsController,
    SubscriptionsController,
    SubscriptionAllocationController,
    PlanTermsController,
    ApplicationOwnersController,
    ApplicationRetirementController,
    ContractsController,
    DocumentsController,
    StandardToolsetsController,
  ],
  providers: [
    VendorDictionaryService,
    VendorRecognitionService,
    VendorProposalService,
    VendorDictionaryRepo,
    VendorProposalRepo,
    VendorDictionaryLookupService,
    VendorProposalIntakeService,
    VendorDirectoryService,
    VendorRepo,
    FunctionalGroupService,
    FunctionalGroupRepo,
    FunctionalGroupLookupService,
    ApplicationService,
    ApplicationViewService,
    ApplicationListService,
    ApplicationVendorLinkService,
    ApplicationRepo,
    ApplicationLookupService,
    PlanService,
    PlanWorkspaceService,
    PlanRepo,
    InternalSoftwareRegistrationService,
    VendorLookupService,
    VendorQueryService,
    VendorTaxService,
    PlanLookupService,
    SubscriptionService,
    SubscriptionRepo,
    SubscriptionViewService,
    SubscriptionNoticeService,
    SubscriptionAllocationService,
    SeatTargetService,
    OnboardingFactsService,
    SeatOccupancyRegistry,
    ContractRepo,
    ContractService,
    DocumentRepo,
    DocumentService,
    DocumentExpirySweeper,
    SubscriptionLookupService,
    ApplicationRetirementRepo,
    ApplicationRetirementService,
    StandardToolsetRepo,
    StandardToolsetService,
    CatalogService,
    PlanTermsService,
    PlanTermsRepo,
    ApplicationOwnerService,
  ],
  // The facade licensing reads the seat targets through (ADR-0013); the capability services and repos stay private.
  exports: [CatalogService],
})
export class CatalogModule {}
