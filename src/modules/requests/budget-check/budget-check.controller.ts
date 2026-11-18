import { Controller, Get, HttpStatus, Param, Query } from '@nestjs/common';
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
import { BudgetCheckViewService } from './budget-check-view.service';
import { BudgetCheckYearsViewService } from './budget-check-years-view.service';
import { SPEND_ERROR_EXAMPLES, toSpendApiException } from '../spend/spend.http-errors';
import { BudgetCheckResponseDto, RequestParamDto, YearListResponseDto, YearsQueryDto } from './budget-check.dto';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The request is invalid (VALIDATION_ERROR).',
  examples: [VALIDATION_EXAMPLE],
} as const;
/** The reads: a request that does not exist answers SPEND.REVIEW_NOT_FOUND too, so it cannot be probed. */
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description:
    'The request has no check for the caller to read (SPEND.REVIEW_NOT_FOUND), or does not exist (ACCESS_REQUEST.NOT_FOUND).',
  examples: [SPEND_ERROR_EXAMPLES.REVIEW_NOT_FOUND],
} as const;

/**
 * The check of the budget of a request (`US-06-12`, `BR-MF1-06g`). Finance and the person the spend step is given to read it, and nobody
 * else does: the head and the requester see where the request stands, never a figure of the budget. The routes keep the operation ids they
 * had when they lived in the review of Finance (`D-1`); the review of Finance itself no longer exists.
 */
@ApiTags('budget-checks')
@Controller({ version: '1' })
export class BudgetCheckController {
  constructor(
    private readonly views: BudgetCheckViewService,
    private readonly yearViews: BudgetCheckYearsViewService,
  ) {}

  @Get('access-requests/:id/budget-check')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'budgetCheckGet', summary: 'Get the check of the budget of a request' })
  @ApiSuccessResponse(BudgetCheckResponseDto, {
    message: 'BUDGET_CHECK.FETCHED',
    description:
      'The newest check: what set it going, its outcome (within the base, uses the reserve, blocked), every reason it is blocked, how far over the base or the reserve the cost is, and what binds the company in all. The figures of the year (base, reserve, spent, held, waiting, what is left at the two levels) are listed apart. A check made before the three outcomes is read from its code.',
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
      'One row for the year the request is checked in: its cost, the code of the year, and the base, the reserve, what is held, what is spent, what waits to be decided and what is left of the base and with the reserve, as the check read them (the spending approver reads them as they are now). A year with no approved version has no figures, which is not a budget of 0. The price is the quote of the proposal only: the plans have no end date of their price in the model, so PRICE_EXPIRED is about a quote that is no longer valid.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, NOT_FOUND, INVALID)
  async years(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: RequestParamDto,
    @Query() query: YearsQueryDto,
  ) {
    try {
      return await this.yearViews.years(actor, params.id, query);
    } catch (error) {
      throw toSpendApiException(error);
    }
  }
}
