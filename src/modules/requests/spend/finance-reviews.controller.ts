import { Body, Controller, Get, HttpStatus, Param, Post, Query } from '@nestjs/common';
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
import { FinanceReviewService } from './finance-review.service';
import { SpendViewService } from './spend-view.service';
import { toSpendApiException } from './spend.http-errors';
import {
  BudgetCheckResponseDto,
  RequestParamDto,
  ReviewBodyDto,
  ReviewDetailResponseDto,
  ReviewListQueryDto,
  ReviewListResponseDto,
  YearListResponseDto,
  YearsQueryDto,
} from './spend.dto';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The request is invalid (VALIDATION_ERROR).',
} as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description:
    'The request has no check or review for the caller to read (SPEND.REVIEW_NOT_FOUND), or does not exist (ACCESS_REQUEST.NOT_FOUND).',
} as const;
const FINANCE_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only Finance reviews (SPEND.NOT_FINANCE).',
} as const;

/**
 * The check of the budget of a request and the review of Finance that follows it (`US-06-12`, `US-06-13`). Finance reads its
 * queue and ends each review in one of three ways; Finance and the person the spend step is given to read the check, and
 * nobody else does: the head and the requester see only where the request stands, never a figure of the budget.
 */
@ApiTags('finance-reviews')
@Controller({ version: '1' })
export class FinanceReviewsController {
  constructor(
    private readonly reviews: FinanceReviewService,
    private readonly views: SpendViewService,
  ) {}

  @Get('finance-reviews')
  @RequireRoles('FINANCE')
  @ApiOperation({ operationId: 'financeReviewList', summary: 'List the reviews waiting for Finance' })
  @ApiSuccessResponse(ReviewListResponseDto, {
    message: 'FINANCE_REVIEW.LISTED',
    description:
      'The reviews that are open, the oldest first: the request, its Cost Center and requester, what it costs, and the first code the check gave. The figures of each year are read from the check of the request.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, FINANCE_ONLY, INVALID)
  async list(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: ReviewListQueryDto) {
    try {
      return await this.views.queue(actor, query);
    } catch (error) {
      throw toSpendApiException(error);
    }
  }

  @Get('access-requests/:id/finance-review')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'financeReviewGet', summary: 'Get the review of Finance of a request' })
  @ApiSuccessResponse(ReviewDetailResponseDto, {
    message: 'FINANCE_REVIEW.FETCHED',
    description:
      'The newest review of the request, open or ended, with the check it is about and, once ended, its outcome, opinion, direction, who and when. Read by Finance and by the person the spend step is given to.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, NOT_FOUND, INVALID)
  async get(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: RequestParamDto) {
    try {
      return { financeReview: await this.views.review(actor, params.id) };
    } catch (error) {
      throw toSpendApiException(error);
    }
  }

  @Post('access-requests/:id/finance-review')
  @RequireRoles('FINANCE')
  @ApiOperation({ operationId: 'financeReviewComplete', summary: 'End the review of a request' })
  @ApiSuccessResponse(ReviewDetailResponseDto, {
    message: 'FINANCE_REVIEW.COMPLETED',
    description:
      'Ends the open review in one of three ways: an opinion with the direction it advises (the spend step is then made for the approver), the request given back to its head with a reason, or a budget asked for with a reason. None approves or refuses the request.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    FINANCE_ONLY,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The request has no review open (SPEND.REVIEW_NOT_OPEN), the plan line is still overdue (SPEND.PLAN_LINE_NOT_UPDATED), the year has no budget to make or has one (SPEND.NO_BUDGET_TO_MAKE), or nobody heads the department to propose it (SPEND.NO_HEAD_TO_PROPOSE).',
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The outcome lacks what it needs: an opinion needs its text and direction, the others need a reason (VALIDATION_ERROR). Nothing is written.',
    },
  )
  async complete(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: RequestParamDto,
    @Body() body: ReviewBodyDto,
  ) {
    try {
      return { financeReview: await this.reviews.complete(actor, params.id, body) };
    } catch (error) {
      throw toSpendApiException(error);
    }
  }

  @Get('access-requests/:id/budget-check')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'budgetCheckGet', summary: 'Get the check of the budget of a request' })
  @ApiSuccessResponse(BudgetCheckResponseDto, {
    message: 'BUDGET_CHECK.FETCHED',
    description:
      'The newest check: what set it going, where it sent the request, the codes of the data and of the plan line, the flag of a request outside the plan, and what binds the company in all. The figures of each year are listed apart.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, NOT_FOUND, INVALID)
  async check(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: RequestParamDto) {
    try {
      return { budgetCheck: await this.views.latestCheck(actor, params.id) };
    } catch (error) {
      throw toSpendApiException(error);
    }
  }

  @Get('access-requests/:id/budget-check/years')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'budgetCheckYearList', summary: 'List the years of the check of a request' })
  @ApiSuccessResponse(YearListResponseDto, {
    message: 'BUDGET_CHECK.YEARS_LISTED',
    description:
      'One row for each year the request has a binding payment in: its slice of the cost, the code of the year, and the budget, what is held, what is spent and what is left as the check read them. A year with no budget has no figures, which is not a budget of 0.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, NOT_FOUND, INVALID)
  async years(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: RequestParamDto,
    @Query() query: YearsQueryDto,
  ) {
    try {
      return await this.views.years(actor, params.id, query);
    } catch (error) {
      throw toSpendApiException(error);
    }
  }
}
