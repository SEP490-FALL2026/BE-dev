import { Body, Controller, Get, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { AuthenticatedOnly, RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { PlanLineRouteService } from './plan-line-route.service';
import { SpendBatchService } from './spend-batch.service';
import { SpendBatchViewService } from './spend-batch-view.service';
import { SpendQueueService } from './spend-queue.service';
import {
  BatchItemListResponseDto,
  BatchResponseDto,
  IdParamDto,
  PageQueryDto,
  PlanLineBodyDto,
  PlanLineResponseDto,
  QueueResponseDto,
  SubmitBatchBodyDto,
  SuggestionListResponseDto,
  SupplementBodyDto,
  SupplementListResponseDto,
  SupplementResponseDto,
} from './spend-submission.dto';
import { toGroupRequestApiException } from '../group-request/group-request.http-errors';
import { toSpendApiException } from './spend.http-errors';
import { SupplementService } from './supplement.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The request is invalid (VALIDATION_ERROR).',
} as const;
const NOT_HEAD = {
  status: HttpStatus.FORBIDDEN,
  description: 'The caller does not head a department (SPEND.NOT_HEAD).',
} as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The request does not exist, or is not one of the department of the caller (ACCESS_REQUEST.NOT_FOUND).',
} as const;

/**
 * Sending requests that cost money on to be decided as spend (`US-06-14`, `US-05-04` AC-11 to AC-16). Only the head of a
 * department keeps its queue, sends its requests on in a batch, attaches them to the plan of the budget and changes the day
 * the money goes out in a supplementary file; the Employee, Finance, the IT Admin and the Super Admin cannot. Nothing here shows
 * a figure of the budget.
 */
@ApiTags('spend-submission')
@Controller({ version: '1' })
export class SpendSubmissionController {
  constructor(
    private readonly queue: SpendQueueService,
    private readonly batches: SpendBatchService,
    private readonly batchViews: SpendBatchViewService,
    private readonly planLines: PlanLineRouteService,
    private readonly supplements: SupplementService,
  ) {}

  @Get('spend-queue')
  @RequireRoles('MANAGER')
  @ApiOperation({ operationId: 'spendQueueList', summary: 'List the requests waiting to be sent on as spend' })
  @ApiSuccessResponse(QueueResponseDto, {
    message: 'SPEND_QUEUE.LISTED',
    description:
      'The requests of the department of the head that cost money and whose need is approved, not yet sent on, with the reason for one that stopped or that Finance gave back. Each request also says since when it waits in the queue, how many working days that is, whether it has waited longer than the days the head may take (the days in force when it entered the queue) and how many reminders the head has had about it. Never a figure of the budget, what is left or a code of the check.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, NOT_HEAD, INVALID)
  async list(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: PageQueryDto) {
    try {
      return await this.queue.page(actor, query);
    } catch (error) {
      throw toSpendApiException(error);
    }
  }

  @Post('spend-batches')
  @RequireRoles('MANAGER')
  @ApiOperation({ operationId: 'spendBatchSubmit', summary: 'Send requests on to be decided as spend' })
  @ApiSuccessResponse(BatchResponseDto, {
    status: HttpStatus.CREATED,
    message: 'SPEND_BATCH.SUBMITTED',
    description:
      'Sends the requests chosen, one or more, on in one batch. Each request is checked against the budget and given the step the check says (to the spending approver, or to Finance for a review first); one that has no line of the plan or "outside the plan", or whose data is at fault, stays in the queue with the reason and the others go on. The items of the batch say how each fared.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    NOT_HEAD,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'A request chosen is not waiting in the queue: it was sent on, or does not cost money (SPEND.NOT_IN_QUEUE).',
    },
    INVALID,
  )
  async submit(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: SubmitBatchBodyDto) {
    try {
      const id = await this.batches.submit(actor, body.requestIds);

      return { batch: await this.batchViews.get(actor, id) };
    } catch (error) {
      throw toSpendApiException(error);
    }
  }

  @Get('spend-batches/:id')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'spendBatchGet', summary: 'Get a batch of requests sent on as spend' })
  @ApiSuccessResponse(BatchResponseDto, {
    message: 'SPEND_BATCH.FETCHED',
    description:
      'Who sent the batch, when, and how many requests it holds. It has no decision and no commitment: each request keeps its own steps, state and reason. Read by the head who sent it and by a person who holds the spend step of a request in it.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The batch does not exist, or the caller has no part in it (SPEND.BATCH_NOT_FOUND).',
    },
    INVALID,
  )
  async get(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: IdParamDto) {
    try {
      return { batch: await this.batchViews.get(actor, params.id) };
    } catch (error) {
      throw toSpendApiException(error);
    }
  }

