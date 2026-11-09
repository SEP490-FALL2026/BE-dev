import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AuditRepo } from './audit.repo';
import { AuditApi } from './public/audit.api';

@Module({
  imports: [DatabaseModule],
  providers: [AuditApi, AuditRepo],
  // The repo stays private: other modules record through the facade.
  exports: [AuditApi],
})
export class AuditModule {}
