import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../../infrastructure/config/env-schema';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { CatalogModule } from '../catalog/catalog.module';
import { IdentityAccessFacadeModule } from '../identity-access/identity-access-facade.module';
import { OperatingParametersModule } from '../operating-parameters/operating-parameters.module';
import { OrganizationModule } from '../organization/organization.module';
import { AssignmentRepo } from './assignment/assignment.repo';
import { AssignmentSeatOccupancy } from './assignment/seat-occupancy.reader';
import { AssignmentService } from './assignment/assignment.service';
import { AssignmentsController } from './assignment/assignments.controller';
import { DepartmentToolsController } from './assignment/department-tools.controller';
import { DepartmentToolsService } from './assignment/department-tools.service';
import { SubscriptionSeatsController } from './assignment/subscription-seats.controller';
import { LicenseKeyCipher, parsePreviousVaultKeys } from './license-key/license-key-cipher';
import { LicenseKeyRepo } from './license-key/license-key.repo';
import { LicenseKeyService } from './license-key/license-key.service';
import { LicenseKeysController } from './license-key/license-keys.controller';
import { GRANT_REQUEST_GATE } from './licensing.types';
import { LicensingService } from './licensing.service';
import { ProvisioningDecisionService } from './provisioning/provisioning-decision.service';
import { ProvisioningFailureService } from './provisioning/provisioning-failure.service';
import { ProvisioningService } from './provisioning/provisioning.service';
import { ProvisioningTaskFrame } from './provisioning/provisioning-task-frame.service';
import { ProvisioningTaskViewService } from './provisioning/provisioning-task-view.service';
import { ProvisioningTaskRepo } from './provisioning/provisioning-task.repo';
import { ProvisioningTasksController } from './provisioning/provisioning-tasks.controller';
import { RefusingGrantRequestGate } from './provisioning/refusing-grant-request-gate.service';
import { SeatBaselineController } from './seat-baseline/seat-baseline.controller';
import { SeatBaselineRepo } from './seat-baseline/seat-baseline.repo';
import { SeatBaselineService } from './seat-baseline/seat-baseline.service';

/**
 * The licensing context (C3, ADR-0013): the assignments of seats, the closing of the seat baseline, the queue of
 * provisioning and the vault of license keys. It reads the
 * catalog through `CatalogService` and the organization through its facade; nothing in the catalog reads it back. The
 * HTTP controllers live in the module itself because no graph other than the API needs it yet: a separate HTTP module is
 * made when the worker or a command imports `licensing`.
 */
@Module({
  imports: [
    DatabaseModule,
    AuditModule,
    OrganizationModule,
    CatalogModule,
    IdentityAccessFacadeModule,
    OperatingParametersModule,
  ],
  controllers: [
    AssignmentsController,
    SubscriptionSeatsController,
    DepartmentToolsController,
    SeatBaselineController,
    ProvisioningTasksController,
    LicenseKeysController,
  ],
  providers: [
    AssignmentRepo,
    AssignmentSeatOccupancy,
    AssignmentService,
    DepartmentToolsService,
    SeatBaselineRepo,
    SeatBaselineService,
    ProvisioningTaskRepo,
    ProvisioningTaskFrame,
    ProvisioningTaskViewService,
    ProvisioningService,
    ProvisioningDecisionService,
    ProvisioningFailureService,
    LicenseKeyRepo,
    LicenseKeyService,
    {
      provide: LicenseKeyCipher,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => {
        const currentKeyId = config.get('LICENSE_KEY_VAULT_KEY_ID', { infer: true });

        return new LicenseKeyCipher({
          currentKeyId,
          keys: {
            ...parsePreviousVaultKeys(config.get('LICENSE_KEY_VAULT_PREVIOUS_KEYS', { infer: true })),
            [currentKeyId]: config.get('LICENSE_KEY_VAULT_KEY', { infer: true }),
          },
          fingerprintPepper: config.get('LICENSE_KEY_FINGERPRINT_PEPPER', { infer: true }),
        });
      },
    },
    // Until the module of requests exists no request is known: it replaces this binding with its own gate.
    { provide: GRANT_REQUEST_GATE, useClass: RefusingGrantRequestGate },
    LicensingService,
  ],
  // Other modules read through the facade only; the capability services and the repos stay private.
  exports: [LicensingService],
})
export class LicensingModule {}
