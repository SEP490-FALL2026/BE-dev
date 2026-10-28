import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { CatalogModule } from '../catalog/catalog.module';
import { IdentityAccessFacadeModule } from '../identity-access/identity-access-facade.module';
import { LicensingModule } from '../licensing/licensing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OperatingParametersModule } from '../operating-parameters/operating-parameters.module';
import { OrganizationModule } from '../organization/organization.module';
import { RequestsModule } from '../requests/requests.module';
import { DepartmentOpenWorkReader } from './event-notice/department-open-work.reader';
import { DepartmentOpenWorkRepo } from './event-notice/department-open-work.repo';
import { PersonnelNotifier } from './event-notice/personnel-notifier.service';
import { LeaveDepartureService } from './leave/leave-departure.service';
import { LeaveOverdueService } from './leave/leave-overdue.service';
import { LeaveNoticeRecorder } from './leave/leave-notice.recorder';
import { LeaveQueryService } from './leave/leave-query.service';
import { LeaveReturnSweeper } from './leave/leave-return.sweeper';
import { LeaveRepo } from './leave/leave.repo';
import { LeaveService } from './leave/leave.service';
import { LongLeavesController } from './leave/long-leaves.controller';
import { NoticesController } from './notice/notice.controller';
import { NoticeHandlingService } from './notice/notice-handling.service';
import { NoticeOverdueService } from './notice/notice-overdue.service';
import { NoticeOverdueSweeper } from './notice/notice-overdue.sweeper';
import { NoticeQueryService } from './notice/notice-query.service';
import { NoticeRecorderRegistry } from './notice/notice-recorder.registry';
import { NoticeRepo } from './notice/notice.repo';
import { NoticeService } from './notice/notice.service';
import { OffboardingAuditService } from './offboarding/offboarding-audit.service';
import { OffboardingBlockerRegistry } from './offboarding/offboarding-blocker.registry';
import { OffboardingChangeService } from './offboarding/offboarding-change.service';
import { OffboardingFrame } from './offboarding/offboarding-frame.service';
import { OffboardingHandoverService } from './offboarding/offboarding-handover.service';
import { OffboardingLeftService } from './offboarding/offboarding-left.service';
import { OffboardingListRepo } from './offboarding/offboarding-list.repo';
import { OffboardingPeriodsService } from './offboarding/offboarding-periods.service';
import { OffboardingRevocationService } from './offboarding/offboarding-revocation.service';
import { OffboardingViewService } from './offboarding/offboarding-view.service';
import { OffboardingController } from './offboarding/offboarding.controller';
import { OffboardingStepsController } from './offboarding/offboarding-steps.controller';
import { OffboardingNoticeRecorder } from './offboarding/offboarding-notice.recorder';
import { OffboardingRepo } from './offboarding/offboarding.repo';
import { OpenRequestsController } from './offboarding/open-requests.controller';
import { OpenRequestsService } from './offboarding/open-requests.service';
import { OpenRequestsSource } from './offboarding/open-requests.source';
import { OffboardingService } from './offboarding/offboarding.service';
import { PersonnelFileHooks } from './personnel-file-hooks';
import { MeDepartureNoticeController } from './role-duties/me-departure-notice.controller';
import { RoleDutiesHook } from './role-duties/role-duties.hook';
import { RoleDutiesRepo } from './role-duties/role-duties.repo';
import { RoleDutiesService } from './role-duties/role-duties.service';
import { RoleDutiesViewService } from './role-duties/role-duties-view.service';
import { RoleWarningSource } from './role-duties/role-warning.source';
import { SuperAdminWatchController } from './role-duties/super-admin-watch.controller';
import { WorkspaceBlockerSource } from './role-duties/workspace-blocker.source';
import { PersonnelFileDeadlinesRepo } from './service-account/personnel-file-deadlines.repo';
import { PersonnelFileDeadlines } from './service-account/personnel-file-deadlines.service';
import { PersonnelService } from './personnel.service';
import { ServiceAccountBlockerSource } from './service-account/service-account-blocker.source';
import { ServiceAccountDutyHook } from './service-account/service-account-duty.hook';
import { TransferChangeService } from './transfer/transfer-change.service';
import { TransferClosureService } from './transfer/transfer-closure.service';
import { TransferEffectiveListener } from './transfer/transfer-effective.listener';
import { TransferGuardService } from './transfer/transfer-guard.service';
import { TransferNoticeRecorder } from './transfer/transfer-notice.recorder';
import { TransferQueryService } from './transfer/transfer-query.service';
import { TransferSettlementService } from './transfer/transfer-settlement.service';
import { TransferRepo } from './transfer/transfer.repo';
import { TransferService } from './transfer/transfer.service';
import { TransfersController } from './transfer/transfers.controller';
import { TransferReviewDecisionService } from './transfer-review/transfer-review-decision.service';
import { PostSetupReviewService } from './transfer-review/post-setup-review.service';
import { TransferReviewListRepo } from './transfer-review/transfer-review-list.repo';
import { TransferReviewListener } from './transfer-review/transfer-review.listener';
import { TransferReviewOverdueService } from './transfer-review/transfer-review-overdue.service';
import { TransferReviewReplacementService } from './transfer-review/transfer-review-replacement.service';
import { TransferReviewRepo } from './transfer-review/transfer-review.repo';
import { TransferReviewService } from './transfer-review/transfer-review.service';
import { TransferReviewSweeper } from './transfer-review/transfer-review.sweeper';
import { TransferReviewViewService } from './transfer-review/transfer-review-view.service';
import { TransferReviewsController } from './transfer-review/transfer-reviews.controller';

