import { Body, Controller, Get, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { AuthenticatedOnly } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AccessRequestQueryService } from '../request-view/access-request-query.service';
import { RequestIdParamDto } from '../access-request/access-request.dto';
import { toWire } from '../request-view/access-request.mapper';
import { ApprovalDetailResponseDto } from '../spend-approval-view/spend-approval.dto';
import { SpendApprovalViewService } from '../spend-approval-view/spend-approval-view.service';
import { toRecheckedApiException } from '../spend/spend.http-errors';
import {
  LineNeedDecisionBodyDto,
  LineParamsDto,
  LineSpendDecisionBodyDto,
  LineWithdrawBodyDto,
} from '../group-request/group-decision.dto';
import { GroupLineQueryService } from './group-line-query.service';
import { GroupNeedDecisionService } from './group-need-decision.service';
import { LinesQueryDto, LinesResponseDto, GroupResponseDto } from '../group-request/group-request.dto';
import { GROUP_REQUEST_ERROR_EXAMPLES, toGroupRequestApiException } from '../group-request/group-request.http-errors';
import { GroupSpendDecisionService } from './group-spend-decision.service';
import { GroupWithdrawalService } from '../group-request/group-withdrawal.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description:
    'The request does not exist, is not a request for a group, or the caller has no part in it (ACCESS_REQUEST.NOT_FOUND).',
  examples: [GROUP_REQUEST_ERROR_EXAMPLES.REQUEST_NOT_FOUND],
} as const;

/**
 * The people of a request for a group, one by one (`US-05-17`): what became of each and why, the decisions of the need and of the
 * spend on them, and the withdrawal of one of them. Each person is decided and ends apart from the others, in one decision that
 * covers every person of a step.
 */
@ApiTags('group-requests')
@Controller({ path: 'access-requests', version: '1' })
export class GroupLinesController {
  constructor(
    private readonly lines: GroupLineQueryService,
    private readonly needs: GroupNeedDecisionService,
    private readonly spends: GroupSpendDecisionService,
    private readonly withdrawals: GroupWithdrawalService,
    private readonly queries: AccessRequestQueryService,
    private readonly approvals: SpendApprovalViewService,
  ) {}

