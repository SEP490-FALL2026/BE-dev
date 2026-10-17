import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrganizationModule } from '../organization/organization.module';
import { IdentityAccessFacadeModule } from './identity-access-facade.module';
import { RecoveryService } from './recovery.service';

/**
 * The recovery of the Super Admin role, run by an operator outside the application (`US-01-09` AC-9 → AC-14). It has
 * no controller: nothing in the API reaches it (AC-13). Only the recovery command loads it.
 */
@Module({
  imports: [DatabaseModule, OrganizationModule, AuditModule, NotificationsModule, IdentityAccessFacadeModule],
  providers: [RecoveryService],
  exports: [RecoveryService],
})
export class RecoveryModule {}
