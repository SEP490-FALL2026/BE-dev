import type { Type } from '@nestjs/common';
import { AppModule } from '../../src/app/app.module';
import { CostCenterDirectionRootCliModule } from '../../src/cli/cost-center-direction/cost-center-direction-cli.module';
import { AssignSubscriptionOwnerCliModule } from '../../src/cli/assign-subscription-owner/assign-subscription-owner-cli.module';
import { RecoveryCliModule } from '../../src/cli/recover/recover-cli.module';
import { RecordSuperAdminEventCliModule } from '../../src/cli/record-super-admin-event/record-super-admin-event-cli.module';
import { SeedCliModule } from '../../src/modules/installation/seed/seed-cli.module';
import { InspectionCliModule } from '../../src/modules/installation/inspect/inspection-cli.module';
import { InstallationModule } from '../../src/modules/installation/installation.module';
import { MigrationPreflightCliModule } from '../../src/modules/installation/migration-preflight/migration-preflight-cli.module';
import { WorkerModule } from '../../src/worker/worker.module';

/**
 * Every Nest graph a process boots: the API, the worker and each out-of-HTTP command (`db-roles` has none). The gates that read the
 * graph (`extension-wiring`, `module-graph` R10) judge all of them. A spec that imports this file mocks `@nestjs/config` first (the real
 * configuration modules load an env file the moment they are imported).
 */
export const PROCESS_GRAPHS: readonly (readonly [string, Type<unknown>])[] = [
  ['AppModule', AppModule],
  ['WorkerModule', WorkerModule],
  ['InstallationModule', InstallationModule],
  ['RecoveryCliModule', RecoveryCliModule],
  ['RecordSuperAdminEventCliModule', RecordSuperAdminEventCliModule],
  ['InspectionCliModule', InspectionCliModule],
  ['MigrationPreflightCliModule', MigrationPreflightCliModule],
  ['AssignSubscriptionOwnerCliModule', AssignSubscriptionOwnerCliModule],
  ['CostCenterDirectionRootCliModule', CostCenterDirectionRootCliModule],
  ['SeedCliModule', SeedCliModule],
];
