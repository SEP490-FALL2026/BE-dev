import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AuditRepo } from './audit.repo';
import { AuditService } from './audit.service';

@Module({
  imports: [DatabaseModule],
  providers: [AuditService, AuditRepo],
  // The repo stays private: other modules record through the facade.
  exports: [AuditService],
})
export class AuditModule {}
