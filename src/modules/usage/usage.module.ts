import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { CatalogModule } from '../catalog/catalog.module';
import { DevicesModule } from '../devices/devices.module';
import { FinanceModule } from '../finance/finance.module';
import { IdentityAccessFacadeModule } from '../identity-access/identity-access-facade.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LicensingModule } from '../licensing/licensing.module';
import { OperatingParametersModule } from '../operating-parameters/operating-parameters.module';
import { OrganizationModule } from '../organization/organization.module';
import { RequestsModule } from '../requests/requests.module';
import { AiUsageController } from './ai-usage/ai-usage.controller';
import { AiUsageBatchService } from './ai-usage/ai-usage-batch.service';
import { AiUsageQueryService } from './ai-usage/ai-usage-query.service';
import { AiUsageRepo } from './ai-usage/ai-usage.repo';
import { AllowlistController } from './allowlist/allowlist.controller';
import { AllowlistFactsService } from './allowlist/allowlist-facts.service';
import { AllowlistPublishService } from './allowlist/allowlist-publish.service';
import { AllowlistQueryService } from './allowlist/allowlist-query.service';
import { AllowlistRepo } from './allowlist/allowlist.repo';
import { AllowlistSessionListener } from './allowlist/allowlist-session.listener';
import { IntakeRejectionController } from './intake-gate/intake-rejection.controller';
import { IntakeRejectionQueryService } from './intake-gate/intake-rejection-query.service';
import { IntakeRejectionRepo } from './intake-gate/intake-rejection.repo';
import { UsageEvidenceRepo } from './usage-evidence/usage-evidence.repo';
import { UsageEvidenceService } from './usage-evidence/usage-evidence.service';
import { IdentityController } from './identity/identity.controller';
import { IdentityQueryService } from './identity/identity-query.service';
import { IdentityService } from './identity/identity.service';
import { IdentityRepo } from './identity/identity.repo';
import { NoAssignmentFindingRepo } from './identity/no-assignment-finding.repo';
import { UsageEvidenceApi } from './public/usage-evidence.api';
import { UsageOutOfProcessApi } from './public/usage-out-of-process.api';
import { UsageImportListeners } from './public/usage.extension-points';
import { VendorImportConfirmationService } from './vendor-import/confirmation/vendor-import-confirmation.service';
import { VendorImportWriteService } from './vendor-import/confirmation/vendor-import-write.service';
import { VendorImportPeopleService } from './vendor-import/confirmation/vendor-import-people.service';
import { VendorImportTrackingNoticeService } from './vendor-import/confirmation/vendor-import-tracking-notice.service';
import { VendorImportController } from './vendor-import/vendor-import.controller';
import { VendorImportQueryService } from './vendor-import/vendor-import-query.service';
import { VendorImportRepo } from './vendor-import/vendor-import.repo';
import { VendorImportService } from './vendor-import/vendor-import.service';
import { VendorImportMatchService } from './vendor-import/match/vendor-import-match.service';
import { VendorImportPreviewService } from './vendor-import/preview/vendor-import-preview.service';
import { VendorSourceContractController } from './vendor-source/vendor-source-contract.controller';
import { VendorSourceController } from './vendor-source/vendor-source.controller';
import { VendorSourceQueryService } from './vendor-source/vendor-source-query.service';
import { VendorSourceRepo } from './vendor-source/vendor-source.repo';
import { VendorSourceService } from './vendor-source/vendor-source.service';
import { UsageEmployeeController } from './usage-overview/usage-employee.controller';
import { UsageEmployeeRepo } from './usage-overview/usage-employee.repo';
import { UsageEmployeeViewService } from './usage-overview/usage-employee-view.service';
import { UsageOverviewController } from './usage-overview/usage-overview.controller';
import { UsageOverviewPeopleService } from './usage-overview/usage-overview-people.service';
import { UsageOverviewQueryService } from './usage-overview/usage-overview-query.service';
import { UsageOverviewRepo } from './usage-overview/usage-overview.repo';
import { UsageOverviewScopeService } from './usage-overview/usage-overview-scope.service';
import { ToolStatusController } from './tool-status/tool-status.controller';
import { ToolStatusQueryService } from './tool-status/tool-status-query.service';
import { ToolStatusRepo } from './tool-status/tool-status.repo';
import { ToolStatusSnapshotService } from './tool-status/tool-status-snapshot.service';
import { OutOfProcessCaseClosureService } from './vendor-account-review/out-of-process-case-closure.service';
import { OutOfProcessRevocationService } from './vendor-account-review/out-of-process-revocation.service';
import { VendorAccountDecisionService } from './vendor-account-review/vendor-account-decision.service';
import { VendorAccountEvidenceSweeper } from './vendor-account-review/vendor-account-evidence-retention.job';
import { VendorAccountEvidenceRetentionService } from './vendor-account-review/vendor-account-evidence-retention.service';
import { VendorAccountIntakeService } from './vendor-account-review/vendor-account-intake.service';
import { VendorAccountReviewListener } from './vendor-account-review/vendor-account-review-import.listener';
import { VendorAccountReviewRepo } from './vendor-account-review/vendor-account-review.repo';
import { OutOfProcessCasesController } from './vendor-account-review-queue/out-of-process-cases.controller';
import { VendorAccountDiscrepanciesController } from './vendor-account-review-queue/vendor-account-discrepancies.controller';
import { VendorAccountReviewQueryService } from './vendor-account-review-queue/vendor-account-review-query.service';
import { PoliciesTemplateFacadeModule } from '../policies/policies-template-facade.module';
import { VendorImportTemplateListener } from './vendor-import/vendor-import-template.listener';

