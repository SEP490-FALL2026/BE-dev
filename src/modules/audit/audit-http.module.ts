import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AuditController } from './audit.controller';
import { AuditQueryRepo } from './audit-query.repo';
import { AuditQueryService } from './audit-query.service';

/**
 * The read side of the Audit Trail, mounted by the API only. It is a module of its own, not part of
 * `AuditModule`, because the installation command and the worker import `AuditModule` for the facade
 * that records events and must not carry a controller or a reader with them.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [AuditController],
  providers: [AuditQueryService, AuditQueryRepo],
})
export class AuditHttpModule {}
