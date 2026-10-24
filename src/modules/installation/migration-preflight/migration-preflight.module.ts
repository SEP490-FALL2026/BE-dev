import { Module } from '@nestjs/common';
import { InstallationConfigurationModule } from '../../../infrastructure/config/installation-configuration.module';
import { DatabaseModule } from '../../../infrastructure/database/database.module';
import { ReadOnlyDatabaseSessionModule } from '../../../infrastructure/database/read-only-session.module';
import { MigrationPreflightRepo } from './migration-preflight.repo';
import { MigrationPreflightService } from './migration-preflight.service';

/**
 * The graph of `pnpm ops:preflight` (P28-01): database settings only, every session read-only, no business module.
 * Never imported by the API, the worker or a command that writes.
 */
@Module({
  imports: [InstallationConfigurationModule, ReadOnlyDatabaseSessionModule, DatabaseModule],
  providers: [MigrationPreflightRepo, MigrationPreflightService],
  exports: [MigrationPreflightService],
})
export class MigrationPreflightModule {}