/**
 * What the collectors on company machines send and what is read of it (`G7`): the allowlist of tools, the days an AI tool was used,
 * the status of its login and quota, and why a request was refused. It binds the allowlist the session of a collector
 * shows, answers HTTP, and gives the rules of wasted seats one door to the usage (`UsageEvidenceApi`).
 */
@Module({
  imports: [
    PoliciesTemplateFacadeModule,
    DatabaseModule,
    AuditModule,
    BudgetsModule,
    FinanceModule,
    OperatingParametersModule,
    OrganizationModule,
    RequestsModule,
    CatalogModule,
    DevicesModule,
    IdentityAccessFacadeModule,
    LicensingModule,
    NotificationsModule,
  ],
  controllers: [
    AllowlistController,
    AiUsageController,
    ToolStatusController,
    IntakeRejectionController,
    VendorSourceController,
    VendorSourceContractController,
    VendorImportController,
    IdentityController,
    UsageOverviewController,
    UsageEmployeeController,
    VendorAccountDiscrepanciesController,
    OutOfProcessCasesController,
  ],
  providers: [
    VendorAccountReviewRepo,
    VendorAccountIntakeService,
    VendorAccountDecisionService,
    OutOfProcessCaseClosureService,
    OutOfProcessRevocationService,
    VendorAccountReviewQueryService,
    VendorAccountEvidenceRetentionService,
    VendorAccountEvidenceSweeper,
    VendorAccountReviewListener,
    VendorImportTemplateListener,
    AllowlistRepo,
    AllowlistFactsService,
    AllowlistPublishService,
    AllowlistQueryService,
    AllowlistSessionListener,
    IntakeRejectionRepo,
    IntakeRejectionQueryService,
    AiUsageRepo,
    AiUsageBatchService,
    AiUsageQueryService,
    ToolStatusRepo,
    ToolStatusSnapshotService,
    ToolStatusQueryService,
    VendorSourceRepo,
    VendorSourceService,
    VendorSourceQueryService,
    IdentityRepo,
    IdentityService,
    IdentityQueryService,
    NoAssignmentFindingRepo,
    VendorImportRepo,
    VendorImportService,
    VendorImportQueryService,
    VendorImportMatchService,
    VendorImportPreviewService,
    VendorImportConfirmationService,
    VendorImportWriteService,
    VendorImportPeopleService,
    VendorImportTrackingNoticeService,
    UsageImportListeners,
    UsageEvidenceRepo,
    UsageEvidenceService,
    UsageEvidenceApi,
    UsageOutOfProcessApi,
    UsageOverviewRepo,
    UsageOverviewScopeService,
    UsageOverviewPeopleService,
    UsageOverviewQueryService,
    UsageEmployeeRepo,
    UsageEmployeeViewService,
  ],
  // The door to the usage for the rules of wasted seats, and the point they bind to hear a confirmed report.
  exports: [UsageEvidenceApi, UsageOutOfProcessApi, UsageImportListeners],
})
export class UsageModule {}
