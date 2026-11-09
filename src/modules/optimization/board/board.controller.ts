import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  type ErrorResponseDeclaration,
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
  Kpi5QueryDto,
  Kpi5ResponseDto,
  OptimizationSummaryResponseDto,
  ReclaimResponseDto,
  RecommendationIdParamDto,
  RecommendationListQueryDto,
  RecommendationPageResponseDto,
  RecommendationResponseDto,
  RuleRunIdParamDto,
  RuleRunListQueryDto,
  RuleRunPageResponseDto,
  RuleSkipPageResponseDto,
} from './board.dto';
import { GHOST_SEAT_ERROR_EXAMPLES as EXAMPLES, toGhostSeatApiException } from './board.http-errors';
import { BoardKpiService } from './board-kpi.service';
import { BoardQueryService } from './board-query.service';
import { BoardReclaimService } from './board-reclaim.service';
import { BoardSummaryService } from './board-summary.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const QUERY_INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The query or the id is invalid (VALIDATION_ERROR).',
  examples: [VALIDATION_EXAMPLE],
} as const;
const forbidden = (who: string): ErrorResponseDeclaration => ({
  status: HttpStatus.FORBIDDEN,
  description: `Only ${who} may do this.`,
  examples: [FORBIDDEN_EXAMPLE],
});
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The recommendation or the run does not exist (GHOST_SEAT.NOT_FOUND).',
  examples: [EXAMPLES.NOT_FOUND],
} as const;

/** The table of wasted seats of the IT Admin: the recommendations `G1` and `G2`, the reclaim of a `G2`, the runs that make them, and `KPI-5`. */
@ApiTags('ghost-seats')
@Controller({ version: '1' })
export class BoardController {
  constructor(
    private readonly queries: BoardQueryService,
    private readonly summaries: BoardSummaryService,
    private readonly reclaims: BoardReclaimService,
    private readonly kpis: BoardKpiService,
  ) {}