/**
 * What happens to the place of a person in the organization (ADR-0017): the transfer to another department or job title
 * now, the long leave and the leaving of a person next. It writes history through the organization and never touches the
 * tables of another module. Only the API loads it: its listener of the organization settles a transfer on its day, and the
 * hourly telling of the organization runs in the same graph. The one thing it exports is the registry of hooks that the flows
 * which follow a personnel file (the owner of a service account) register with. It also holds the review of the tools of a
 * person (every personal seat they hold) that the new head of a department makes after a transfer: opened by its listener when a person changes
 * department, decided by the head, and told as late by an hourly sweep; a decision to take a tool away goes through the licensing
 * gate in the same transaction. The long leave of a person (the day they are due back, the basis of it, the return) is kept here too:
 * a late return is only told by an hourly sweep, never acted on, and the facade `PersonnelService` gives the days of leave to the rules
 * that read them. The departure of a person (a handover with the last working day or an abrupt departure, the rights the person
 * holds, the lock of the company account, the revocations the IT Admin asks for and the closing of the case) is kept here as well:
 * nothing is revoked by itself, and the flows that come after register what keeps a case open with `OffboardingBlockerRegistry`.
 * The notice a head of department sends about a change coming for one of their people is kept here too: information with no effect, which
 * the IT Admin rejects or verifies and records through the transfer, the long leave or the departure (each registers its own recorder
 * with `NoticeRecorderRegistry`), told as late by an hourly sweep and never acted on.
 *
 * Who writes an event is the Super Admin (`QĐ-87a`), judged by the policy of each service; about the Super Admin themselves only the
 * controlled procedure `pnpm ops:record-super-admin-event` writes it, with a ticket (spec L.2). The command lives in `super-admin-event/`
 * with a module of its own that the API and the worker never load; it reaches the writes below through the services this module
 * exports for it. Everyone concerned by an event is told in the inbox in the same transaction (`PersonnelNotifier`, F17).
 */
@Module({
  imports: [
    DatabaseModule,
    AuditModule,
    OrganizationModule,
    IdentityAccessFacadeModule,
    CatalogModule,
    LicensingModule,
    OperatingParametersModule,
    RequestsModule,
    NotificationsModule,
  ],
  controllers: [
    TransfersController,
    TransferReviewsController,
    LongLeavesController,
    OffboardingController,
    OffboardingStepsController,
    OpenRequestsController,
    MeDepartureNoticeController,
    SuperAdminWatchController,
    NoticesController,
  ],
  providers: [
    PersonnelFileHooks,
    TransferRepo,
    DepartmentOpenWorkRepo,
    DepartmentOpenWorkReader,
    PersonnelNotifier,
    TransferGuardService,
    TransferSettlementService,
    TransferEffectiveListener,
    TransferService,
    TransferChangeService,
    TransferClosureService,
    TransferQueryService,
    TransferReviewRepo,
    TransferReviewListRepo,
    TransferReviewService,
    TransferReviewListener,
    TransferReviewReplacementService,
    PostSetupReviewService,
    TransferReviewDecisionService,
    TransferReviewViewService,
    TransferReviewOverdueService,
    TransferReviewSweeper,
    LeaveRepo,
    LeaveService,
    LeaveQueryService,
    LeaveDepartureService,
    LeaveOverdueService,
    LeaveReturnSweeper,
    OffboardingRepo,
    OffboardingListRepo,
    OffboardingBlockerRegistry,
    OffboardingAuditService,
    OffboardingFrame,
    OffboardingPeriodsService,
    OffboardingHandoverService,
    OffboardingLeftService,
    OffboardingService,
    OffboardingChangeService,
    OffboardingRevocationService,
    OffboardingViewService,
    OpenRequestsService,
    OpenRequestsSource,
    PersonnelFileDeadlinesRepo,
    PersonnelFileDeadlines,
    ServiceAccountDutyHook,
    ServiceAccountBlockerSource,
    RoleDutiesRepo,
    RoleDutiesService,
    RoleDutiesViewService,
    RoleDutiesHook,
    RoleWarningSource,
    WorkspaceBlockerSource,
    NoticeRepo,
    NoticeRecorderRegistry,
    NoticeService,
    NoticeHandlingService,
    NoticeQueryService,
    NoticeOverdueService,
    NoticeOverdueSweeper,
    TransferNoticeRecorder,
    LeaveNoticeRecorder,
    OffboardingNoticeRecorder,
    PersonnelService,
  ],
  // The facade and the registry of hooks, and the services of the writes the controlled procedure runs with an operator actor (spec L.2).
  exports: [
    PersonnelFileHooks,
    PersonnelService,
    TransferService,
    TransferChangeService,
    LeaveService,
    OffboardingService,
    OffboardingChangeService,
    NoticeHandlingService,
  ],
})
export class PersonnelModule {}
