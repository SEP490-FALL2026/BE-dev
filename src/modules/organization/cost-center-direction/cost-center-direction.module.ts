import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../../infrastructure/database/database.module';
import { AuditModule } from '../../audit/audit.module';
import { CostCenterDirectionRepo } from './cost-center-direction.repo';
import { CostCenterDirectionApi } from '../public/cost-center-direction.api';

/**
 * The Cost Center link procedures (`pnpm ops:cost-center-direction`): their own repository and service, reached by
 * the command only, never by the API or the worker. The repository stays private.
 */
@Module({
  imports: [DatabaseModule, AuditModule],
  providers: [CostCenterDirectionRepo, CostCenterDirectionApi],
  exports: [CostCenterDirectionApi],
})
export class CostCenterDirectionModule {}
