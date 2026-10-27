import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../../infrastructure/database/database.module';
import { AuditModule } from '../../audit/audit.module';
import { CostCenterDirectionRepo } from './cost-center-direction.repo';
import { CostCenterDirectionService } from './cost-center-direction.service';

/**
 * The Cost Center link procedures (`pnpm ops:cost-center-direction`, F01, spec L.11): their own repository and service, reached by
 * the command only, never by the API or the worker. The repository stays private.
 */
@Module({
  imports: [DatabaseModule, AuditModule],
  providers: [CostCenterDirectionRepo, CostCenterDirectionService],
  exports: [CostCenterDirectionService],
})
export class CostCenterDirectionModule {}
