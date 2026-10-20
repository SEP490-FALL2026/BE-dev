import { Body, Controller, Get, HttpStatus, Param, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { CostAllocationView } from '../../finance/finance.types';
import {
  CostAllocationHistoryQueryDto,
  CostAllocationHistoryResponseDto,
  CostAllocationResponseDto,
  DeclareCostAllocationBodyDto,
  DeclaredCostAllocationResponseDto,
} from './subscription-allocation.dto';
import { SubscriptionAllocationService } from './subscription-allocation.service';
import { SubscriptionIdParamDto } from './subscription.dto';
import { toSubscriptionApiException } from './subscription.http-errors';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const READERS = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only the IT Admin and Finance read the cost allocation of a subscription.',
} as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The subscription does not exist (SUBSCRIPTION.NOT_FOUND).',
} as const;
const INVALID_ID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The id or the query is invalid (VALIDATION_ERROR).',
} as const;

const toWire = (allocation: CostAllocationView) => ({ ...allocation, declaredAt: allocation.declaredAt.toISOString() });

/**
 * How the cost of a subscription that is not billed per seat is spread over Cost Centers (`US-04-08`). Finance
 * declares the shares, which add up to exactly 100% (`INV-03`); the IT Admin reads them. The IT Admin, the department
 * head, employees, the spending approver and the Super Admin change nothing (AC-5, `SoD-1`). An allocation is never
 * deleted and no route reports on it: there is none that does either.
 */
@ApiTags('subscriptions')
@Controller({ path: 'subscriptions', version: '1' })
export class SubscriptionAllocationController {
  constructor(private readonly allocations: SubscriptionAllocationService) {}

  @Get(':id/cost-allocation')
  @RequireRoles('IT_ADMIN', 'FINANCE')
  @ApiOperation({ operationId: 'subscriptionCostAllocationGet', summary: 'Get the cost allocation of a subscription' })
  @ApiSuccessResponse(CostAllocationResponseDto, {
    message: 'SUBSCRIPTION_COST_ALLOCATION.FETCHED',
    description:
      'The newest declaration, or status MISSING with none; applicability says whether the plan takes an allocation at all (not a per-seat plan, and a pricing model that is declared).',
  })
  @ApiErrorResponses(...AUTH_ERRORS, READERS, NOT_FOUND, INVALID_ID)
  async get(@Param() params: SubscriptionIdParamDto) {
    try {
      const view = await this.allocations.get(params.id);

      return { ...view, allocation: view.allocation ? toWire(view.allocation) : null };
    } catch (error) {
      throw toSubscriptionApiException(error);
    }
  }

  @Put(':id/cost-allocation')
  @RequireRoles('FINANCE')
  @ApiOperation({
    operationId: 'subscriptionCostAllocationSet',
    summary: 'Declare the cost allocation of a subscription',
  })
  @ApiSuccessResponse(DeclaredCostAllocationResponseDto, {
    message: 'SUBSCRIPTION_COST_ALLOCATION.DECLARED',
    description:
      'The allocation is the current version; a declaration that differs from the current one is a new version and changed says so. The shares add up to exactly 100%.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    { status: HttpStatus.FORBIDDEN, description: 'Only Finance declares a cost allocation.' },
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The plan is billed per seat or its pricing model is not declared (SUBSCRIPTION.COST_ALLOCATION_NOT_APPLICABLE, details.reason).',
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR) or a line is refused: COST_ALLOCATION.TOTAL_NOT_100 (details.totalPercent), RATIO_INVALID, LINE_COUNT_INVALID, COST_CENTER_DUPLICATE, COST_CENTER_NOT_FOUND or COST_CENTER_INACTIVE (details.costCenterIds).',
    },
  )
  async declare(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: SubscriptionIdParamDto,
    @Body() body: DeclareCostAllocationBodyDto,
  ) {
    try {
      const { allocation, changed } = await this.allocations.declare(actor, params.id, body);

      return { allocation: toWire(allocation), changed };
    } catch (error) {
      throw toSubscriptionApiException(error);
    }
  }

  @Get(':id/cost-allocation/history')
  @RequireRoles('IT_ADMIN', 'FINANCE')
  @ApiOperation({
    operationId: 'subscriptionCostAllocationHistory',
    summary: 'List the declarations of a cost allocation',
  })
  @ApiSuccessResponse(CostAllocationHistoryResponseDto, {
    message: 'SUBSCRIPTION_COST_ALLOCATION.HISTORY_LISTED',
    description: 'A page of the declarations, newest first, each with who declared it and when. None is ever changed.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, READERS, NOT_FOUND, INVALID_ID)
  async history(@Param() params: SubscriptionIdParamDto, @Query() query: CostAllocationHistoryQueryDto) {
    try {
      const page = await this.allocations.history(params.id, query);

      return { items: page.items.map(toWire), pagination: page.pagination };
    } catch (error) {
      throw toSubscriptionApiException(error);
    }
  }
}
