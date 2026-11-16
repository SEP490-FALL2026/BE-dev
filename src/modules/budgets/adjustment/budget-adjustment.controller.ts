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
import {
  AdjustmentIdParamDto,
  AdjustmentListResponseDto,
  AdjustmentQueryDto,
  AdjustmentResponseDto,
  CreateAdjustmentBodyDto,
  DecideAdjustmentBodyDto,
} from './budget-adjustment.dto';
import {
  BUDGET_ADJUSTMENT_ERROR_EXAMPLES as EXAMPLES,
  toBudgetAdjustmentApiException,
} from './budget-adjustment.http-errors';
import { BudgetAdjustmentCreateService } from './budget-adjustment-create.service';
import { BudgetAdjustmentDecisionService } from './budget-adjustment-decision.service';
import { BudgetAdjustmentQueryService } from './budget-adjustment-query.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;

/**
 * The adjustments of the budget in the year: Finance makes one on any day with the reason, the spending approver approves or refuses it, and what the budget of a Cost Center
 * is from then on is its approved version with what was adjusted (the effective budget). Finance and the spending approver read every adjustment; a manager reads the ones
 * that give to or take from the Cost Center of their own department.
 */
@ApiTags('budget-adjustments')
@Controller({ path: 'budget-adjustments', version: '1' })
export class BudgetAdjustmentController {
  constructor(
    private readonly creations: BudgetAdjustmentCreateService,
    private readonly decisions: BudgetAdjustmentDecisionService,
    private readonly queries: BudgetAdjustmentQueryService,
  ) {}

