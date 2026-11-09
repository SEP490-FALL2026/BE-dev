import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../../infrastructure/database/database.module';
import { AuditModule } from '../../audit/audit.module';
import { OrganizationModule } from '../../organization/organization.module';
import { AiInvocationContentRepo } from '../invocation/invocation-content.repo';
import { AiPurgeApi } from '../public/ai-purge.api';

/**
 * The graph of `pnpm ops:ai-purge`: the repository of the contents and the purge, and the facades it writes through. No AI service,
 * no switch, no controller. Never imported by the API, the worker or another command.
 */
@Module({
  imports: [DatabaseModule, OrganizationModule, AuditModule],
  providers: [AiInvocationContentRepo, AiPurgeApi],
  exports: [AiPurgeApi],
})
export class AiAssistPurgeCliModule {}
