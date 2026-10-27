import { Module } from '@nestjs/common';
import { InstallationConfigurationModule } from './infrastructure/config/installation-configuration.module';
import { SubscriptionOwnerAssignmentModule } from './modules/catalog/subscription-owner-assignment/subscription-owner-assignment.module';

/**
 * The module graph of `pnpm ops:assign-subscription-owner`: the database settings only, and the command's own module.
 * No controller, no mail, no queue, no JWT, no guard.
 */
@Module({ imports: [InstallationConfigurationModule, SubscriptionOwnerAssignmentModule] })
export class SubscriptionOwnerAssignmentCliModule {}
