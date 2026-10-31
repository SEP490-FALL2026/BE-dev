import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../../infrastructure/database/database.module';
import { AuditModule } from '../../audit/audit.module';
import { OrganizationModule } from '../../organization/organization.module';
import { SubscriptionOwnerAssignmentRepo } from './subscription-owner-assignment.repo';
import { SubscriptionOwnerAssignmentApi } from '../public/subscription-owner-assignment.api';

/**
 * The graph of `pnpm ops:assign-subscription-owner`: the command's own repository and service, and the facades it writes
 * through. Never imported by the API, the worker or another command.
 */
@Module({
  imports: [DatabaseModule, OrganizationModule, AuditModule],
  providers: [SubscriptionOwnerAssignmentRepo, SubscriptionOwnerAssignmentApi],
  exports: [SubscriptionOwnerAssignmentApi],
})
export class SubscriptionOwnerAssignmentModule {}
