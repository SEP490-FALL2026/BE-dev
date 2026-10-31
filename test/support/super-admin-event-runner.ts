import type { INestApplicationContext } from '@nestjs/common';
import { TransactionRunner } from '../../src/infrastructure/database/transaction-runner';
import { AuditApi } from '../../src/modules/audit/public/audit.api';
import { IdentityAccessApi } from '../../src/modules/identity-access/public/identity-access.api';
import { NotificationsApi } from '../../src/modules/notifications/public/notifications.api';
import { OrganizationApi } from '../../src/modules/organization/public/organization.api';
import { LeaveService } from '../../src/modules/personnel/leave/leave.service';
import { NoticeHandlingService } from '../../src/modules/personnel/notice/notice-handling.service';
import { OffboardingChangeService } from '../../src/modules/personnel/offboarding/change/offboarding-change.service';
import { OffboardingService } from '../../src/modules/personnel/offboarding/offboarding.service';
import { ProfileCorrectionService } from '../../src/modules/personnel/super-admin-event/profile-correction.service';
import { SuperAdminDepartureEvents } from '../../src/modules/personnel/super-admin-event/super-admin-departure-events.service';
import { SuperAdminEventAnchor } from '../../src/modules/personnel/super-admin-event/super-admin-event-anchor.service';
import { SuperAdminLeaveEvents } from '../../src/modules/personnel/super-admin-event/super-admin-leave-events.service';
import { SuperAdminTransferEvents } from '../../src/modules/personnel/super-admin-event/super-admin-transfer-events.service';
import { SuperAdminEventRepo } from '../../src/modules/personnel/super-admin-event/super-admin-event.repo';
import { SuperAdminEventApi } from '../../src/modules/personnel/public/super-admin-event.api';
import type {
  SuperAdminEventParameters,
  SuperAdminEventResult,
} from '../../src/modules/personnel/public/super-admin-event.types';
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
export function superAdminEventService(app: INestApplicationContext): SuperAdminEventApi {
  const tickets = new SuperAdminEventRepo();
  const anchor = new SuperAdminEventAnchor(tickets, app.get(NoticeHandlingService, { strict: false }));

  return new SuperAdminEventApi(
    app.get(TransactionRunner, { strict: false }),
    app.get(OrganizationApi, { strict: false }),
    app.get(IdentityAccessApi, { strict: false }),
    tickets,
    new SuperAdminTransferEvents(
      anchor,
      app.get(TransferService, { strict: false }),
      app.get(TransferChangeService, { strict: false }),
    ),
    new SuperAdminLeaveEvents(anchor, app.get(LeaveService, { strict: false })),
    new SuperAdminDepartureEvents(
      anchor,
      app.get(OffboardingService, { strict: false }),
      app.get(OffboardingChangeService, { strict: false }),
    ),
    new ProfileCorrectionService(
      app.get(OrganizationApi, { strict: false }),
      app.get(AuditApi, { strict: false }),
      app.get(NotificationsApi, { strict: false }),
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
