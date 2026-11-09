import { ACCESS_REQUEST_ERROR_EXAMPLES } from '../access-request/access-request.http-errors';
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
import { ReserveConfirmationService } from '../reserve-confirmation/reserve-confirmation.service';
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
  ReserveConfirmationBodyDto,
  ReserveConfirmationResponseDto,
  SubmitBatchBodyDto,
  SubmitBatchResponseDto,
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
 * Sending requests that cost money on to be decided as spend (`US-06-14`, `US-05-04` AC-11 to AC-16, `BR-MF1-06g`). Only the head of a
 * department keeps its queue, sends its requests on in a batch, confirms with a line of reason that a request uses the reserve, and
 * shortens a request in a supplementary file; the Employee, Finance, the IT Admin and the Super Admin cannot. Nothing here shows a figure
 * of what is left of the budget.
 */
@ApiTags('spend-submission')
@Controller({ version: '1' })
export class SpendSubmissionController {
  constructor(
    private readonly queue: SpendQueueService,
    private readonly batches: SpendBatchService,
    private readonly reserve: ReserveConfirmationService,
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
      'The requests of the department of the head that cost money and whose need is approved, not yet sent on, each with where it stands (not sent, waiting for the head to confirm the reserve, or blocked with its reasons) and what a check made now says (budgetOutcome: WITHIN_BASE, USES_RESERVE, BLOCKED), so the head knows which of them needs a line of reason to be sent on, and how far over the base or the reserve a request is. Each also says since when it waits in the queue, how many working days that is, whether it has waited longer than the days the head may take and how many reminders the head has had about it. Never what is left of the budget.',
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
  @ApiSuccessResponse(SubmitBatchResponseDto, {
    status: HttpStatus.CREATED,
    message: 'SPEND_BATCH.SUBMITTED',
    description:
      'Sends the requests chosen, one or more, on in one batch. The amount of each is worked out again for the month of the batch and each is checked against the budget (BR-MF1-06g): within the base it goes to the spending approver; if it uses the reserve it goes only when the head gives a line of reason for it in the same act (reserveConfirmations, 1 to 500 characters, only for a request of the batch, only used when its check says it uses the reserve; the answer says IGNORED for one that does not), and otherwise stays in the queue waiting for the confirmation (AWAITING_RESERVE_CONFIRMATION); blocked (over the reserve, no approved budget in the current Cost Center, a quote that is no longer valid) or with a price or a rate missing, it stays in the queue with the reason and the others go on. results says how each fared and what became of its confirmation.',
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
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The body is invalid (VALIDATION_ERROR: a reason that is empty, over 500 characters or on more than one line), or a confirmation names a request that is not in the batch (SPEND_BATCH.CONFIRMATION_NOT_IN_BATCH). Nothing is written.',
      examples: [VALIDATION_EXAMPLE, SPEND_ERROR_EXAMPLES.CONFIRMATION_NOT_IN_BATCH],
    },
  )
  async submit(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: SubmitBatchBodyDto) {
    try {
      const { batchId, results } = await this.batches.submit(actor, body.requestIds, body.reserveConfirmations);

      return { batch: await this.batchViews.get(actor, batchId), results };
    } catch (error) {
      throw toSpendApiException(error);
    }
  }

  @Post('access-requests/:id/reserve-confirmation')
  @RequireRoles('MANAGER')
  @ApiOperation({
    operationId: 'spendReserveConfirm',
    summary: 'Confirm that a request uses the reserve, with a line of reason',
  })
  @ApiSuccessResponse(ReserveConfirmationResponseDto, {
    message: 'SPEND.RESERVE_CONFIRMED',
    description:
      'The head of the department confirms, with one line of reason (1 to 500 characters), a request in their queue whose check says it uses the reserve. The request is checked again for today: if it still uses the reserve, the spend step is opened for the spending approver with the confirmation kept on it and its SLA counted from now (result SPEND_STEP_OPENED, confirmationKept true); if it is within the base now, the step is opened with no confirmation (confirmationKept false); if it is blocked now, nothing is opened or kept and the answer says so (result BLOCKED, with the reasons). A confirmation stays when the head of the department changes. The head cannot confirm a request they asked for or are given.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    NOT_HEAD,
    NOT_FOUND,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'The head asked for the request or is given it (SPEND.RESERVE_CONFIRMER_IS_BENEFICIARY).',
      examples: [FORBIDDEN_EXAMPLE, SPEND_ERROR_EXAMPLES.RESERVE_CONFIRMER_IS_BENEFICIARY],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The request does not wait for the confirmation of the reserve: its check is within the base or blocked, a spend step is open, it was withdrawn or is not in the queue, or another confirmation came first (SPEND.RESERVE_NOT_PENDING).',
      examples: [SPEND_ERROR_EXAMPLES.RESERVE_NOT_PENDING],
    },
    INVALID,
  )
  async confirmReserve(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: IdParamDto,
    @Body() body: ReserveConfirmationBodyDto,
  ) {
    try {
      return { reserveConfirmation: await this.reserve.confirm(actor, params.id, body.reason) };
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
  @AuthenticatedOnly()
  @ApiOperation({
    operationId: 'accessRequestSupplementAdd',
    summary: 'Shorten the term or leave people out in a supplementary file',
  })
  @ApiSuccessResponse(SupplementResponseDto, {
    status: HttpStatus.CREATED,
    message: 'ACCESS_REQUEST.SUPPLEMENT_ADDED',
    description:
      'The head, or the requester of a one-step request awaiting revision, gives an earlier end date to a request back in their queue (a request with no end may be given one), or, for a request for a group, leaves people out of it, or both, with the reason. The request is priced again for the day of the file and the people who remain (the months left of the year up to the new end date), and its budget year follows; the file keeps the end date, the year and the amount before and after, how many people were left out, who and when.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    { status: HttpStatus.FORBIDDEN, description: 'Only the current head supplements a via-head request; only the requester supplements a one-step request (SPEND.NOT_HEAD, ACCESS_REQUEST.NOT_REQUESTER).', examples: [SPEND_ERROR_EXAMPLES.NOT_HEAD, ACCESS_REQUEST_ERROR_EXAMPLES.NOT_REQUESTER] },
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The request is not back in the queue (SPEND.SUPPLEMENT_NOT_IN_QUEUE), has no price (SPEND.SUPPLEMENT_NOT_PRICED), nothing changes (SPEND.SUPPLEMENT_NO_CHANGE), the end date is not earlier than the one the request has (SPEND.SUPPLEMENT_TERM_NOT_REDUCED), the end date is before today or more than a year from today (SPEND.SUPPLEMENT_END_DATE_OUT_OF_RANGE), cannot be priced for it (ACCESS_REQUEST.NOT_PRICEABLE), or a person to leave out is not a line whose need is confirmed (SUPPLEMENT.LINE_NOT_DROPPABLE).',
      examples: [
        GROUP_REQUEST_ERROR_EXAMPLES.SUPPLEMENT_NOT_IN_QUEUE,
        GROUP_REQUEST_ERROR_EXAMPLES.SUPPLEMENT_NOT_PRICED,
        GROUP_REQUEST_ERROR_EXAMPLES.SUPPLEMENT_NO_CHANGE,
        GROUP_REQUEST_ERROR_EXAMPLES.SUPPLEMENT_TERM_NOT_REDUCED,
        GROUP_REQUEST_ERROR_EXAMPLES.SUPPLEMENT_END_DATE_OUT_OF_RANGE,
        GROUP_REQUEST_ERROR_EXAMPLES.NOT_PRICEABLE,
        GROUP_REQUEST_ERROR_EXAMPLES.LINE_NOT_DROPPABLE,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The body is invalid (VALIDATION_ERROR: neither an end date nor a person, a blank reason); nobody would be left in the request (SUPPLEMENT.CANNOT_DROP_LAST_LINE); the request is not for a group (SUPPLEMENT.DROP_NOT_FOR_GROUP).',
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
