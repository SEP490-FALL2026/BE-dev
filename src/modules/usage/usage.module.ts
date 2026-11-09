import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { CatalogModule } from '../catalog/catalog.module';
import { DevicesModule } from '../devices/devices.module';
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
import { IdentityRepo } from './identity/identity.repo';
import { NoAssignmentFindingRepo } from './identity/no-assignment-finding.repo';
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
 * the status of its login and quota, and why a request was refused. It exports nothing: it binds the allowlist the session of a collector
 * shows and answers HTTP.
 */
@Module({
  imports: [DatabaseModule, AuditModule, OrganizationModule, CatalogModule, DevicesModule, LicensingModule],
  controllers: [
    AllowlistController,
    AiUsageController,
    ToolStatusController,
    IntakeRejectionController,
    VendorSourceController,
    VendorImportController,
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
    NoAssignmentFindingRepo,
    VendorImportRepo,
    VendorImportService,
    VendorImportQueryService,
    VendorImportMatchService,
    VendorImportPreviewService,
  ],
})
export class UsageModule {}
