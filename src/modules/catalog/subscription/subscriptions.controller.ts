import { Body, Controller, Get, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
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
import {
  DeclareSubscriptionBodyDto,
  ListSubscriptionsQueryDto,
  SubscriptionIdParamDto,
  SubscriptionPageResponseDto,
  SubscriptionResponseDto,
  UpdateSubscriptionBodyDto,
} from './subscription.dto';
import { toSubscriptionApiException } from './subscription.http-errors';
import { SubscriptionService } from './subscription.service';
import type { SubscriptionView } from './subscription.types';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const IT_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only an IT Admin declares or changes subscriptions.',
} as const;
const READERS = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only the IT Admin and Finance read subscriptions: prices and contracts are hidden from the rest.',
} as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The subscription does not exist (SUBSCRIPTION.NOT_FOUND).',
} as const;
const INVALID_UPDATE_NOTE =
  ' An update that would put the seats bought under the seats taken is refused with SUBSCRIPTION.QUANTITY_BELOW_OCCUPIED (details.occupied, details.requested).';
const INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description:
    'The request is invalid (VALIDATION_ERROR) or a rule refuses it: SUBSCRIPTION.PLAN_NOT_FOUND, PLAN_HAS_NO_SUBSCRIPTION, PERPETUAL_NEEDS_LICENSED_APPLICATION, PERPETUAL_HAS_NO_TERM, DATES_INVALID or UPDATE_EMPTY; the price is refused with MONEY_SCALE_EXCEEDED, MONEY_OUT_OF_RANGE or CURRENCY_NOT_SUPPORTED.',
} as const;
const INVALID_UPDATE = { ...INVALID, description: INVALID.description + INVALID_UPDATE_NOTE } as const;

const toWire = (view: SubscriptionView) => ({
  ...view,
  createdAt: view.createdAt.toISOString(),
  updatedAt: view.updatedAt.toISOString(),
});

/**
 * The subscriptions and perpetual purchases of the plans (`US-04-03`, `US-04-05`). The IT Admin declares and changes
 * them; Finance reads them. Finance, the department head, employees, the spending approver and the Super Admin change
 * nothing, and the department head and employees see no price (AC-10, `SoD-2`, `SoD-5`). A subscription is never
 * deleted: there is no route that does.
 */
@ApiTags('subscriptions')
@Controller({ path: 'subscriptions', version: '1' })
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionService) {}

  @Get()
  @RequireRoles('IT_ADMIN', 'FINANCE')
  @ApiOperation({ operationId: 'subscriptionList', summary: 'List subscriptions' })
  @ApiSuccessResponse(SubscriptionPageResponseDto, {
    message: 'SUBSCRIPTION.LISTED',
    description:
      'A page of subscriptions by application, plan and creation, optionally filtered; warning=NO_ALERT_ANCHOR lists those with no date to alert from.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, READERS, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The query is invalid (VALIDATION_ERROR).',
  })
  async list(@Query() query: ListSubscriptionsQueryDto) {
    try {
      const page = await this.subscriptions.list(query);
      const emptyState = page.items.length === 0 ? await this.subscriptions.emptyState() : null;

      return { items: page.items.map(toWire), pagination: page.pagination, emptyState };
    } catch (error) {
      throw toSubscriptionApiException(error);
    }
  }

  @Post()
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'subscriptionCreate', summary: 'Declare a subscription or a perpetual purchase' })
  @ApiSuccessResponse(SubscriptionResponseDto, {
    status: HttpStatus.CREATED,
    message: 'SUBSCRIPTION.CREATED',
    description:
      'The subscription is stored: a draft while its data is incomplete, with what is missing; the unit price keeps the conversion at the rate of the day it was recorded.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, IT_ONLY, INVALID)
  async declare(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: DeclareSubscriptionBodyDto) {
    try {
      return toWire(await this.subscriptions.declare(actor, body));
    } catch (error) {
      throw toSubscriptionApiException(error);
    }
  }

  @Get(':id')
  @RequireRoles('IT_ADMIN', 'FINANCE')
  @ApiOperation({ operationId: 'subscriptionGet', summary: 'Get a subscription' })
  @ApiSuccessResponse(SubscriptionResponseDto, {
    message: 'SUBSCRIPTION.FETCHED',
    description:
      'The subscription with its derived notice deadline and source, alert dates, warning, tax profile and tax estimate.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, READERS, NOT_FOUND, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The id is not a UUID (VALIDATION_ERROR).',
  })
  async get(@Param() params: SubscriptionIdParamDto) {
    try {
      return toWire(await this.subscriptions.get(params.id));
    } catch (error) {
      throw toSubscriptionApiException(error);
    }
  }

  @Patch(':id')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'subscriptionUpdate', summary: 'Update a subscription' })
  @ApiSuccessResponse(SubscriptionResponseDto, {
    message: 'SUBSCRIPTION.UPDATED',
    description:
      'The subscription as it is after the change; a new unit price is converted again at the rate of today; a change of nothing is answered the same and not audited. The plan and the kind cannot change.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, IT_ONLY, INVALID_UPDATE, NOT_FOUND)
  async update(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: SubscriptionIdParamDto,
    @Body() body: UpdateSubscriptionBodyDto,
  ) {
    try {
      return toWire(await this.subscriptions.update(actor, params.id, body));
    } catch (error) {
      throw toSubscriptionApiException(error);
    }
  }

  @Post(':id/completions')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'subscriptionComplete', summary: 'Complete a draft subscription' })
  @ApiSuccessResponse(SubscriptionResponseDto, {
    message: 'SUBSCRIPTION.COMPLETED',
    description:
      'The draft becomes active once its data is whole; a price with no rate for its day is converted at the rate entered for that day. An active subscription is answered unchanged.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, IT_ONLY, NOT_FOUND, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'The id is invalid (VALIDATION_ERROR) or the subscription still lacks data or the rate of its price day (SUBSCRIPTION.STILL_DRAFT, details.missing).',
  })
  async complete(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: SubscriptionIdParamDto) {
    try {
      return toWire(await this.subscriptions.complete(actor, params.id));
    } catch (error) {
      throw toSubscriptionApiException(error);
    }
  }
}
