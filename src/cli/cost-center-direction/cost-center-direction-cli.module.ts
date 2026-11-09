import { Module } from '@nestjs/common';
import { InstallationConfigurationModule } from '../../infrastructure/config/installation-configuration.module';
import { CostCenterDirectionCliModule } from '../../modules/organization/cost-center-direction/cost-center-direction-cli.module';

/**
 * The module graph of `pnpm ops:cost-center-direction`: the database settings only, and the command's own module. No
 * controller, no mail, no queue, no JWT, no guard. The file has the name of the module's own part, so the root is the "Root" one.
 */
@Module({ imports: [InstallationConfigurationModule, CostCenterDirectionCliModule] })
export class CostCenterDirectionRootCliModule {}
