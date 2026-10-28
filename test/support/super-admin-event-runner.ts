import type { INestApplicationContext } from '@nestjs/common';
import { TransactionRunner } from '../../src/infrastructure/database/transaction-runner';
import { AuditService } from '../../src/modules/audit/audit.service';
import { IdentityAccessService } from '../../src/modules/identity-access/identity-access.service';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';
import { OrganizationService } from '../../src/modules/organization/organization.service';
import { LeaveService } from '../../src/modules/personnel/leave/leave.service';
import { NoticeHandlingService } from '../../src/modules/personnel/notice/notice-handling.service';
import { OffboardingChangeService } from '../../src/modules/personnel/offboarding/offboarding-change.service';
import { OffboardingService } from '../../src/modules/personnel/offboarding/offboarding.service';
import { ProfileCorrectionService } from '../../src/modules/personnel/super-admin-event/profile-correction.service';
import { SuperAdminEventRepo } from '../../src/modules/personnel/super-admin-event/super-admin-event.repo';
import { SuperAdminEventService } from '../../src/modules/personnel/super-admin-event/super-admin-event.service';
import type {
  SuperAdminEventParameters,
  SuperAdminEventResult,
} from '../../src/modules/personnel/super-admin-event/super-admin-event.types';
import { TransferChangeService } from '../../src/modules/personnel/transfer/transfer-change.service';
import { TransferService } from '../../src/modules/personnel/transfer/transfer.service';

/** The default basis a test of the controlled procedure cites. */
export const SUPER_ADMIN_EVENT_BASIS = {
  type: 'DECISION',
  reference: 'QD-31/2026',
  issuer: 'Board of Directors',
  issuedOn: '2026-10-20',
};

/**
 * The service of the controlled procedure (`pnpm ops:record-super-admin-event`) built over the providers of a running test
 * application, as the command builds it: the one way to record an event about the Super Admin, which the application refuses to
 * record for them (`PERSONNEL.SELF_CHANGE_FORBIDDEN`). No assertion lives here.
 */
export function superAdminEventService(app: INestApplicationContext): SuperAdminEventService {
  return new SuperAdminEventService(
    app.get(TransactionRunner, { strict: false }),
    app.get(OrganizationService, { strict: false }),
    app.get(IdentityAccessService, { strict: false }),
    new SuperAdminEventRepo(),
    app.get(TransferService, { strict: false }),
    app.get(TransferChangeService, { strict: false }),
    app.get(LeaveService, { strict: false }),
    app.get(OffboardingService, { strict: false }),
    app.get(OffboardingChangeService, { strict: false }),
    app.get(NoticeHandlingService, { strict: false }),
    new ProfileCorrectionService(
      app.get(OrganizationService, { strict: false }),
      app.get(AuditService, { strict: false }),
      app.get(NotificationsService, { strict: false }),
    ),
  );
}

/**
 * Records one event about the Super Admin under a new ticket: `subjectCode` is the employee code of the Super Admin, `ticketRef` is
 * unique for the run of a test (`counter`).
 */
export function recordAsSuperAdmin(
  app: INestApplicationContext,
  subjectCode: string,
  ticketRef: string,
  parameters: SuperAdminEventParameters,
  basis: typeof SUPER_ADMIN_EVENT_BASIS = SUPER_ADMIN_EVENT_BASIS,
): Promise<SuperAdminEventResult> {
  return superAdminEventService(app).run({
    context: {
      ticketRef,
      approvedBy: 'cto-office',
      operator: 'ops-2',
      environment: 'SHARED' as const,
      subjectCode,
      basis,
    },
    parameters,
  });
}
