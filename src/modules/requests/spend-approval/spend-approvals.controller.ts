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
import {
  ApprovalDetailResponseDto,
  ApprovalListResponseDto,
  ApprovalQueryDto,
  BatchDecisionBodyDto,
  BatchDecisionResponseDto,
  SpendDecisionBodyDto,
} from '../spend-approval-view/spend-approval.dto';
import { SpendApprovalQueueService } from '../spend-approval-view/spend-approval-queue.service';
import { SpendApprovalViewService } from '../spend-approval-view/spend-approval-view.service';
import { SpendBatchDecisionService } from './spend-batch-decision.service';
import { SpendDecisionService } from './spend-decision.service';
import { IdParamDto } from '../spend/spend-submission.dto';
import { SPEND_ERROR_EXAMPLES, toRecheckedApiException, toSpendApiException } from '../spend/spend.http-errors';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The request is invalid (VALIDATION_ERROR).',
  examples: [VALIDATION_EXAMPLE],
} as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The request has no spend step the caller holds (SPEND.REVIEW_NOT_FOUND).',
  examples: [SPEND_ERROR_EXAMPLES.REVIEW_NOT_FOUND],
} as const;

/**
 * The decision of the spending approver on the spend step (`US-06-01`, `US-06-08`): the queue of what waits for them, one
 * request with what surrounds it, the decision of one request, and the decision of the requests they hold in a batch. Only
 * the person the step is given to reads and decides it; the approver, or the substitute when the approver is a party. The
 * system never decides.
 */
@ApiTags('spend-approvals')
@Controller({ version: '1' })
export class SpendApprovalsController {
  constructor(
    private readonly queues: SpendApprovalQueueService,
    private readonly views: SpendApprovalViewService,
    private readonly decisions: SpendDecisionService,
    private readonly batchDecisions: SpendBatchDecisionService,
  ) {}

  @Get('spend-approvals')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'spendApprovalList', summary: 'List the requests waiting for my decision as spend' })
  @ApiSuccessResponse(ApprovalListResponseDto, {
    message: 'SPEND_APPROVAL.LISTED',
    description:
      'The spend steps given to the caller that are open, the oldest first: what each request is, what it costs, the first code of its check, whether the same person holds the need step and this one, whether the head confirmed the reserve for it, and the batch it was sent in.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, INVALID)
  async list(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: ApprovalQueryDto) {
    try {
      return await this.queues.queue(actor, query);
    } catch (error) {
      throw toSpendApiException(error);
    }
  }

  @Get('access-requests/:id/spend-approval')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'spendApprovalGet', summary: 'Get the spend step of a request' })
  @ApiSuccessResponse(ApprovalDetailResponseDto, {
    message: 'SPEND_APPROVAL.FETCHED',
    description:
      'The step and the request around it for the person it is given to: what the head confirmed, what it costs with the tax that is deducted and the part that is not, what the IT Admin concluded of software that was not in the catalog, the budget snapshot as it is now (base, reserve, spent, committed, waiting to be decided, what is left of the base and with the reserve, and the outcome a check made now gives), and, once decided, what was decided. The check and its year are read from their own routes.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, NOT_FOUND, INVALID)
  async get(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: IdParamDto) {
    try {
      return { spendApproval: await this.views.detail(actor, params.id) };
    } catch (error) {
      throw toSpendApiException(error);
    }
  }

  @Post('access-requests/:id/spend-approval')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'spendApprovalDecide', summary: 'Approve or refuse a request as spend' })
  @ApiSuccessResponse(ApprovalDetailResponseDto, {
    message: 'SPEND_APPROVAL.DECIDED',
    description:
      'The person the step is given to approves it or refuses it with a reason. The request is checked again for the day of the decision and the decision is made on that check, which is kept with it. There is no override: a request that is blocked now (over the reserve, no approved budget in the current Cost Center, a quote that is no longer valid), or that uses the reserve with no confirmation of the head on this step, goes back to its head and is not decided; the requester and the head are told.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'The caller does not hold the step (SPEND.NOT_THE_ASSIGNEE) or asked for or is given the access (SPEND.OWN_REQUEST).',
      examples: [SPEND_ERROR_EXAMPLES.NOT_THE_ASSIGNEE, SPEND_ERROR_EXAMPLES.OWN_REQUEST],
    },
    // The decision reads the request itself first: a request that does not exist is ACCESS_REQUEST.NOT_FOUND here.
    { ...NOT_FOUND, examples: [SPEND_ERROR_EXAMPLES.REQUEST_NOT_FOUND] },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The request has no spend step open (SPEND.NO_SPEND_STEP), the step is decided (SPEND.STEP_NOT_PENDING), the request cannot be checked now (SPEND.NOT_CHECKABLE), or it was checked again and went back to its head (SPEND.RECHECKED_RETURNED_TO_HEAD, with the reasons: OVER_RESERVE, NO_APPROVED_BUDGET, PRICE_EXPIRED, RESERVE_UNCONFIRMED).',
      examples: [
        SPEND_ERROR_EXAMPLES.NO_SPEND_STEP,
        SPEND_ERROR_EXAMPLES.NOT_CHECKABLE,
        SPEND_ERROR_EXAMPLES.RECHECKED_RETURNED_TO_HEAD,
        SPEND_ERROR_EXAMPLES.GROUP_USES_LINES,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The body is invalid (VALIDATION_ERROR: a refusal without a reason, or a field that is not of the body, such as the override that no longer exists).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async decide(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: IdParamDto,
    @Body() body: SpendDecisionBodyDto,
  ) {
    try {
      const result = await this.decisions.decide(actor, params.id, body);
      if (result.status === 'BOUNCED') throw toRecheckedApiException(result.reasons, result.to, result.overBy);

      return { spendApproval: await this.views.detail(actor, params.id) };
    } catch (error) {
      throw toSpendApiException(error);
    }
  }

  @Post('spend-batches/:id/decisions')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'spendBatchDecide', summary: 'Approve or refuse the requests of a batch together' })
  @ApiSuccessResponse(BatchDecisionResponseDto, {
    message: 'SPEND_BATCH.DECIDED',
    description:
      'Approves or refuses the requests chosen of a batch the caller holds, one by one in the order given. Each is checked and decided on its own, with its own record. One that is not in the batch or is not the caller one, has no spend step, or went back to its head when checked again (the requester and the head are told) is skipped with its reason and the others go on. A refusal gives one reason for all.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The batch does not exist, or the caller holds nothing of it (SPEND.BATCH_NOT_FOUND).',
      examples: [SPEND_ERROR_EXAMPLES.BATCH_NOT_FOUND],
    },
    INVALID,
  )
  async decideBatch(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: IdParamDto,
    @Body() body: BatchDecisionBodyDto,
  ) {
    try {
      return { results: await this.batchDecisions.decide(actor, params.id, body) };
    } catch (error) {
      throw toSpendApiException(error);
    }
  }
}