  @Get(':id/lines')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'accessRequestLineList', summary: 'List the people of a request for a group' })
  @ApiSuccessResponse(LinesResponseDto, {
    message: 'GROUP_REQUEST.LINES_LISTED',
    description:
      'The people of a request for a group in the order they were named, each with the state of their own, the step that holds them, what each costs, what was decided for them at the need and the spend, the share of the commitment they stand for once approved, and how and why they ended. The sender, whoever holds a step and an IT Admin see every person; a person the request is for sees only their own line.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, NOT_FOUND, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The id or the query is invalid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async list(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: RequestIdParamDto,
    @Query() query: LinesQueryDto,
  ) {
    try {
      return await this.lines.page(actor, params.id, query);
    } catch (error) {
      throw toGroupRequestApiException(error);
    }
  }

  @Post(':id/line-need-decisions')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'accessRequestLineNeedDecide', summary: 'Decide the need of the people of a step' })
  @ApiSuccessResponse(GroupResponseDto, {
    message: 'GROUP_REQUEST.NEED_DECIDED',
    description:
      'The person who holds a need step decides all the people of that step at once, approving some and refusing others, each refusal with its reason. A person who holds a seat of the plan since the request was sent is not approved. The step gets its electronic approval record and each person a decision of their own. When no person waits for a need any more the request is priced again for those who remain and goes on to be sent as spend, or ends when every person was refused.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'The caller asked for the request or is one of the people of the step (ACCESS_REQUEST.OWN_REQUEST), or does not hold the step (ACCESS_REQUEST.NOT_THE_ASSIGNEE).',
      examples: [GROUP_REQUEST_ERROR_EXAMPLES.NEED_OWN_REQUEST, GROUP_REQUEST_ERROR_EXAMPLES.NEED_NOT_THE_ASSIGNEE],
    },
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The step is not pending (ACCESS_REQUEST.STEP_NOT_PENDING), or a person approved holds a seat of the plan now (GROUP_REQUEST.LINE_HOLDS_ACCESS, with the people): the person who decides refuses that line and the others are not touched.',
      examples: [GROUP_REQUEST_ERROR_EXAMPLES.NEED_STEP_NOT_PENDING, GROUP_REQUEST_ERROR_EXAMPLES.LINE_HOLDS_ACCESS],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The body is invalid (VALIDATION_ERROR: a refusal without its reason, a person twice); the decision leaves out people of the step or names others (GROUP_REQUEST.LINES_MISMATCH, with who); a term over twelve months is approved without its confirmation (ACCESS_REQUEST.TERM_CONFIRMATION_REQUIRED); the head who approves gives no line of the plan or outside the plan (ACCESS_REQUEST.PLAN_LINE_REQUIRED). Nothing is saved.',
      examples: [
        VALIDATION_EXAMPLE,
        GROUP_REQUEST_ERROR_EXAMPLES.LINES_MISMATCH,
        GROUP_REQUEST_ERROR_EXAMPLES.NEED_TERM_CONFIRMATION_REQUIRED,
        GROUP_REQUEST_ERROR_EXAMPLES.PLAN_LINE_REQUIRED,
        GROUP_REQUEST_ERROR_EXAMPLES.SPEND_NOT_APPLICABLE,
        GROUP_REQUEST_ERROR_EXAMPLES.PLAN_LINE_NOT_FOUND,
        GROUP_REQUEST_ERROR_EXAMPLES.STILL_NEEDED_REQUIRED,
      ],
    },
  )
  async decideNeed(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: RequestIdParamDto,
    @Body() body: LineNeedDecisionBodyDto,
  ) {
    try {
      const record = await this.needs.decide(actor, params.id, {
        lines: body.lines,
        termConfirmationReason: body.termConfirmation?.reason,
        ...(body.spend
          ? {
              spend: {
                planLine: body.spend.planLine
                  ? { position: body.spend.planLine.position, stillNeeded: body.spend.planLine.stillNeeded ?? false }
                  : null,
                expectedSpendOn: body.spend.expectedSpendOn,
              },
            }
          : {}),
      });

      return { request: toWire(await this.queries.view(record)) };
    } catch (error) {
      throw toGroupRequestApiException(error);
    }
  }

  @Post(':id/line-spend-decisions')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'spendApprovalLineDecide', summary: 'Decide the spend of the people of a request' })
  @ApiSuccessResponse(ApprovalDetailResponseDto, {
    message: 'SPEND_APPROVAL.LINES_DECIDED',
    description:
      'The person the spend step is given to decides all the people whose need is confirmed at once, approving some and refusing others, each refusal with its reason. The request is checked again on the people approved and the decision is made on that check, which is kept with it; an approval of a request that has less money than it costs, or none, is an override with its reason and the years it names. One commitment is held for each year, the sum of the part of the people approved, and each person stands for a share of it. A request that turned out to be an exception since it was sent goes back to Finance, and one whose data is at fault goes back to its head; nobody is decided then.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'The caller does not hold the step (SPEND.NOT_THE_ASSIGNEE) or asked for the request or is one of its people (SPEND.OWN_REQUEST).',
      examples: [GROUP_REQUEST_ERROR_EXAMPLES.SPEND_NOT_THE_ASSIGNEE, GROUP_REQUEST_ERROR_EXAMPLES.SPEND_OWN_REQUEST],
    },
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The request has no spend step open (SPEND.NO_SPEND_STEP), the step is decided (SPEND.STEP_NOT_PENDING), the request cannot be checked now (SPEND.NOT_CHECKABLE), the caller completed the review of Finance of this request, and the two are two people (SPEND.REVIEWER_IS_APPROVER), or it was checked again and went back to Finance (SPEND.RECHECKED_NEEDS_FINANCE_REVIEW) or to its head (SPEND.RECHECKED_RETURNED_TO_HEAD).',
      examples: [
        GROUP_REQUEST_ERROR_EXAMPLES.NO_SPEND_STEP,
        GROUP_REQUEST_ERROR_EXAMPLES.REVIEWER_IS_APPROVER,
        GROUP_REQUEST_ERROR_EXAMPLES.NOT_CHECKABLE,
        GROUP_REQUEST_ERROR_EXAMPLES.RECHECKED_NEEDS_FINANCE_REVIEW,
        GROUP_REQUEST_ERROR_EXAMPLES.RECHECKED_RETURNED_TO_HEAD,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The body is invalid (VALIDATION_ERROR: a refusal without its reason); the decision leaves out people whose need is confirmed or names others (GROUP_REQUEST.LINES_MISMATCH, with who); the override is missing or names other years than the ones that need it (SPEND.OVERRIDE_REQUIRED, SPEND.OVERRIDE_MISMATCH, with the years) or has nothing to accept (SPEND.OVERRIDE_NOT_NEEDED).',
      examples: [
        VALIDATION_EXAMPLE,
        GROUP_REQUEST_ERROR_EXAMPLES.LINES_MISMATCH,
        GROUP_REQUEST_ERROR_EXAMPLES.OVERRIDE_REQUIRED,
        GROUP_REQUEST_ERROR_EXAMPLES.OVERRIDE_MISMATCH,
        GROUP_REQUEST_ERROR_EXAMPLES.OVERRIDE_NOT_NEEDED,
      ],
    },
  )
  async decideSpend(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: RequestIdParamDto,
    @Body() body: LineSpendDecisionBodyDto,
  ) {
    try {
      const result = await this.spends.decide(actor, params.id, body);
      if (result.status === 'BOUNCED') throw toRecheckedApiException(result);

      return { spendApproval: await this.approvals.detail(actor, params.id) };
    } catch (error) {
      throw toGroupRequestApiException(error);
    }
  }

  @Post(':id/lines/:employeeId/withdraw')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'accessRequestLineWithdraw', summary: 'Withdraw one person of a request for a group' })
  @ApiSuccessResponse(GroupResponseDto, {
    message: 'GROUP_REQUEST.LINE_WITHDRAWN',
    description:
      'The sender withdraws one person while their seat is not real; the head of the department does too, with a reason, in the stages the head acts on. Before the spend nothing is held, and the request is priced again for those who remain. Once the spend is approved the share of that person goes back to the budget and nobody else’s does; a task nobody has worked is cancelled with its assignment (never failed), and when the grant had failed the person waits until the IT Admin cancels the task. The other people are not touched.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'The caller is not the sender, the person withdrawn included, and not the head in a stage the head acts on (ACCESS_REQUEST.NOT_REQUESTER).',
      examples: [GROUP_REQUEST_ERROR_EXAMPLES.NOT_REQUESTER],
    },
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'Nothing is left to withdraw (ACCESS_REQUEST.ALREADY_ENDED), the withdrawal waits for the IT Admin (ACCESS_REQUEST.WITHDRAWAL_PENDING), the task of the grant is being worked (ACCESS_REQUEST.GRANT_RUNNING), or the seat is real and the way back is a return (ACCESS_REQUEST.GRANT_COMPLETED). Nothing changes.',
      examples: [
        GROUP_REQUEST_ERROR_EXAMPLES.WITHDRAWAL_ALREADY_ENDED,
        GROUP_REQUEST_ERROR_EXAMPLES.WITHDRAWAL_PENDING,
        GROUP_REQUEST_ERROR_EXAMPLES.GRANT_RUNNING,
        GROUP_REQUEST_ERROR_EXAMPLES.GRANT_COMPLETED,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The body is invalid (VALIDATION_ERROR: a blank reason), or the head gives no reason (ACCESS_REQUEST.REASON_REQUIRED). Nothing is saved.',
      examples: [VALIDATION_EXAMPLE, GROUP_REQUEST_ERROR_EXAMPLES.REASON_REQUIRED],
    },
  )
  async withdrawLine(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: LineParamsDto,
    @Body() body: LineWithdrawBodyDto,
  ) {
    try {
      const record = await this.withdrawals.withdrawLine(actor, params.id, params.employeeId, body);

      return { request: toWire(await this.queries.view(record)) };
    } catch (error) {
      throw toGroupRequestApiException(error);
    }
  }
}
