import { Body, Controller, Get, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
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
  AddSubscriptionLineBodyDto,
  SeatChangeListQueryDto,
  SeatChangePageResponseDto,
  SubscriptionLineIdParamDto,
  SubscriptionLineParentParamDto,
  SubscriptionLineResponseDto,
  UpdateSubscriptionLineBodyDto,
} from './subscription-line.dto';
import {
  SUBSCRIPTION_LINE_ERROR_EXAMPLES as EXAMPLES,
  toSubscriptionLineApiException,
} from './subscription-line.http-errors';
import { SeatChangeQueryService } from './seat-change-query.service';
import { SubscriptionLineService } from './subscription-line.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const ADD_LINE_RESPONSES = [
  ...AUTH_ERRORS,
  {
    status: HttpStatus.FORBIDDEN,
    description: 'Only the IT Admin responsible for the subscription may add a line.',
    examples: [FORBIDDEN_EXAMPLE, EXAMPLES.NOT_RESPONSIBLE],
  },
  {
    status: HttpStatus.NOT_FOUND,
    description: 'Subscription period or workspace not found.',
    examples: [EXAMPLES.PERIOD_NOT_FOUND],
  },
  {
    status: HttpStatus.CONFLICT,
    description:
      'Period changed concurrently (SUBSCRIPTION.STALE), live line already exists (SUBSCRIPTION.DUPLICATE_PLAN), or period already has 20 lines (SUBSCRIPTION.LINES_LIMIT).',
    examples: [EXAMPLES.PERIOD_STALE, EXAMPLES.DUPLICATE_PLAN, EXAMPLES.LINES_LIMIT],
  },
  {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'Validation failed or business rule rejected the line.',
    examples: [
      VALIDATION_EXAMPLE,
      EXAMPLES.QUANTITY_VIA_PURCHASE,
      EXAMPLES.WORKSPACE_VENDOR_MISMATCH,
      EXAMPLES.PLAN_NOT_K2,
      EXAMPLES.NOT_TERM,
      EXAMPLES.PRICE_NOT_VND,
      EXAMPLES.PLAN_NOT_FOUND,
      EXAMPLES.APPLICATION_RETIRED,
      EXAMPLES.MONEY_SCALE_EXCEEDED,
      EXAMPLES.MONEY_OUT_OF_RANGE,
    ],
  },
] as const;

@ApiTags('subscription-lines')
@Controller({ version: '1' })
export class SubscriptionLinesController {
  constructor(
    private readonly lines: SubscriptionLineService,
    private readonly seatChanges: SeatChangeQueryService,
  ) {}

  @Post('subscriptions/:id/lines')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({
    operationId: 'subscriptionLineAdd',
    summary: 'Add a seat-managed plan line to an existing subscription period',
  })
  @ApiSuccessResponse(SubscriptionLineResponseDto, {
    status: HttpStatus.CREATED,
    message: 'SUBSCRIPTION_LINE.ADDED',
    description:
      'Creates a live line for a K2 plan of the same vendor on the subscription period and opens its seat ledger when the period is already active.',
  })
  @ApiErrorResponses(...ADD_LINE_RESPONSES)
  async addLine(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: SubscriptionLineParentParamDto,
    @Body() body: AddSubscriptionLineBodyDto,
  ) {
    try {
      return await this.lines.addLine(actor, params.id, {
        planId: body.planId,
        monthlyUnitPrice: body.monthlyUnitPrice,
        minimumSeats: body.minimumSeats,
        quantity: body.quantity,
        expectedUpdatedAt: new Date(body.expectedUpdatedAt),
      });
    } catch (error) {
      throw toSubscriptionLineApiException(error);
    }
  }

  @Patch('subscription-lines/:id')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({
    operationId: 'subscriptionLineUpdate',
    summary: 'Update monthly unit price or minimum seats on a live subscription line',
  })
  @ApiSuccessResponse(SubscriptionLineResponseDto, {
    message: 'SUBSCRIPTION_LINE.UPDATED',
    description: 'Updates the monthly unit price (applied to unrun future months) and/or minimum seats of a live line.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only the IT Admin responsible for the subscription may update a line.',
      examples: [FORBIDDEN_EXAMPLE, EXAMPLES.NOT_RESPONSIBLE],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'Subscription line not found.',
      examples: [EXAMPLES.NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'Line changed concurrently (SUBSCRIPTION_LINE.STALE) or is already closed (SUBSCRIPTION_LINE.CLOSED).',
      examples: [EXAMPLES.STALE, EXAMPLES.CLOSED],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'Validation failed or price is not in VND.',
      examples: [
        VALIDATION_EXAMPLE,
        EXAMPLES.UPDATE_EMPTY,
        EXAMPLES.PRICE_NOT_VND,
        EXAMPLES.MONEY_SCALE_EXCEEDED,
        EXAMPLES.MONEY_OUT_OF_RANGE,
      ],
    },
  )
  async updateLine(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: SubscriptionLineIdParamDto,
    @Body() body: UpdateSubscriptionLineBodyDto,
  ) {
    try {
      return await this.lines.updateLine(actor, params.id, {
        monthlyUnitPrice: body.monthlyUnitPrice,
        minimumSeats: body.minimumSeats,
        expectedUpdatedAt: new Date(body.expectedUpdatedAt),
      });
    } catch (error) {
      throw toSubscriptionLineApiException(error);
    }
  }

  @Get('subscription-lines/:id/seat-changes')
  @RequireRoles('IT_ADMIN', 'FINANCE', 'SUPER_ADMIN')
  @ApiOperation({
    operationId: 'subscriptionLineSeatChangeList',
    summary: 'List seat-ledger changes for a subscription line',
  })
  @ApiSuccessResponse(SeatChangePageResponseDto, {
    message: 'SUBSCRIPTION_LINE_SEAT_CHANGE.LISTED',
    description: 'Paged history of seat changes on the line, ordered newest effective date and entry first.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Requires IT_ADMIN, FINANCE, or SUPER_ADMIN role.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'Subscription line not found.',
      examples: [EXAMPLES.NOT_FOUND],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'Invalid identifier or paging query.',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async listSeatChanges(@Param() params: SubscriptionLineIdParamDto, @Query() query: SeatChangeListQueryDto) {
    try {
      return await this.seatChanges.listByLine(params.id, query);
    } catch (error) {
      throw toSubscriptionLineApiException(error);
    }
  }
}
