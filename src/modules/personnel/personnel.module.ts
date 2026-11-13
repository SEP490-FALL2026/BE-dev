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
import { DepartmentMemberController } from './department-member/department-member.controller';
import { DepartureClosureSweeper } from './departure-closure/departure-closure.job';
import { DepartureClosureRepo } from './departure-closure/departure-closure.repo';
import { DepartureClosureService } from './departure-closure/departure-closure.service';
import { MailboxLockRevocationListener } from './departure-closure/mailbox-lock-revocation.listener';
import { MailboxLockController } from './departure-closure/mailbox-lock.controller';
import { MailboxLockSettlement } from './departure-closure/mailbox-lock-settlement.service';
import { MailboxLockService } from './departure-closure/mailbox-lock.service';
import { AccountLockOverdueService } from './departure-deadline/account-lock-overdue.service';
import { BlockAnnouncementService } from './departure-deadline/block-announcement.service';
import { BlockMomentSweeper } from './departure-deadline/block-moment.job';
import { BlockMomentEffects } from './departure-deadline/block-moment-effects.service';
import { BlockMomentRepo } from './departure-deadline/block-moment.repo';
import { DepartureDeadlineRepo } from './departure-deadline/departure-deadline.repo';
import { DepartureDeadlineService } from './departure-deadline/departure-deadline.service';
import { DepartureImpactService } from './departure-deadline/departure-impact.service';
import { RevocationOverdueSweeper } from './departure-deadline/revocation-overdue.job';
import { RevocationOverdueService } from './departure-deadline/revocation-overdue.service';
import { DepartmentMemberQueryService } from './department-member/department-member-query.service';
import { DepartmentOpenWorkReader } from './event-notice/department-open-work.listener';
import { DepartmentOpenWorkRepo } from './event-notice/department-open-work.repo';
import { PersonnelGroundsDateService } from './personnel-grounds-date.service';
import { PersonnelNotifier } from './event-notice/personnel-notifier.service';
import { LeaveDepartureService } from './leave/leave-departure.service';
import { LeaveOverdueService } from './leave/leave-overdue.service';
import { LeaveNoticeRecorder } from './leave/leave-notice.listener';
import { LeaveQueryService } from './leave/leave-query.service';
import { LeaveReturnSweeper } from './leave/leave-return.job';
import { LeaveRepo } from './leave/leave.repo';
import { LeaveService } from './leave/leave.service';
import { LongLeavesController } from './leave/long-leaves.controller';
import { NoticesController } from './notice/notice.controller';
import { NoticeHandlingService } from './notice/notice-handling.service';
import { NoticeOverdueService } from './notice/notice-overdue.service';
import { NoticeOverdueSweeper } from './notice/notice-overdue.job';
import { NoticeQueryService } from './notice/notice-query.service';
import { NoticeRepo } from './notice/notice.repo';
import { NoticeService } from './notice/notice.service';
import { OffboardingAuditService } from './offboarding/offboarding-audit.service';
import { OffboardingCaseWriter } from './offboarding/offboarding-case-writer.service';
import { OffboardingCancelTakeBack } from './offboarding/change/offboarding-cancel-takeback.service';
import { OffboardingCancelWriter } from './offboarding/change/offboarding-cancel-writer.service';
import { OffboardingChangeJudge } from './offboarding/change/offboarding-change-judge.service';
import { OffboardingChangeWriter } from './offboarding/change/offboarding-change-writer.service';
import { OffboardingChangeService } from './offboarding/change/offboarding-change.service';
import { OffboardingEndings } from './offboarding/offboarding-endings.service';
import { OffboardingFrame } from './offboarding/offboarding-frame.service';
import { OffboardingHandoverService } from './offboarding/offboarding-handover.service';
import { OffboardingLeftService } from './offboarding/offboarding-left.service';
import { OffboardingListRepo } from './offboarding/offboarding-list.repo';
import { OffboardingPeriodsService } from './offboarding/offboarding-periods.service';
import { OffboardingPreconditions } from './offboarding/offboarding-preconditions.service';
import { OffboardingRevocationService } from './offboarding/offboarding-revocation.service';
import { OffboardingDetailService } from './offboarding/detail/offboarding-detail.service';
import { OffboardingViewService } from './offboarding/offboarding-view.service';
import { OffboardingController } from './offboarding/offboarding.controller';
import { OffboardingStepsController } from './offboarding/offboarding-steps.controller';
import { OffboardingNoticeRecorder } from './offboarding/offboarding-notice.listener';
import { OffboardingRepo } from './offboarding/offboarding.repo';
import { OpenRequestsController } from './offboarding/open-requests/open-requests.controller';
import { OpenRequestsService } from './offboarding/open-requests/open-requests.service';
import { OpenRequestsSource } from './offboarding/open-requests/open-requests.listener';
import { OffboardingService } from './offboarding/offboarding.service';
import {
  NoticeRecorderContributions,
  OffboardingWarningContributions,
  PersonnelFileHookContributions,
} from './public/personnel.extension-points';
import { PersonnelFileHooks } from './event-notice/personnel-file-hooks.service';
import { OffboardingSources } from './offboarding/offboarding-sources.service';
import { MeDepartureNoticeController } from './role-duties/me-departure-notice.controller';
import { RoleDutiesHook } from './role-duties/role-duties.listener';
import { DeviceRegistrationHook } from './offboarding/device-registration.listener';
import { DevicesModule } from '../devices/devices.module';
import { RoleDutiesRepo } from './role-duties/role-duties.repo';
import { RoleDutiesService } from './role-duties/role-duties.service';
import { RoleDutiesViewService } from './role-duties/role-duties-view.service';
import { RoleWarningSource } from './role-duties/role-warning.listener';
import { SuperAdminWatchController } from './role-duties/super-admin-watch.controller';
import { PersonnelApi } from './public/personnel.api';
import { PersonnelDashboardApi } from './public/personnel-dashboard.api';
import { PersonnelDashboardFactsRepo } from './dashboard-facts/dashboard-facts.repo';
import { TransferEffectsService } from './transfer-grace/transfer-effects.service';
import { TransferGraceRepo } from './transfer-grace/transfer-grace.repo';
import { TransferGraceService } from './transfer-grace/transfer-grace.service';
import { TransferImpactService } from './transfer-grace/transfer-impact.service';
import { TransferChangeWriter } from './transfer/transfer-change-writer.service';
import { TransferChangeService } from './transfer/transfer-change.service';
import { TransferEffectiveListener } from './transfer/transfer-effective.listener';
import { TransferGuardService } from './transfer/transfer-guard.service';
import { TransferNoticeRecorder } from './notice/transfer-notice.listener';
import { PersonnelOverlapRepo } from './transfer/personnel-overlap.repo';
import { TransferQueryService } from './transfer/transfer-query.service';
import { TransferSettlementService } from './transfer/transfer-settlement.service';
import { TransferRepo } from './transfer/transfer.repo';
import { TransferPreconditions } from './transfer/transfer-preconditions.service';
import { TransferRecorder } from './transfer/transfer-recorder.service';
import { TransferService } from './transfer/transfer.service';
import { TransfersController } from './transfer/transfers.controller';

