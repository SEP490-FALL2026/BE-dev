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
  DecideTransferReviewBodyDto,
  ListTransferReviewItemsQueryDto,
  ListTransferReviewsQueryDto,
  TransferReviewDecisionResponseDto,
  TransferReviewDetailResponseDto,
  TransferReviewIdParamDto,
  TransferReviewItemPageResponseDto,
  TransferReviewPageResponseDto,
} from './transfer-review.dto';
import {
  TRANSFER_REVIEW_ERROR_EXAMPLES as EXAMPLES,
  toTransferReviewApiException,
} from './transfer-review.http-errors';
import { TransferReviewDecisionService } from './transfer-review-decision.service';
import { TransferReviewViewService } from './transfer-review-view.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The review does not exist, or has nothing to do with the caller (TRANSFER_REVIEW.NOT_FOUND).',
  examples: [EXAMPLES.NOT_FOUND],
} as const;

/**
 * The review a new head makes of the tools a person brought from another department that are outside the standard toolset of the
 * department they came to. Any signed-in person may ask: what a person sees and does is judged from the review, because the head
 * of a department is a position held on a day and not a role of an account. The IT Admin reads every review and decides none.
 */
@ApiTags('transfer-reviews')
@Controller({ path: 'transfer-reviews', version: '1' })
@AuthenticatedOnly()
export class TransferReviewsController {
  constructor(
    private readonly views: TransferReviewViewService,
    private readonly decisions: TransferReviewDecisionService,
  ) {}

  @Get()
  @ApiOperation({ operationId: 'transferReviewList', summary: 'List the reviews of tools after a transfer' })
  @ApiSuccessResponse(TransferReviewPageResponseDto, {
    message: 'TRANSFER_REVIEW.LISTED',
    description:
      'A page of reviews, the earliest deadline first. A department head reads the reviews of the department they head today; an IT Admin reads all of them without deciding; anyone else gets an empty page. A row names the person, the department they came to, the day the transfer took effect, the deadline, how many tools still wait, whether the review is late and by how many days, and why nobody can decide yet while the department has no head.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'A filter or a page parameter is invalid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async list(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: ListTransferReviewsQueryDto) {
    try {
      return await this.views.list(actor, query);
    } catch (error) {
      throw toTransferReviewApiException(error);
    }
  }

  @Get(':id')
  @ApiOperation({ operationId: 'transferReviewGet', summary: 'Read a review of tools after a transfer' })
  @ApiSuccessResponse(TransferReviewDetailResponseDto, {
    message: 'TRANSFER_REVIEW.RETRIEVED',
    description:
      'The review with the head who decides today, the transfer it follows, and when it was opened, completed or told as late. The tools are in the items of the review.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, NOT_FOUND, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The id is not valid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async get(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: TransferReviewIdParamDto) {
    try {
      return await this.views.get(actor, params.id);
    } catch (error) {
      throw toTransferReviewApiException(error);
    }
  }

  @Get(':id/items')
  @ApiOperation({ operationId: 'transferReviewItemList', summary: 'List the tools of a review' })
  @ApiSuccessResponse(TransferReviewItemPageResponseDto, {
    message: 'TRANSFER_REVIEW.ITEMS_LISTED',
    description:
      'A page of the tools outside the standard toolset, in the order they were listed: the application and plan, how it is provided, why the seat was given, and what the head decided about it, who and when. Usage is not shown.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, NOT_FOUND, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The id or a page parameter is not valid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async listItems(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: TransferReviewIdParamDto,
    @Query() query: ListTransferReviewItemsQueryDto,
  ) {
    try {
      return await this.views.listItems(actor, params.id, query);
    } catch (error) {
      throw toTransferReviewApiException(error);
    }
  }

  @Post(':id/decisions')
  @ApiOperation({ operationId: 'transferReviewDecide', summary: 'Decide about one tool of a review' })
  @ApiSuccessResponse(TransferReviewDecisionResponseDto, {
    status: HttpStatus.CREATED,
    message: 'TRANSFER_REVIEW.DECIDED',
    description:
      'Records, once, what the head decides about one tool: still needed (the seat stays), no longer needed (the seat is taken away: a revocation is opened for the IT Admin, and the head confirms the handover of the data when the plan warns of data loss), or a new tool is needed (recorded as a need; no request is made and the seat stays). The review is completed when no tool waits. A review past its deadline is decided the same way.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'The caller is not the head of the department the person came to today: the head before, an IT Admin, a stand-in approver or anyone else (TRANSFER_REVIEW.NOT_REVIEWER). Nothing is written.',
      examples: [EXAMPLES.NOT_REVIEWER],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description:
        'The review does not exist (TRANSFER_REVIEW.NOT_FOUND) or the tool is not part of it (TRANSFER_REVIEW.ITEM_NOT_FOUND).',
      examples: [EXAMPLES.NOT_FOUND, EXAMPLES.ITEM_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'A decision about the tool was written already (TRANSFER_REVIEW.DECISION_ALREADY_RECORDED), the review is not open (NOT_OPEN), the person has left (EMPLOYEE_LEFT), the kind of tool cannot be taken away through the system (REVOCATION_NOT_SUPPORTED) or the seat has ended (SEAT_NOT_OPEN): nothing changes.',
      examples: [
        EXAMPLES.DECISION_ALREADY_RECORDED,
        EXAMPLES.NOT_OPEN,
        EXAMPLES.REVOCATION_NOT_SUPPORTED,
        EXAMPLES.SEAT_NOT_OPEN,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR): an unknown decision, or a note that does not go with the decision or is longer than 500 characters.',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async decide(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: TransferReviewIdParamDto,
    @Body() body: DecideTransferReviewBodyDto,
  ) {
    try {
      const outcome = await this.decisions.decide(actor, params.id, {
        assignmentId: body.assignmentId,
        decision: body.decision,
        ...(body.newToolNote === undefined ? {} : { newToolNote: body.newToolNote }),
      });

      return await this.views.decisionOf(actor, outcome);
    } catch (error) {
      throw toTransferReviewApiException(error);
    }
  }
}
