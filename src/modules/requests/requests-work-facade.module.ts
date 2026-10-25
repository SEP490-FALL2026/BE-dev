import { Module, OnModuleInit } from '@nestjs/common';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { IdentityAccessFacadeModule } from '../identity-access/identity-access-facade.module';
import { IdentityAccessService } from '../identity-access/identity-access.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { OperatingParametersModule } from '../operating-parameters/operating-parameters.module';
import { OrganizationModule } from '../organization/organization.module';
import { OrganizationService } from '../organization/organization.service';
import { RoutingFactsService } from './access-request/routing-facts.service';
import { ControlledWaitAlertService } from './reassignment/controlled-wait-alert.service';
import { ControlledWaitQueryService } from './reassignment/controlled-wait-query.service';
import { ControlledWaitRepo } from './reassignment/controlled-wait.repo';
import { RequestsApprovalRoleListener } from './reassignment/approval-role.listener';
import { RequestsOrganizationChangeListener } from './reassignment/organization-change.listener';
import { StepReassignmentRepo } from './reassignment/step-reassignment.repo';
import { StepReassignmentService } from './reassignment/step-reassignment.service';
import { StepTargetService } from './reassignment/step-target.service';
import { RequestStatusFactsService } from './status/request-status-facts.service';
import { RequestStatusProjection } from './status/request-status-projector.service';
import { RequestStatusRecipientsService } from './status/request-status-recipients.service';
import { RequestStatusRepo } from './status/request-status.repo';
import { StatusCursorRepo } from './status/status-cursor.repo';
import { RequestStatusProjectorService } from './request-status-projector.service';
import { StepRedeterminationSweepService } from './step-redetermination-sweep.service';
import { StepSlaSweepService } from './step-sla-sweep.service';
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
 * `US-05-11`, `US-05-12`): no controller, no catalog, no files. It registers the listeners of the organization and of the
 * approval roles, so that in every graph that loads it a change moves the steps held by the people it concerns in the
 * transaction of the change. `StepRedeterminationSweepService` is what the worker's loop calls; the rest is shared with
 * `RequestsModule` inside the context: who a step is given to, the facts the routing table reads, and the queue of the steps
 * that wait. `RequestStatusProjectorService` is what the worker's loop calls to tell the people concerned how their requests are
 * going (`US-05-15`): the audit events of the requests become notices of the inbox, read from the audit trail in order.
 * `StepSlaSweepService` is what the loop calls to remind the holders of the steps that are late and to tell the Super Admin of a
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
    StepReassignmentRepo,
    StepTargetService,
    ControlledWaitRepo,
    ControlledWaitAlertService,
    ControlledWaitQueryService,
    StepReassignmentService,
    RequestsOrganizationChangeListener,
    RequestsApprovalRoleListener,
    StepRedeterminationSweepService,
    RequestStatusRepo,
    StatusCursorRepo,
    RequestStatusRecipientsService,
    RequestStatusFactsService,
    RequestStatusProjection,
    RequestStatusProjectorService,
    SlaSubjectRepo,
    SlaReminderRepo,
    SlaRecipientFactsService,
    ReminderWriter,
    StepSlaService,
    CongestionRepo,
    BacklogAlertService,
    SlaQueueAgeService,
    StepSlaSweepService,
  ],
  exports: [
    StepRedeterminationSweepService,
    RequestStatusProjectorService,
    StepSlaSweepService,
    SlaQueueAgeService,
    CongestionRepo,
    StepTargetService,
    RoutingFactsService,
    ControlledWaitQueryService,
  ],
})
export class RequestsWorkFacadeModule implements OnModuleInit {
  constructor(
    private readonly organization: OrganizationService,
    private readonly identity: IdentityAccessService,
    private readonly organizationListener: RequestsOrganizationChangeListener,
    private readonly roleListener: RequestsApprovalRoleListener,
  ) {}

  /** Tells the organization and the approval roles whom to call when something changes, without importing this module. */
  onModuleInit(): void {
    this.organization.registerChangeListener(this.organizationListener);
    this.identity.registerApprovalRoleListener(this.roleListener);
  }
}
