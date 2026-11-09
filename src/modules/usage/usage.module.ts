import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { CatalogModule } from '../catalog/catalog.module';
import { DevicesModule } from '../devices/devices.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LicensingModule } from '../licensing/licensing.module';
import { OrganizationModule } from '../organization/organization.module';
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
import { VendorSourceController } from './vendor-source/vendor-source.controller';
import { VendorSourceQueryService } from './vendor-source/vendor-source-query.service';
import { VendorSourceRepo } from './vendor-source/vendor-source.repo';
import { VendorSourceService } from './vendor-source/vendor-source.service';
import { ToolStatusController } from './tool-status/tool-status.controller';
import { ToolStatusQueryService } from './tool-status/tool-status-query.service';
import { ToolStatusRepo } from './tool-status/tool-status.repo';
import { ToolStatusSnapshotService } from './tool-status/tool-status-snapshot.service';

/**
 * What the collectors on company machines send and what is read of it (`G7`): the allowlist of tools, the days an AI tool was used,
 * the status of its login and quota, and why a request was refused. It binds the allowlist the session of a collector
 * shows, answers HTTP, and gives the rules of wasted seats one door to the usage (`UsageEvidenceApi`).
 */
@Module({
  imports: [
    DatabaseModule,
    AuditModule,
    OrganizationModule,
    CatalogModule,
    DevicesModule,
    LicensingModule,
    NotificationsModule,
  ],
  controllers: [
    AllowlistController,
    AiUsageController,
    ToolStatusController,
    IntakeRejectionController,
    VendorSourceController,
    VendorImportController,
    IdentityController,
  ],
  providers: [
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
  ],
  // The door to the usage for the rules of wasted seats, and the point they bind to hear a confirmed report.
  exports: [UsageEvidenceApi, UsageImportListeners],
})
export class UsageModule {}
