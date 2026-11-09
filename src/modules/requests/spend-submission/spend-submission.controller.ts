import { Body, Controller, Get, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { AuthenticatedOnly, RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { SpendBatchService } from './spend-batch.service';
import { SpendBatchListService } from './spend-batch-list.service';
import { SpendBatchViewService } from './spend-batch-view.service';
import { SpendBatchListQueryDto, SpendBatchListResponseDto } from './spend-batch-list.dto';
import { SpendQueueService } from './spend-queue.service';
import {
  BatchItemListResponseDto,
  BatchResponseDto,
  IdParamDto,
  PageQueryDto,
  QueueResponseDto,
  SubmitBatchBodyDto,
  SupplementBodyDto,
  SupplementListResponseDto,
  SupplementResponseDto,
} from '../spend/spend-submission.dto';
import { GROUP_REQUEST_ERROR_EXAMPLES, toGroupRequestApiException } from '../group-request/group-request.http-errors';
import { SPEND_ERROR_EXAMPLES, toSpendApiException } from '../spend/spend.http-errors';
import { SupplementQueryService } from './supplement-query.service';
import { SupplementService } from './supplement.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The request is invalid (VALIDATION_ERROR).',
  examples: [VALIDATION_EXAMPLE],
} as const;
const NOT_HEAD = {
  status: HttpStatus.FORBIDDEN,
  description: 'The caller does not head a department (SPEND.NOT_HEAD).',
  examples: [FORBIDDEN_EXAMPLE, SPEND_ERROR_EXAMPLES.NOT_HEAD],
} as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The request does not exist, or is not one of the department of the caller (ACCESS_REQUEST.NOT_FOUND).',
  examples: [SPEND_ERROR_EXAMPLES.REQUEST_NOT_FOUND],
} as const;
const BATCH_NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The batch does not exist, or the caller has no part in it (SPEND.BATCH_NOT_FOUND).',
  examples: [SPEND_ERROR_EXAMPLES.BATCH_NOT_FOUND],
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
    private readonly batchList: SpendBatchListService,
    private readonly supplements: SupplementService,
    private readonly supplementQueries: SupplementQueryService,
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
        'A request chosen is not waiting in the queue: it was sent on, or does not cost money (SPEND.NOT_IN_QUEUE), or the department has no Cost Center in use now, which stops the batch before any request is checked against a budget (FINANCE.SETUP_INCOMPLETE). Nothing is written.',
      examples: [SPEND_ERROR_EXAMPLES.NOT_IN_QUEUE, SPEND_ERROR_EXAMPLES.FINANCE_SETUP_INCOMPLETE],
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

  @Get('spend-batches')
  @RequireRoles('FINANCE')
  @ApiOperation({ operationId: 'spendBatchList', summary: 'List the batches the heads sent on as spend' })
  @ApiSuccessResponse(SpendBatchListResponseDto, {
    message: 'SPEND_BATCH.LISTED',
    description:
      'Every batch, the newest first, each with its department, who sent it and when, how many requests it holds, how many of them were approved for spend and what those were committed for (by currency), and how many still wait for a decision. Narrowed by department and by the time the batch was sent. Only Finance reads the list, and only reads it.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only Finance reads the batches of all the departments.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    INVALID,
  )
  async listBatches(@Query() query: SpendBatchListQueryDto) {
    return this.batchList.page(query);
  }

  @Get('spend-batches/:id')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'spendBatchGet', summary: 'Get a batch of requests sent on as spend' })
  @ApiSuccessResponse(BatchResponseDto, {
    message: 'SPEND_BATCH.FETCHED',
    description:
      'Who sent the batch, when, and how many requests it holds. It has no decision and no commitment: each request keeps its own steps, state and reason. Read by the head who sent it, by Finance (every batch) and by a person who holds the spend step of a request in it.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, BATCH_NOT_FOUND, INVALID)
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
      'The requests of the batch in the order they were sent, each with how it fared (sent to the approver, sent to Finance, or stopped with its reason), whether it left the batch and why, and the state the request is in now. The head who sent the batch and Finance see all of them; the person who holds a spend step sees the requests they hold.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, BATCH_NOT_FOUND, INVALID)
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
      examples: [
        GROUP_REQUEST_ERROR_EXAMPLES.SUPPLEMENT_NOT_IN_QUEUE,
        GROUP_REQUEST_ERROR_EXAMPLES.SUPPLEMENT_NOT_PRICED,
        GROUP_REQUEST_ERROR_EXAMPLES.SUPPLEMENT_NO_CHANGE,
        GROUP_REQUEST_ERROR_EXAMPLES.NOT_PRICEABLE,
        GROUP_REQUEST_ERROR_EXAMPLES.LINE_NOT_DROPPABLE,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The body is invalid (VALIDATION_ERROR: neither a day nor a person, a blank reason); nobody would be left in the request (SUPPLEMENT.CANNOT_DROP_LAST_LINE); the request is not for a group (SUPPLEMENT.DROP_NOT_FOR_GROUP).',
      examples: [
        VALIDATION_EXAMPLE,
        GROUP_REQUEST_ERROR_EXAMPLES.CANNOT_DROP_LAST_LINE,
        GROUP_REQUEST_ERROR_EXAMPLES.DROP_NOT_FOR_GROUP,
      ],
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
      return await this.supplementQueries.list(actor, params.id, query);
    } catch (error) {
      throw toSpendApiException(error);
    }
  }
}
