import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { IdentityAccessFacadeModule } from '../identity-access/identity-access-facade.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrganizationModule } from '../organization/organization.module';
import { AcknowledgementController } from './acknowledgement/acknowledgement.controller';
import { AcknowledgementFactsService } from './acknowledgement/acknowledgement-facts.service';
import { AcknowledgementReportService } from './acknowledgement/acknowledgement-report.service';
import { AcknowledgementRepo } from './acknowledgement/acknowledgement.repo';
import { AcknowledgementService } from './acknowledgement/acknowledgement.service';
import { PendingPolicyAcknowledgementListener } from './acknowledgement/pending-acknowledgements.listener';
import { ImportTemplateController } from './import-template/import-template.controller';
import { ImportTemplateService } from './import-template/import-template.service';
import { LibraryDraftController } from './library/library-draft.controller';
import { LibraryDraftService } from './library/library-draft.service';
import { LibraryPublishService } from './library/library-publish.service';
import { PoliciesBootstrapFacadeModule } from './policies-bootstrap-facade.module';
import { PoliciesTemplateFacadeModule } from './policies-template-facade.module';
import { PolicyReadingController } from './reading/policy-reading.controller';
import { PolicyReadingQueryService } from './reading/policy-reading-query.service';

/**
 * The policy library (`QĐ-111ao`): the fixed set of policies the Super Admin publishes new versions of, the acknowledgement of
 * the reader, the checklist of a decision and the template files of the imports. The capabilities are added as the packages
 * PL-1, PL-2 and PL-3 land; the module card lists what is wired.
 */
@Module({
  imports: [
    DatabaseModule,
    AuditModule,
    OrganizationModule,
    IdentityAccessFacadeModule,
    NotificationsModule,
    PoliciesBootstrapFacadeModule,
    PoliciesTemplateFacadeModule,
  ],
  controllers: [PolicyReadingController, LibraryDraftController, AcknowledgementController, ImportTemplateController],
  providers: [
    LibraryDraftService,
    LibraryPublishService,
    AcknowledgementRepo,
    AcknowledgementFactsService,
    AcknowledgementService,
    AcknowledgementReportService,
    PendingPolicyAcknowledgementListener,
    PolicyReadingQueryService,
    ImportTemplateService,
  ],
})
export class PoliciesModule {}
