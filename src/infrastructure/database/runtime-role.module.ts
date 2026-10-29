import { Module } from '@nestjs/common';
import { DatabaseModule } from './database.module';
import { RuntimeDatabaseRoleGuard } from './runtime-role.guard';

/**
 * Mounted by the API (`AppModule`), the worker (`WorkerModule`) and `ops:demo-dataset` (which writes what the API would,
 * as the runtime role). The other operational commands do not import it: preflight, inspect and migrate run as the deploy
 * role on purpose (docs/guides/containers.md#postgresql-roles-h7).
 */
@Module({
  imports: [DatabaseModule],
  providers: [RuntimeDatabaseRoleGuard],
})
export class RuntimeDatabaseRoleModule {}
