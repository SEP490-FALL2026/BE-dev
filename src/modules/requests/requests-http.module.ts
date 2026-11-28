import { Module } from '@nestjs/common';
import { AssessmentQueueController } from './assessment-queue/assessment-queue.controller';
import { BudgetCheckController } from './budget-check/budget-check.controller';
import { CancellationController } from './cancellation/cancellation.controller';
import { RequestDraftsController } from './draft/request-drafts.controller';
import { GrantQueueController } from './grant-queue/grant-queue.controller';
import { GroupLinesController } from './group-line-decisions/group-lines.controller';
import { GroupRequestsController } from './group-request-submission/group-requests.controller';
import { InvoiceDiscrepanciesController } from './invoice-discrepancy-queue/invoice-discrepancies.controller';
import { GroupLineClosureController } from './line-closure/group-line-closure.controller';
import { NeedDecisionQueueController } from './need-decision-queue/need-decision-queue.controller';
import { NeedDecisionController } from './need-decision/need-decision.controller';
import { SimilarSeatsController } from './need-decision/similar-seats.controller';
import { ProposalsController } from './proposal-review/proposals.controller';
import { PurchaseInvoiceDecisionsController } from './purchase-invoice/purchase-invoice-decisions.controller';
import { PurchaseInvoicesController } from './purchase-invoice/purchase-invoices.controller';
import { ControlledWaitController } from './reassignment/controlled-wait.controller';
import { RenewalRequestsController } from './renewal-request/renewal-requests.controller';
import { AccessRequestEventsController } from './request-history/access-request-events.controller';
import { RequestAuditFlagsController } from './request-history/request-audit-flags.controller';
import { MyRequestsController } from './request-history/request-history-mine.controller';
import { RequestHistoryController } from './request-history/request-history.controller';
import { AccessRequestsController } from './request-submission/access-requests.controller';
import { RequestTicketViewController } from './request-ticket-view/request-ticket-view.controller';
import { RequestsWorkFacadeModule } from './requests-work-facade.module';
import { RequestsModule } from './requests.module';
import { ReturnRequestsController } from './return-request/return-requests.controller';
import { CongestionController } from './sla/congestion.controller';
import { SpendApprovalsController } from './spend-approval/spend-approvals.controller';
import { SpendSubmissionController } from './spend-submission/spend-submission.controller';
import { RequestTimingsController } from './timing/request-timings.controller';
import { WithdrawalController } from './withdraw/withdrawal.controller';
import { TicketWithdrawalsController } from './withdraw/ticket-withdrawals.controller';

/**
 * The HTTP side of the requests module, mounted by the API only. Controllers stay separate from `RequestsModule`
 * so parallel feature packages can register new routes without pushing `requests.module.ts` past its line limit.
 */
@Module({
  imports: [RequestsModule, RequestsWorkFacadeModule],
  controllers: [
    // The path `access-requests/drafts` is declared before `access-requests/:id`, so that it is a route of its own and never an id.
    RequestDraftsController,
    AccessRequestsController,
    RequestTicketViewController,
    NeedDecisionController,
    WithdrawalController,
    TicketWithdrawalsController,
    SimilarSeatsController,
    CancellationController,
    ProposalsController,
    BudgetCheckController,
    SpendSubmissionController,
    SpendApprovalsController,
    NeedDecisionQueueController,
    GrantQueueController,
    AssessmentQueueController,
    ReturnRequestsController,
    RenewalRequestsController,
    PurchaseInvoicesController,
    PurchaseInvoiceDecisionsController,
    InvoiceDiscrepanciesController,
    ControlledWaitController,
    RequestTimingsController,
    CongestionController,
    GroupRequestsController,
    GroupLinesController,
    GroupLineClosureController,
    MyRequestsController,
    RequestHistoryController,
    AccessRequestEventsController,
    RequestAuditFlagsController,
  ],
})
export class RequestsHttpModule {}