  @Get('spend-batches/:id/items')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'spendBatchItemList', summary: 'List the requests of a batch' })
  @ApiSuccessResponse(BatchItemListResponseDto, {
    message: 'SPEND_BATCH.ITEMS_LISTED',
    description:
      'The requests of the batch in the order they were sent, each with how it fared (sent to the approver, sent to Finance, or stopped with its reason), whether it left the batch and why, and the state the request is in now. The head sees all of them; the person who holds a spend step sees the requests they hold.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The batch does not exist, or the caller has no part in it (SPEND.BATCH_NOT_FOUND).',
    },
    INVALID,
  )
  async items(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: IdParamDto,
    @Query() query: PageQueryDto,
  ) {
    try {
      return await this.batchViews.items(actor, params.id, query);
    } catch (error) {
      throw toSpendApiException(error);
    }
  }

  @Put('access-requests/:id/plan-line')
  @RequireRoles('MANAGER')
  @ApiOperation({ operationId: 'accessRequestPlanLineSet', summary: 'Attach a request to a line of the plan' })
  @ApiSuccessResponse(PlanLineResponseDto, {
    message: 'ACCESS_REQUEST.PLAN_LINE_SET',
    description:
      'The head attaches a request that waits in their queue to a line of the plan of the budget of its Cost Center and of the year the money goes out in, or says it is outside the plan. A line whose window has gone by is kept only when the head confirms it is still needed. Outside the plan is information for Finance and the approver, never an exception.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    NOT_HEAD,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description: 'The request is not waiting in the queue of the head (SPEND.NOT_IN_QUEUE).',
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The body is invalid (VALIDATION_ERROR), the line is not there (ACCESS_REQUEST.LINE_NOT_FOUND), or its window has gone by and it is not confirmed as still needed (ACCESS_REQUEST.STILL_NEEDED_REQUIRED).',
    },
  )
  async setPlanLine(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: IdParamDto,
    @Body() body: PlanLineBodyDto,
  ) {
    try {
      return { planLine: await this.planLines.attach(actor, params.id, body) };
    } catch (error) {
      throw toSpendApiException(error);
    }
  }

  @Get('access-requests/:id/plan-line-suggestions')
  @RequireRoles('MANAGER')
  @ApiOperation({
    operationId: 'accessRequestPlanLineSuggestionList',
    summary: 'List the lines a request may be attached to',
  })
  @ApiSuccessResponse(SuggestionListResponseDto, {
    message: 'ACCESS_REQUEST.PLAN_LINE_SUGGESTIONS_LISTED',
    description:
      'The lines of the current plan of the Cost Center of the request for the year the money goes out in: the software or plan, the amount, the window and whether it has gone by, the ones for the plan asked for marked as suggested. Nothing of what is left, the checks of the requests, other departments or the company.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, NOT_HEAD, NOT_FOUND, INVALID)
  async suggestions(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: IdParamDto,
    @Query() query: PageQueryDto,
  ) {
    try {
      return await this.planLines.suggestions(actor, params.id, query);
    } catch (error) {
      throw toSpendApiException(error);
    }
  }

  @Post('access-requests/:id/supplements')
  @RequireRoles('MANAGER')
  @ApiOperation({
    operationId: 'accessRequestSupplementAdd',
    summary: 'Change the day or leave people out in a supplementary file',
  })
  @ApiSuccessResponse(SupplementResponseDto, {
    status: HttpStatus.CREATED,
    message: 'ACCESS_REQUEST.SUPPLEMENT_ADDED',
    description:
      'The head changes the day the money is expected to go out of a request back in their queue, or, for a request for a group, leaves people out of it, with the reason. The request is priced again for the day and the people who remain, and its budget year follows; the file keeps the day, the year and the amount before and after, how many people were left out, who and when. A line chosen for another year is dropped, and the head chooses again before sending the request on.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    NOT_HEAD,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The request is not back in the queue (SPEND.SUPPLEMENT_NOT_IN_QUEUE), has no price (SPEND.SUPPLEMENT_NOT_PRICED), nothing changes (SPEND.SUPPLEMENT_NO_CHANGE), cannot be priced for it (ACCESS_REQUEST.NOT_PRICEABLE), or a person to leave out is not a line whose need is confirmed (SUPPLEMENT.LINE_NOT_DROPPABLE).',
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The body is invalid (VALIDATION_ERROR: neither a day nor a person, a blank reason); nobody would be left in the request (SUPPLEMENT.CANNOT_DROP_LAST_LINE); the request is not for a group (SUPPLEMENT.DROP_NOT_FOR_GROUP).',
    },
  )
  async addSupplement(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: IdParamDto,
    @Body() body: SupplementBodyDto,
  ) {
    try {
      return { supplement: await this.supplements.add(actor, params.id, body) };
    } catch (error) {
      throw toGroupRequestApiException(error);
    }
  }

  @Get('access-requests/:id/supplements')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'accessRequestSupplementList', summary: 'List the supplementary files of a request' })
  @ApiSuccessResponse(SupplementListResponseDto, {
    message: 'ACCESS_REQUEST.SUPPLEMENTS_LISTED',
    description:
      'The supplementary files of the request, oldest first, each with the day, the year and the amount before and after, the reason, who and when. Read by the people who may read the request.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, NOT_FOUND, INVALID)
  async listSupplements(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: IdParamDto,
    @Query() query: PageQueryDto,
  ) {
    try {
      return await this.supplements.list(actor, params.id, query);
    } catch (error) {
      throw toSpendApiException(error);
    }
  }
}