  @Post()
  @RequireRoles('FINANCE')
  @ApiOperation({ operationId: 'budgetAdjustmentCreate', summary: 'Ask for an adjustment of the budget of the year' })
  @ApiSuccessResponse(AdjustmentResponseDto, {
    status: HttpStatus.CREATED,
    message: 'BUDGET_ADJUSTMENT.CREATED',
    description:
      'Finance asks, with the reason, to give a Cost Center money from what is not allocated under the annual ceiling (SUPPLEMENT), to move money between two Cost Centers (TRANSFER, with COST_CENTER_CHANGE when a department changed its Cost Center), to give money back (RETURN), or to lower the annual ceiling (CEILING_REDUCTION). A supplement and a reduction of the ceiling cannot be more than what is not allocated; a return and the Cost Center that gives in a transfer are never left with less than the forecast of the end of their year (a transfer for COST_CENTER_CHANGE is not held to that) and never give more than their base. The spending approver is asked to decide; nothing in the budget changes until then.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only Finance asks for an adjustment.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The budget cycle of the year is not open yet (BUDGET_CYCLE.NOT_OPEN) or still takes proposals, so no budget of the year is made to adjust (BUDGET_ADJUSTMENT.CYCLE_NOT_LOCKED: asked once the cycle is locked, the day after its submission deadline); the Cost Center that receives has a version of the year still being decided (BUDGET_ADJUSTMENT.VERSION_IN_FLIGHT) or a proposal that waits for its version (BUDGET_ADJUSTMENT.BUDGET_IN_PREPARATION).',
      examples: [
        EXAMPLES.CYCLE_NOT_OPEN,
        EXAMPLES.CYCLE_NOT_LOCKED,
        EXAMPLES.VERSION_IN_FLIGHT,
        EXAMPLES.BUDGET_IN_PREPARATION,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The body is invalid (VALIDATION_ERROR), the year has ended (BUDGET.YEAR_ENDED), the adjustment is not made as its kind is meant (BUDGET_ADJUSTMENT.INVALID_SHAPE), it is more than what is not allocated (BUDGET_ADJUSTMENT.OVER_UNALLOCATED), it would leave a Cost Center below its forecast (BUDGET_ADJUSTMENT.BELOW_FORECAST_FLOOR) or give more than its base (BUDGET_ADJUSTMENT.OVER_BASE), or the Cost Center has no budget to give from (BUDGET_ADJUSTMENT.NO_BUDGET).',
      examples: [
        VALIDATION_EXAMPLE,
        EXAMPLES.INVALID_SHAPE,
        EXAMPLES.OVER_UNALLOCATED,
        EXAMPLES.BELOW_FORECAST_FLOOR,
        EXAMPLES.OVER_BASE,
        EXAMPLES.NO_BUDGET,
      ],
    },
  )
  async create(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: CreateAdjustmentBodyDto) {
    try {
      return await this.creations.create(actor, body);
    } catch (error) {
      throw toBudgetAdjustmentApiException(error);
    }
  }

  @Get()
  @RequireRoles('FINANCE', 'SPENDING_APPROVER', 'MANAGER')
  @ApiOperation({ operationId: 'budgetAdjustmentList', summary: 'List the adjustments of the budget' })
  @ApiSuccessResponse(AdjustmentListResponseDto, {
    message: 'BUDGET_ADJUSTMENT.LISTED',
    description:
      'A page of the adjustments, the latest first, with who asked, who decided and why. Finance and the spending approver read every adjustment; a manager reads the ones that give to or take from the Cost Center of their own department, and a department with no Cost Center reads none.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only Finance, the spending approver and the manager of a department read the adjustments.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The query is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async list(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: AdjustmentQueryDto) {
    try {
      return await this.queries.list(actor, query);
    } catch (error) {
      throw toBudgetAdjustmentApiException(error);
    }
  }

  @Post(':id/decision')
  @RequireRoles('SPENDING_APPROVER')
  @ApiOperation({ operationId: 'budgetAdjustmentDecide', summary: 'Approve or refuse an adjustment of the budget' })
  @ApiSuccessResponse(AdjustmentResponseDto, {
    message: 'BUDGET_ADJUSTMENT.DECIDED',
    description:
      'The spending approver approves or refuses an adjustment, once; the one who asked cannot decide it. Every condition is looked at again on the figures of today. An approval adds to or takes from the base of the Cost Centers it names, the reserve staying as it is, makes the approved version of a Cost Center that receives money and had no budget of the year (with the amount as its base and no reserve), and lowers the annual ceiling for a reduction of the ceiling. A refusal needs a reason and changes nothing.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'Only the spending approver decides, and never an adjustment they asked for (BUDGET.CONFLICT_OF_INTEREST).',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The adjustment does not exist (BUDGET_ADJUSTMENT.NOT_FOUND).',
      examples: [EXAMPLES.NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The adjustment was decided already (BUDGET_ADJUSTMENT.ALREADY_DECIDED), the cycle of the year does not stand locked (BUDGET_CYCLE.NOT_OPEN, BUDGET_ADJUSTMENT.CYCLE_NOT_LOCKED), or the Cost Center that receives has a version of the year still being decided (BUDGET_ADJUSTMENT.VERSION_IN_FLIGHT) or a proposal that waits for its version (BUDGET_ADJUSTMENT.BUDGET_IN_PREPARATION).',
      examples: [
        EXAMPLES.ALREADY_DECIDED,
        EXAMPLES.CYCLE_NOT_OPEN,
        EXAMPLES.CYCLE_NOT_LOCKED,
        EXAMPLES.VERSION_IN_FLIGHT,
        EXAMPLES.BUDGET_IN_PREPARATION,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        "The body or the id is invalid (VALIDATION_ERROR), a refusal has no reason (BUDGET.ADJUSTMENT_REASON_REQUIRED), or a condition no longer holds on today's figures (BUDGET_ADJUSTMENT.OVER_UNALLOCATED, BELOW_FORECAST_FLOOR, OVER_BASE, NO_BUDGET).",
      examples: [
        VALIDATION_EXAMPLE,
        EXAMPLES.OVER_UNALLOCATED,
        EXAMPLES.BELOW_FORECAST_FLOOR,
        EXAMPLES.OVER_BASE,
        EXAMPLES.NO_BUDGET,
      ],
    },
  )
  async decide(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: AdjustmentIdParamDto,
    @Body() body: DecideAdjustmentBodyDto,
  ) {
    try {
      return await this.decisions.decide(actor, params.id, body);
    } catch (error) {
      throw toBudgetAdjustmentApiException(error);
    }
  }
}
