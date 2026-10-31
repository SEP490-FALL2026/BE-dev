import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../../infrastructure/database/database.module';
import { AuditModule } from '../../audit/audit.module';
import { IdentityAccessFacadeModule } from '../../identity-access/identity-access-facade.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { OrganizationModule } from '../../organization/organization.module';
import { OffboardingChangeService } from '../offboarding/change/offboarding-change.service';
import { PersonnelModule } from '../personnel.module';
import { DepartureChanges } from './departure-changes.types';
import { ProfileCorrectionService } from './profile-correction.service';
import { SuperAdminDepartureEvents } from './super-admin-departure-events.service';
import { SuperAdminEventAnchor } from './super-admin-event-anchor.service';
import { SuperAdminLeaveEvents } from './super-admin-leave-events.service';
import { SuperAdminTransferEvents } from './super-admin-transfer-events.service';
import { SuperAdminEventRepo } from './super-admin-event.repo';
import { SuperAdminEventApi } from '../public/super-admin-event.api';

/**
 * The controlled procedure for an event whose subject is the Super Admin (`pnpm ops:record-super-admin-event`): its own
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
  providers: [
    SuperAdminEventRepo,
    ProfileCorrectionService,
    SuperAdminEventAnchor,
    SuperAdminTransferEvents,
    SuperAdminLeaveEvents,
    SuperAdminDepartureEvents,
    { provide: DepartureChanges, useExisting: OffboardingChangeService },
    SuperAdminEventApi,
  ],
  exports: [SuperAdminEventApi],
})
export class SuperAdminEventModule {}
