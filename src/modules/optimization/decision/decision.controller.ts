import { Body, Controller, Get, HttpStatus, Param, Post, Query } from '@nestjs/common';
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
import { DecisionReturnService } from './decision-return.service';
import {
  GhostSeatDecisionBodyDto,
  DecisionCreatedResponseDto,
  DecisionListQueryDto,
  DecisionPageResponseDto,
  ExemptionPageResponseDto,
  QueuePageResponseDto,
  QueueQueryDto,
  RecommendationIdParamDto,
  GhostSeatReturnBodyDto,
  ReturnedResponseDto,
} from './decision.dto';
import { DECISION_ERROR_EXAMPLES as EXAMPLES, toDecisionApiException } from './decision.http-errors';
import { DecisionQueueService } from './decision-queue.service';
import { DecisionService } from './decision.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The body, the query or the id is invalid (VALIDATION_ERROR).',
  examples: [VALIDATION_EXAMPLE],
} as const;
const forbidden = (who: string): ErrorResponseDeclaration => ({
  status: HttpStatus.FORBIDDEN,
  description: `Only ${who} may do this.`,
  examples: [FORBIDDEN_EXAMPLE],
});

/** The queue of the head of a department for the seats that look wasted, the choice they make, and the return of the IT Admin. */
@ApiTags('ghost-seats')
@Controller({ version: '1' })
export class DecisionController {
  constructor(
    private readonly queue: DecisionQueueService,
    private readonly decisions: DecisionService,
    private readonly returns: DecisionReturnService,
  ) {}

  @Get('ghost-seat-queue')
  @RequireRoles('MANAGER')
  @ApiOperation({
    operationId: 'ghostSeatQueueList',
    summary: 'List the seat recommendations of my department waiting for my decision',
  })
  @ApiSuccessResponse(QueuePageResponseDto, {
    message: 'GHOST_SEAT_QUEUE.LISTED',
    description:
      'One page of what waits for the head of the department or was returned to them, a person’s rows together, with the fields the head decides on.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, forbidden('a head of a department'), INVALID)
  async list(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: QueueQueryDto) {
    try {
      return await this.queue.list(actor, query);
    } catch (error) {
      throw toDecisionApiException(error);
    }
  }

  @Get('ghost-seat-decisions')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({
    operationId: 'ghostSeatDecisionList',
    summary: 'List the decisions of heads on wasted seats',
  })
  @ApiSuccessResponse(DecisionPageResponseDto, {
    message: 'GHOST_SEAT_DECISIONS.LISTED',
    description:
      'One page of decisions, newest first; `selfDecided=true` is the report of the heads who decided on their own seats.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, forbidden('the Super Admin'), INVALID)
  async listDecisions(@Query() query: DecisionListQueryDto) {
    try {
      return await this.queue.listDecisions({
        page: query.page,
        pageSize: query.pageSize,
        ...(query.selfDecided === undefined ? {} : { selfDecided: query.selfDecided === 'true' }),
      });
    } catch (error) {
      throw toDecisionApiException(error);
    }
  }

  @Get('ghost-seat-exemptions')
  @RequireRoles('MANAGER', 'IT_ADMIN')
  @ApiOperation({
    operationId: 'ghostSeatExemptionList',
    summary: 'List the exemptions of the seats of my department',
  })
  @ApiSuccessResponse(ExemptionPageResponseDto, {
    message: 'GHOST_SEAT_EXEMPTIONS.LISTED',
    description: 'One page of exemptions, newest first; the IT Admin cannot set, change or cancel one.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, forbidden('a head of a department or an IT Admin'), INVALID)
  async listExemptions(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: QueueQueryDto) {
    try {
      return await this.queue.listExemptions(actor, query);
    } catch (error) {
      throw toDecisionApiException(error);
    }
  }

  @Post('ghost-seat-decisions')
  @RequireRoles('MANAGER')
  @ApiOperation({
    operationId: 'ghostSeatDecisionCreate',
    summary: 'Keep, reclaim or exempt the seats recommended to me, with a reason',
  })
  @ApiSuccessResponse(DecisionCreatedResponseDto, {
    status: HttpStatus.CREATED,
    message: 'GHOST_SEAT_DECISION.CREATED',
    description:
      'The choice was saved for every recommendation of the batch: kept or exempted ones are closed, a reclaim opens the revocation with its grace (or is left to expire when the right ends within a month).',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    forbidden('the head of the department that was asked'),
    {
      status: HttpStatus.NOT_FOUND,
      description: 'A recommendation does not exist (GHOST_SEAT.NOT_FOUND).',
      examples: [EXAMPLES.NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'A recommendation is paused (GHOST_SEAT.PAUSED), not waiting for a decision (NOT_DECIDABLE) or its seat cannot be revoked (SEAT_NOT_REVOCABLE); `details.items` names each; nothing was saved.',
      examples: [EXAMPLES.PAUSED],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The body is invalid (VALIDATION_ERROR) or an exemption has no end day (EXEMPTION_REQUIRED) or lasts beyond 12 months or into the past (EXEMPTION_TOO_LONG).',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.EXEMPTION_TOO_LONG],
    },
  )
  async decide(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: GhostSeatDecisionBodyDto) {
    try {
      const items = await this.decisions.decide(actor, {
        recommendationIds: body.items.map((item) => item.recommendationId),
        choice: body.choice,
        reason: body.reason,
        ...(body.exemptUntil ? { exemptUntil: body.exemptUntil } : {}),
      });

      return { items };
    } catch (error) {
      throw toDecisionApiException(error);
    }
  }

  @Post('ghost-seat-recommendations/:id/return')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({
    operationId: 'ghostSeatRecommendationReturn',
    summary: 'Give back to the head a reclaim they decided, with a reason (once)',
  })
  @ApiSuccessResponse(ReturnedResponseDto, {
    message: 'GHOST_SEAT_RECOMMENDATION.RETURNED',
    description:
      'The reason of the head was taken back from the task (cancelled when none stands) and the recommendation is with the head again, due in the working days of the parameter from today.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    forbidden('an IT Admin'),
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The recommendation does not exist (GHOST_SEAT.NOT_FOUND).',
      examples: [EXAMPLES.NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'Not a reclaim of unused or idle seats the head decided (GHOST_SEAT.NOT_RETURNABLE), returned once already (ALREADY_RETURNED) or another IT Admin works the task (TASK_IN_PROGRESS).',
      examples: [EXAMPLES.NOT_RETURNABLE, EXAMPLES.ALREADY_RETURNED, EXAMPLES.TASK_IN_PROGRESS],
    },
    INVALID,
  )
  async returnToHead(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: RecommendationIdParamDto,
    @Body() body: GhostSeatReturnBodyDto,
  ) {
    try {
      const record = await this.returns.returnToHead(actor, params.id, body.reason);

      return {
        recommendation: {
          recommendationId: record.id,
          state: record.state,
          returnCount: record.returnCount,
          decisionDueOn: record.decisionDueOn,
        },
      };
    } catch (error) {
      throw toDecisionApiException(error);
    }
  }
}
