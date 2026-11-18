import { Module } from '@nestjs/common';
import { InstallationConfigurationModule } from '../../infrastructure/config/installation-configuration.module';
import { AiAssistPurgeCliModule } from '../../modules/ai-assist/purge/ai-assist-purge-cli.module';

/**
 * The module graph of `pnpm ops:ai-purge`: the database settings only, and the command's own module. No controller, no mail, no
 * queue, no JWT, no guard, no AI service.
 */
@Module({ imports: [InstallationConfigurationModule, AiAssistPurgeCliModule] })
export class AiPurgeCliModule {}