  @Get('ghost-seat-recommendations')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'ghostSeatRecommendationList', summary: 'List the recommendations of wasted seats' })
  @ApiSuccessResponse(RecommendationPageResponseDto, {
    message: 'GHOST_SEAT_RECOMMENDATIONS.LISTED',
    description:
      'One page of recommendations (G1, G2), newest first, filtered by group, tier, state, application and department scope.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, forbidden('an IT Admin'), QUERY_INVALID)
  async list(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: RecommendationListQueryDto) {
    try {
      return await this.queries.list(actor, query);
    } catch (error) {
      throw toGhostSeatApiException(error);
    }
  }

  @Get('ghost-seat-optimization-summary')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({
    operationId: 'ghostSeatOptimizationSummaryGet',
    summary: 'Read the four groups of wasted seats side by side',
  })
  @ApiSuccessResponse(OptimizationSummaryResponseDto, {
    message: 'GHOST_SEAT_OPTIMIZATION_SUMMARY.READ',
    description:
      'How many recommendations of each group are not closed, how many have a reclaim under way, and the limitation for internal software.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, forbidden('an IT Admin'))
  async summary() {
    try {
      return await this.summaries.summary();
    } catch (error) {
      throw toGhostSeatApiException(error);
    }
  }

  @Get('ghost-seat-recommendations/:id')
  @RequireRoles('IT_ADMIN', 'MANAGER')
  @ApiOperation({ operationId: 'ghostSeatRecommendationGet', summary: 'Read one recommendation of wasted seats' })
  @ApiSuccessResponse(RecommendationResponseDto, {
    message: 'GHOST_SEAT_RECOMMENDATION.READ',
    description:
      'The recommendation with the evidence it was made from; a head reads only the ones about their department.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'Only an IT Admin, or the head of the department that was asked, may read it (GHOST_SEAT.NOT_DECIDER for another head).',
      examples: [FORBIDDEN_EXAMPLE, EXAMPLES.NOT_DECIDER],
    },
    NOT_FOUND,
    QUERY_INVALID,
  )
  async get(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: RecommendationIdParamDto) {
    try {
      return { recommendation: await this.queries.get(actor, params.id) };
    } catch (error) {
      throw toGhostSeatApiException(error);
    }
  }

  @Post('ghost-seat-recommendations/:id/reclaim')
  @RequireRoles('IT_ADMIN')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'ghostSeatRecommendationReclaim',
    summary: 'Open the reclaim of the seat of a person who left',
  })
  @ApiSuccessResponse(ReclaimResponseDto, {
    message: 'GHOST_SEAT_RECOMMENDATION.RECLAIM_OPENED',
    description:
      'The revocation task was opened through the gate of licensing and the recommendation holds it; the seat is given back only when the task is completed.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    forbidden('an IT Admin'),
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The recommendation is not an open G2 (GHOST_SEAT.NOT_RECLAIMABLE) or the gate of the revocation refused the seat (GHOST_SEAT.SEAT_NOT_REVOCABLE).',
      examples: [EXAMPLES.NOT_RECLAIMABLE, EXAMPLES.SEAT_NOT_REVOCABLE],
    },
    QUERY_INVALID,
  )
  async reclaim(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: RecommendationIdParamDto) {
    try {
      return await this.reclaims.reclaim(actor, params.id);
    } catch (error) {
      throw toGhostSeatApiException(error);
    }
  }

  @Get('ghost-seat-rule-runs')
  @RequireRoles('IT_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ operationId: 'ghostSeatRuleRunList', summary: 'List the runs of the rules of wasted seats' })
  @ApiSuccessResponse(RuleRunPageResponseDto, {
    message: 'GHOST_SEAT_RULE_RUNS.LISTED',
    description: 'One page of runs, newest first, each with how it ended and how many subjects it left out.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, forbidden('an IT Admin or the Super Admin'), QUERY_INVALID)
  async runs(@Query() query: RuleRunListQueryDto) {
    try {
      return await this.queries.listRuns(query);
    } catch (error) {
      throw toGhostSeatApiException(error);
    }
  }

  @Get('ghost-seat-rule-runs/:id/skips')
  @RequireRoles('IT_ADMIN', 'SUPER_ADMIN')
  @ApiOperation({ operationId: 'ghostSeatRuleSkipList', summary: 'List why a run of the rules left subjects out' })
  @ApiSuccessResponse(RuleSkipPageResponseDto, {
    message: 'GHOST_SEAT_RULE_SKIPS.LISTED',
    description:
      'One page of the subjects the run left out (a plan that is not per seat, internal software, a seat that already has a recommendation) and the gate that decided it.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, forbidden('an IT Admin or the Super Admin'), NOT_FOUND, QUERY_INVALID)
  async skips(@Param() params: RuleRunIdParamDto, @Query() query: RuleRunListQueryDto) {
    try {
      return await this.queries.listSkips(params.id, query);
    } catch (error) {
      throw toGhostSeatApiException(error);
    }
  }

  @Get('ghost-seat-kpi5')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'ghostSeatKpi5Get', summary: 'Read KPI-5 over a period' })
  @ApiSuccessResponse(Kpi5ResponseDto, {
    message: 'GHOST_SEAT_KPI5.READ',
    description:
      'The share of recommendations made in the period (G1, G2, and the review and action tiers of the others) that were right, for all and by group.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, forbidden('the Super Admin'), {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'The query is invalid (VALIDATION_ERROR) or the period goes backwards or spans more than a year (GHOST_SEAT.PERIOD_INVALID).',
    examples: [VALIDATION_EXAMPLE, EXAMPLES.PERIOD_INVALID],
  })
  async kpi5(@Query() query: Kpi5QueryDto) {
    try {
      return await this.kpis.kpi5(query.from, query.to);
    } catch (error) {
      throw toGhostSeatApiException(error);
    }
  }
}
