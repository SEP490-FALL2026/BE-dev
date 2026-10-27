import { Module } from '@nestjs/common';
import { InstallationConfigurationModule } from './infrastructure/config/installation-configuration.module';
import { CostCenterDirectionModule } from './modules/organization/cost-center-direction/cost-center-direction.module';

/**
 * The module graph of `pnpm ops:cost-center-direction`: the database settings only, and the command's own module. No
 * controller, no mail, no queue, no JWT, no guard.
 */
@Module({ imports: [InstallationConfigurationModule, CostCenterDirectionModule] })
export class CostCenterDirectionCliModule {}
