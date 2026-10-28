import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../../infrastructure/database/database.module';
import { AuditModule } from '../../audit/audit.module';
import { IdentityAccessFacadeModule } from '../../identity-access/identity-access-facade.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { OrganizationModule } from '../../organization/organization.module';
import { PersonnelModule } from '../personnel.module';
import { ProfileCorrectionService } from './profile-correction.service';
import { SuperAdminEventRepo } from './super-admin-event.repo';
import { SuperAdminEventService } from './super-admin-event.service';

/**
 * The controlled procedure for an event whose subject is the Super Admin (`pnpm ops:record-super-admin-event`, F19, spec L.2): its own
 * repository of tickets and its own service, reached by the command only, never by the API or the worker (the entry condition of a
 * graph of its own, `docs/rules/module-structure.md`). The writes of the events are the services `PersonnelModule` exports for it,
 * so the rules of every event are the ones of the application; the correction of the record of the Super Admin (`profile-correct`) goes
 * through the facade of the organization. The repository stays private.
 */
@Module({
  imports: [
    DatabaseModule,
    AuditModule,
    NotificationsModule,
    OrganizationModule,
    IdentityAccessFacadeModule,
    PersonnelModule,
  ],
  providers: [SuperAdminEventRepo, ProfileCorrectionService, SuperAdminEventService],
  exports: [SuperAdminEventService],
})
export class SuperAdminEventModule {}
