import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { OperatingParametersModule } from '../operating-parameters/operating-parameters.module';
import { OrganizationModule } from '../organization/organization.module';
import { RequestsModule } from '../requests/requests.module';
import { HttpAiServiceClient } from './ai-service/ai-service-client.service';
import { aiServiceSettingsFrom } from './ai-service/ai-service-environment.policy';
import { AiServiceClient } from './ai-service/ai-service.types';
import { InvocationContentQueryService } from './invocation-content/invocation-content-query.service';
import { AiInvocationContentRepo } from './invocation/invocation-content.repo';
import { AiInvocationRepo } from './invocation/invocation.repo';
import { QueueSummaryRunService } from './queue-summary/queue-summary-run.service';
import { QueueSummaryService } from './queue-summary/queue-summary.service';

/**
 * The AI summary of the approval queue of a person (`US-15-05`): the client of the AI service, the record of each call and what was
 * said in it (`ai_invocations`, `ai_invocation_contents`), and the use case. It reads the steps through the facade of `requests`, the
 * two switches through the operating parameters, and writes the audit trail. The settings of the AI service are checked when the
 * module is mounted: none means the feature answers that it is unavailable, an address without its token stops the start.
 */
@Module({
  imports: [DatabaseModule, AuditModule, OperatingParametersModule, OrganizationModule, RequestsModule],
  providers: [
    AiInvocationRepo,
    AiInvocationContentRepo,
    InvocationContentQueryService,
    QueueSummaryRunService,
    QueueSummaryService,
    {
      provide: AiServiceClient,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new HttpAiServiceClient(aiServiceSettingsFrom((key) => config.get(key))),
    },
  ],
  exports: [QueueSummaryService, InvocationContentQueryService],
})
export class AiAssistModule {}