/**
 * What happens to the place of a person in the organization (ADR-0017): the transfer to another department or job title
 * now, the long leave and the leaving of a person next. It writes history through the organization and never touches the
 * tables of another module. Only the API loads it: its listener of the organization settles a transfer on its day, and the
 * hourly telling of the organization runs in the same graph. It exports the extension point the flows which follow a personnel
 * file (the owner of a service account) add their hooks to (`PersonnelFileHookContributions`). It also holds the review of the tools of a
 * person (every personal seat they hold) that the new head of a department makes after a transfer: opened by its listener when a person changes
 * department, decided by the head, and told as late by an hourly sweep; a decision to take a tool away goes through the licensing
 * gate in the same transaction. The long leave of a person (the day they are due back, the basis of it, the return) is kept here too:
 * a late return is only told by an hourly sweep, never acted on, and the facade `PersonnelApi` gives the days of leave to the rules
 * that read them. The departure of a person (a handover with the last working day or an abrupt departure, the rights the person
 * holds, the lock of the company account, the revocations the IT Admin asks for and the closing of the case) is kept here as well:
 * nothing is revoked by itself, the system closes the case when the person has left, every revocation is completed and the lock of the mailbox for good is
 * written (`departure-closure/`), and the flows that come after add what only shows beside a case to `OffboardingWarningContributions`.
 * The notice a head of department sends about a change coming for one of their people is kept here too: information with no effect, which
 * the IT Admin rejects or verifies and records through the transfer, the long leave or the departure (each adds its own recorder
 * to `NoticeRecorderContributions`), told as late by an hourly sweep and never acted on.
 *
 * Who writes an event is the Super Admin (`QĐ-87a`), judged by the policy of each service; about the Super Admin themselves only the
 * controlled procedure `pnpm ops:record-super-admin-event` writes it, with a ticket. The command lives in `super-admin-event/`
 * with a module of its own that the API and the worker never load; it reaches the writes below through the services this module
 * exports for it. Everyone concerned by an event is told in the inbox in the same transaction (`PersonnelNotifier`).
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
    DevicesModule,
  ],
  controllers: [
    TransfersController,
    LongLeavesController,
    OffboardingController,
    OffboardingStepsController,
    MailboxLockController,
    OpenRequestsController,
    DepartmentMemberController,
    MeDepartureNoticeController,
    SuperAdminWatchController,
    NoticesController,
  ],
  providers: [
    DepartureClosureRepo,
    DepartureClosureService,
    DepartureClosureSweeper,
    MailboxLockService,
    MailboxLockSettlement,
    MailboxLockRevocationListener,
    AccountLockOverdueService,
    BlockAnnouncementService,
    BlockMomentEffects,
    BlockMomentRepo,
    BlockMomentSweeper,
    DepartureDeadlineRepo,
    DepartureDeadlineService,
    DepartureImpactService,
    TransferImpactService,
    TransferEffectsService,
    TransferGraceRepo,
    TransferGraceService,
    RevocationOverdueService,
    RevocationOverdueSweeper,
    PersonnelFileHookContributions,
    PersonnelFileHooks,
    PersonnelGroundsDateService,
    TransferRepo,
    DepartmentOpenWorkRepo,
    DepartmentOpenWorkReader,
    PersonnelNotifier,
    TransferGuardService,
    TransferSettlementService,
    TransferEffectiveListener,
    TransferPreconditions,
    TransferRecorder,
    TransferService,
    TransferChangeWriter,
    TransferChangeService,
    TransferQueryService,
    PersonnelOverlapRepo,
    LeaveRepo,
    LeaveService,
    LeaveQueryService,
    LeaveDepartureService,
    LeaveOverdueService,
    LeaveReturnSweeper,
    OffboardingRepo,
    OffboardingListRepo,
    OffboardingWarningContributions,
    OffboardingSources,
    OffboardingAuditService,
    OffboardingFrame,
    OffboardingPeriodsService,
    OffboardingHandoverService,
    OffboardingLeftService,
    OffboardingPreconditions,
    OffboardingEndings,
    OffboardingCaseWriter,
    OffboardingService,
    OffboardingChangeJudge,
    OffboardingCancelTakeBack,
    OffboardingCancelWriter,
    OffboardingChangeWriter,
    OffboardingChangeService,
    OffboardingRevocationService,
    OffboardingDetailService,
    OffboardingViewService,
    OpenRequestsService,
    OpenRequestsSource,
    DepartmentMemberQueryService,
    RoleDutiesRepo,
    RoleDutiesService,
    RoleDutiesViewService,
    RoleDutiesHook,
    DeviceRegistrationHook,
    RoleWarningSource,
    NoticeRepo,
    NoticeRecorderContributions,
    NoticeService,
    NoticeHandlingService,
    NoticeQueryService,
    NoticeOverdueService,
    NoticeOverdueSweeper,
    TransferNoticeRecorder,
    LeaveNoticeRecorder,
    OffboardingNoticeRecorder,
    PersonnelApi,
    PersonnelDashboardFactsRepo,
    PersonnelDashboardApi,
  ],
  // The facade and the extension point of the file hooks, and the services of the writes the controlled procedure runs with an operator
  // actor.
  exports: [
    PersonnelFileHookContributions,
    PersonnelApi,
    PersonnelDashboardApi,
    TransferService,
    TransferChangeService,
    LeaveService,
    OffboardingService,
    OffboardingChangeService,
    NoticeHandlingService,
  ],
})
export class PersonnelModule {}
