import { Module } from '@nestjs/common';
import { ConfigurationModule } from '../../infrastructure/config/configuration.module';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { SuperAdminEventModule } from '../../modules/personnel/super-admin-event/super-admin-event.module';

/**
 * The module graph of `pnpm ops:record-super-admin-event`. Like `pnpm ops:recover` it carries the full environment validation and the
 * runtime database role: the events it writes go through the personnel context, whose listeners (the review of tools after a transfer,
 * the notices of the event) are the ones of the application. Nothing of the API is served: no route, no guard, no sweep that runs soon
 * enough to matter in a process that ends with the command.
 */
@Module({ imports: [ConfigurationModule, DatabaseModule, SuperAdminEventModule] })
export class SuperAdminEventCliModule {}
