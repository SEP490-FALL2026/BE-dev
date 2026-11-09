import { Module } from '@nestjs/common';
import { ConfigurationModule } from '../../infrastructure/config/configuration.module';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { IdentityAccessRecoveryCliModule } from '../../modules/identity-access/identity-access-recovery-cli.module';

/**
 * The module graph of the recovery command (`pnpm ops:recover`). It carries the full environment validation, because
 * the mail it queues is sealed and linked with the same settings the API and the worker use, and nothing else of the
 * API: no controller, no guard.
 */
@Module({ imports: [ConfigurationModule, DatabaseModule, IdentityAccessRecoveryCliModule] })
export class RecoveryCliModule {}
