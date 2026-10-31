import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
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
import {
  CommitmentIdParamDto,
  CommitmentListQueryDto,
  CommitmentListResponseDto,
  CommitmentResponseDto,
  ReleaseBodyDto,
  ReleaseListQueryDto,
  ReleaseListResponseDto,
} from './commitment.dto';
import { CommitmentService } from './commitment.service';
import { BUDGET_ERROR_EXAMPLES as EXAMPLES, toBudgetApiException } from '../budget/budget.http-errors';

const READERS = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only Finance reads the commitments.',
  examples: [FORBIDDEN_EXAMPLE],
} as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The commitment does not exist (BUDGET.COMMITMENT_NOT_FOUND).',
  examples: [EXAMPLES.COMMITMENT_NOT_FOUND],
} as const;
const INVALID_QUERY = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The query is invalid (VALIDATION_ERROR).',
  examples: [VALIDATION_EXAMPLE],
} as const;

/**
 * The commitments of the budget, read by Finance (`US-06-07`, `US-06-09` AC-2): what each request holds, for which year, and
 * whether it is attached to a budget or waits for one. A commitment that waits is an input of the proposal of its year, and
 * Finance has nothing to confirm on it.
 */
@ApiTags('budget-commitments')
@Controller({ path: 'budget-commitments', version: '1' })
export class BudgetCommitmentsController {
  constructor(private readonly commitments: CommitmentService) {}

  @Get()
  @RequireRoles('FINANCE')
  @ApiOperation({ operationId: 'budgetCommitmentList', summary: 'List the commitments held against the budgets' })
  @ApiSuccessResponse(CommitmentListResponseDto, {
    message: 'BUDGET_COMMITMENT.LISTED',
    description:
      'The commitments, the newest first, each with its request, Cost Center, year and amount, and whether it is attached to the budget of its year or waits for one (no budget yet). Narrowed by `attached`, the year, the Cost Center or the request.',
  })
  @ApiErrorResponses(UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE, READERS, INVALID_QUERY)
  async list(@Query() query: CommitmentListQueryDto) {
    try {
      return await this.commitments.page(query);
    } catch (error) {
      throw toBudgetApiException(error);
    }
  }

  @Get(':id/releases')
  @RequireRoles('FINANCE')
  @ApiOperation({
    operationId: 'budgetCommitmentReleases',
    summary: 'List what went back to the budget from a commitment',
  })
  @ApiSuccessResponse(ReleaseListResponseDto, {
    message: 'BUDGET_COMMITMENT.RELEASES_LISTED',
    description:
      'Each time money went back to the budget from the commitment, the oldest first: how much, why (the request ended, a grant failed, a share was withdrawn, or Finance let the remainder go), and who, when a person did it.',
  })
  @ApiErrorResponses(UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE, READERS, NOT_FOUND, INVALID_QUERY)
  async releases(@Param() params: CommitmentIdParamDto, @Query() query: ReleaseListQueryDto) {
    try {
      return await this.commitments.pageReleases(params.id, query);
    } catch (error) {
      throw toBudgetApiException(error);
    }
  }

  @Post(':id/release')
  @RequireRoles('FINANCE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'budgetCommitmentRelease', summary: 'Release what is left of a commitment' })
  @ApiSuccessResponse(CommitmentResponseDto, {
    message: 'BUDGET_COMMITMENT.RELEASED',
    description:
      'Finance lets what is left of a commitment go back to the budget, with a reason, once the request it is held for has ended and no invoice is still to come. Money that became an expense and a commitment that was already released are not touched.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
    { status: HttpStatus.FORBIDDEN, description: 'Only Finance releases a commitment.', examples: [FORBIDDEN_EXAMPLE] },
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The commitment is not held (BUDGET.COMMITMENT_NOT_HELD) or its request has not ended (BUDGET.COMMITMENT_REQUEST_OPEN).',
      examples: [EXAMPLES.COMMITMENT_NOT_HELD, EXAMPLES.COMMITMENT_REQUEST_OPEN],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The reason is missing or empty (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async release(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: CommitmentIdParamDto,
    @Body() body: ReleaseBodyDto,
  ) {
    try {
      return { commitment: await this.commitments.releaseRemainder(actor, params.id, body.reason) };
    } catch (error) {
      throw toBudgetApiException(error);
    }
  }
}
