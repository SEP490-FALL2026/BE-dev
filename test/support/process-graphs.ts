import type { Type } from '@nestjs/common';
import { AppModule } from '../../src/app/app.module';
import { CostCenterDirectionCliModule } from '../../src/cli/cost-center-direction/cost-center-direction-cli.module';
import { SubscriptionOwnerAssignmentCliModule } from '../../src/cli/assign-subscription-owner/assign-subscription-owner-cli.module';
import { RecoveryCliModule } from '../../src/cli/recover/recover-cli.module';
import { SuperAdminEventCliModule } from '../../src/cli/record-super-admin-event/record-super-admin-event-cli.module';
import { DemoDatasetModule } from '../../src/modules/installation/demo-dataset/demo-dataset.module';
import { DevSeedModule } from '../../src/modules/installation/dev-seed/dev-seed.module';
import { InspectionModule } from '../../src/modules/installation/inspect/inspection.module';
import { InstallationModule } from '../../src/modules/installation/installation.module';
import { MigrationPreflightModule } from '../../src/modules/installation/migration-preflight/migration-preflight.module';
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
  ['SuperAdminEventCliModule', SuperAdminEventCliModule],
  ['InspectionModule', InspectionModule],
  ['MigrationPreflightModule', MigrationPreflightModule],
  ['SubscriptionOwnerAssignmentCliModule', SubscriptionOwnerAssignmentCliModule],
  ['CostCenterDirectionCliModule', CostCenterDirectionCliModule],
  ['DevSeedModule', DevSeedModule],
  ['DemoDatasetModule', DemoDatasetModule],
];
