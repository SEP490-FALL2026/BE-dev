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
import { RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { BudgetReviewQueryService } from './budget-review-query.service';
import { BudgetReviewSignatureService } from './budget-review-signature.service';
import { BudgetReviewSnapshotService } from './budget-review-snapshot.service';
import {
  CreateReviewPeriodBodyDto,
  ReviewPeriodDetailQueryDto,
  ReviewPeriodDetailResponseDto,
  ReviewPeriodIdParamDto,
  ReviewPeriodListResponseDto,
  ReviewPeriodQueryDto,
  ReviewPeriodResponseDto,
  SignReviewPeriodBodyDto,
} from './budget-review.dto';
import { BUDGET_REVIEW_ERROR_EXAMPLES as EXAMPLES, toBudgetReviewApiException } from './budget-review.http-errors';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description:
    'The review period does not exist, or none of its Cost Centers is in the scope of the caller (BUDGET_REVIEW.NOT_FOUND).',
  examples: [EXAMPLES.NOT_FOUND],
} as const;

/**
 * The close of a month (`RV-1`, `QĐ-111ae`): Finance closes a month that has ended and the system keeps a picture of every Cost Center with a budget of the year
 * (what it spent, holds and has waiting, the forecast of the end of the year and the light); the picture is never changed and the data is never locked. Finance
 * and the spending approver read every period; a manager reads the line of the Cost Center of their own department.
 */
@ApiTags('budget-review-periods')
@Controller({ path: 'budget-review-periods', version: '1' })
export class BudgetReviewController {
  constructor(
    private readonly snapshots: BudgetReviewSnapshotService,
    private readonly queries: BudgetReviewQueryService,
    private readonly signatures: BudgetReviewSignatureService,
  ) {}

  @Post()
  @RequireRoles('FINANCE')
  @ApiOperation({ operationId: 'budgetReviewPeriodClose', summary: 'Close a month that has ended' })
  @ApiSuccessResponse(ReviewPeriodResponseDto, {
    status: HttpStatus.CREATED,
    message: 'BUDGET_REVIEW.CLOSED',
    description:
      'The seat-months of the month are worked out and the picture of the month is kept: for every Cost Center with an effective budget of the year its budget, what it spent, holds and has waiting, what is left, the difference k of its invoices, the price increase already known, the forecast of the end of the year, the pace and the light, and the figures of the company with the line of the shared pool against its reserve. March, June and September are the quarterly review. The picture is never changed; an invoice that comes later is read in the next month.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only Finance closes a month.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The month was closed already (BUDGET_REVIEW.PERIOD_EXISTS), or its seat-months could not all be worked out and nothing was closed (BUDGET_REVIEW.SEAT_MONTHS_NOT_READY).',
      examples: [EXAMPLES.PERIOD_EXISTS, EXAMPLES.SEAT_MONTHS_NOT_READY],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The body is invalid (VALIDATION_ERROR), or the month has not ended (BUDGET_REVIEW.MONTH_NOT_ENDED).',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.MONTH_NOT_ENDED],
    },
  )
  async close(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: CreateReviewPeriodBodyDto) {
    try {
      return await this.snapshots.close(actor, body);
    } catch (error) {
      throw toBudgetReviewApiException(error);
    }
  }

  @Get()
  @RequireRoles('FINANCE', 'SPENDING_APPROVER', 'MANAGER')
  @ApiOperation({ operationId: 'budgetReviewPeriodList', summary: 'List the months that were closed' })
  @ApiSuccessResponse(ReviewPeriodListResponseDto, {
    message: 'BUDGET_REVIEW.LISTED',
    description:
      'A page of the review periods, the latest month first, each with its state, who closed and who signed it, how many Cost Centers have each light and, for Finance and the spending approver, the figures of the company. A manager reads the counts of the Cost Center of their own department only.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only Finance, the spending approver and the manager of a department read the review periods.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The query is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async list(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: ReviewPeriodQueryDto) {
    try {
      return await this.queries.list(actor, query);
    } catch (error) {
      throw toBudgetReviewApiException(error);
    }
  }

  @Get(':id')
  @RequireRoles('FINANCE', 'SPENDING_APPROVER', 'MANAGER')
  @ApiOperation({ operationId: 'budgetReviewPeriodGet', summary: 'Read one closed month with its lines' })
  @ApiSuccessResponse(ReviewPeriodDetailResponseDto, {
    message: 'BUDGET_REVIEW.RETRIEVED',
    description:
      'The period and a page of its lines, the Cost Centers that need the eye first (red, yellow, under, then green). Finance and the spending approver read every line; a manager reads the line of the Cost Center of their own department.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only Finance, the spending approver and the manager of a department read the review periods.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    NOT_FOUND,
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The id or the query is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async get(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: ReviewPeriodIdParamDto,
    @Query() query: ReviewPeriodDetailQueryDto,
  ) {
    try {
      return await this.queries.detail(actor, params.id, query);
    } catch (error) {
      throw toBudgetReviewApiException(error);
    }
  }
  @Post(':id/signature')
  @RequireRoles('FINANCE')
  @ApiOperation({ operationId: 'budgetReviewPeriodSign', summary: 'Sign a month that was closed' })
  @ApiSuccessResponse(ReviewPeriodResponseDto, {
    message: 'BUDGET_REVIEW.SIGNED',
    description:
      'Finance signs the period: who and when are kept and the period never changes again. Only Finance signs, not the spending approver. Signing locks no data: an invoice that comes later is read in the next month. The spending approver is told the summary of the month with how many Cost Centers have each light.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only Finance signs a review period.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description: 'The period was signed already (BUDGET_REVIEW.ALREADY_SIGNED).',
      examples: [EXAMPLES.ALREADY_SIGNED],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The id or the body is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async sign(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: ReviewPeriodIdParamDto,
    @Body() body: SignReviewPeriodBodyDto,
  ) {
    try {
      return await this.signatures.sign(actor, params.id, body);
    } catch (error) {
      throw toBudgetReviewApiException(error);
    }
  }
}
