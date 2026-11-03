import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { IdentityAccessFacadeModule } from '../identity-access/identity-access-facade.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OperatingParametersModule } from '../operating-parameters/operating-parameters.module';
import { OrganizationModule } from '../organization/organization.module';
import { RequestDraftDepartureService } from './draft/request-draft-departure.service';
import { RequestDraftRepo } from './request-draft/request-draft.repo';
import { RoutingFactsService } from './access-request/routing-facts.service';
import { ControlledWaitAlertService } from './reassignment/controlled-wait-alert.service';
import { ControlledWaitQueryService } from './reassignment/controlled-wait-query.service';
import { ControlledWaitRepo } from './reassignment/controlled-wait.repo';
import { RequestsApprovalRoleListener } from './reassignment/approval-role.listener';
import { RequestsOrganizationChangeListener } from './reassignment/organization-change.listener';
import { RequestsSpendingApproverGrantCheck } from './reassignment/spending-approver-grant.listener';
import { SpendingApproverWorkRepo } from './reassignment/spending-approver-work.repo';
import { StepReassignmentRepo } from './step-routing/step-reassignment.repo';
import { StepReassignmentService } from './reassignment/step-reassignment.service';
import { StepTargetService } from './step-routing/step-target.service';
import { RequestStatusFactsService } from './status/request-status-facts.service';
import { RequestStatusProjection } from './status/request-status-projector.service';
import { RequestStatusRecipientsService } from './status/request-status-recipients.service';
import { RequestStatusRepo } from './status/request-status.repo';
import { StatusCursorRepo } from './status/status-cursor.repo';
import { RequestStatusProjectorApi } from './public/request-status-projector.api';
import { StepRedeterminationSweepApi } from './public/step-redetermination-sweep.api';
import { StepSlaSweepApi } from './public/step-sla-sweep.api';
import { BacklogAlertService } from './sla/backlog-alert.service';
import { CongestionRepo } from './sla/congestion.repo';
import { ReminderWriter } from './sla/reminder-writer.service';
import { SlaQueueAgeService } from './sla/sla-queue-age.service';
import { SlaRecipientFactsService } from './sla/sla-recipient-facts.service';
import { SlaReminderRepo } from './sla/sla-reminder.repo';
import { SlaSubjectRepo } from './sla/sla-subject.repo';
import { StepSlaService } from './sla/step-sla.service';

/**
 * The part of the requests context the worker runs and the API shares with it (the reassignment of steps, `FR-3.16`,
 * `US-05-11`, `US-05-12`): no controller, no catalog, no files. Its listeners add themselves to the change listeners of the
 * organization and of the approval roles, so that in every graph that loads it a change moves the steps held by the people it concerns in the
 * transaction of the change. `StepRedeterminationSweepApi` is what the worker's loop calls; the rest is shared with
 * `RequestsModule` inside the context: who a step is given to, the facts the routing table reads, and the queue of the steps
 * that wait. `RequestStatusProjectorApi` is what the worker's loop calls to tell the people concerned how their requests are
 * going (`US-05-15`): the audit events of the requests become notices of the inbox, read from the audit trail in order.
 * `StepSlaSweepApi` is what the loop calls to remind the holders of the steps that are late and to tell the Super Admin of a
 * backlog (`US-05-09`, `US-05-10`); `SlaQueueAgeService` and `CongestionRepo` are read again by the API of the same context for the
 * age of the queue of the head and the board of the Super Admin, so each is declared once, here, for both graphs.
 */
@Module({
  imports: [
    DatabaseModule,
    AuditModule,
    OrganizationModule,
    IdentityAccessFacadeModule,
    NotificationsModule,
    OperatingParametersModule,
  ],
  providers: [
    RoutingFactsService,
    // The drafts of a person who leaves go with them, in the transaction of the change that says they left; the draft
    // operations of the API read and write them through the same repo, so it is declared once, here, for both graphs.
    RequestDraftRepo,
    RequestDraftDepartureService,
    StepReassignmentRepo,
    StepTargetService,
    ControlledWaitRepo,
    ControlledWaitAlertService,
    ControlledWaitQueryService,
    StepReassignmentService,
    RequestsOrganizationChangeListener,
    RequestsApprovalRoleListener,
    SpendingApproverWorkRepo,
    RequestsSpendingApproverGrantCheck,
    StepRedeterminationSweepApi,
    RequestStatusRepo,
    StatusCursorRepo,
    RequestStatusRecipientsService,
    RequestStatusFactsService,
    RequestStatusProjection,
    RequestStatusProjectorApi,
    SlaSubjectRepo,
    SlaReminderRepo,
    SlaRecipientFactsService,
    ReminderWriter,
    StepSlaService,
    CongestionRepo,
    BacklogAlertService,
    SlaQueueAgeService,
    StepSlaSweepApi,
  ],
  exports: [
    StepRedeterminationSweepApi,
    RequestStatusProjectorApi,
    StepSlaSweepApi,
    SlaQueueAgeService,
    CongestionRepo,
    StepTargetService,
    RoutingFactsService,
    ControlledWaitQueryService,
    RequestDraftRepo,
  ],
})
export class RequestsWorkFacadeModule {}
