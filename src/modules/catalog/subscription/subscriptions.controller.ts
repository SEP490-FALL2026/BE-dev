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
  DeclareSubscriptionBodyDto,
  ListSubscriptionsQueryDto,
  SubscriptionIdParamDto,
  SubscriptionPageResponseDto,
  SubscriptionResponseDto,
  UpdateSubscriptionBodyDto,
} from './subscription.dto';
import { withoutVendorAdminDetail } from './pool/subscription-pool.policy';
import { SUBSCRIPTION_ERROR_EXAMPLES, toSubscriptionApiException } from './subscription.http-errors';
import { SubscriptionChangeService } from './subscription-change.service';
import { SubscriptionService } from './subscription.service';
import type { SubscriptionView } from './subscription.types';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const IT_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only an IT Admin declares or changes subscriptions.',
  examples: [FORBIDDEN_EXAMPLE],
} as const;
const READERS = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only the IT Admin and Finance read subscriptions: prices and contracts are hidden from the rest.',
  examples: [FORBIDDEN_EXAMPLE],
} as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The subscription does not exist (SUBSCRIPTION.NOT_FOUND).',
  examples: [SUBSCRIPTION_ERROR_EXAMPLES.NOT_FOUND],
} as const;
const INVALID_UPDATE_NOTE =
  ' An update that would put the seats bought under the seats taken is refused with SUBSCRIPTION.QUANTITY_BELOW_OCCUPIED (details.occupied, details.requested).';
const INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description:
    'The request is invalid (VALIDATION_ERROR) or a rule refuses it: SUBSCRIPTION.PLAN_NOT_FOUND, OWNER_DEPARTMENT_INACTIVE and APPLICATION_RETIRED (declaring only), PLAN_HAS_NO_SUBSCRIPTION, PERPETUAL_NEEDS_LICENSED_APPLICATION, PERPETUAL_HAS_NO_TERM, DATES_INVALID or UPDATE_EMPTY; the shared-pool rules refuse COMMITMENT_TERM_REQUIRED (a term that becomes active names 1 or 12 months), COMMITMENT_TERM_NOT_ALLOWED (a perpetual purchase), K1_MONTHLY_ONLY (R-E01), BILLING_LONGER_THAN_COMMITMENT (R-G01), BILLING_CYCLE_UNSUPPORTED (only MONTHLY and ANNUAL are written; QUARTERLY and OTHER stay readable on older data), RESPONSIBLE_REQUIRED (an active subscription names the IT Admin who answers for it), RESPONSIBLE_NOT_IT_ADMIN and VENDOR_ADMINS_REQUIRED (a plan that needs admins at the vendor, a K2 plan or a K4 plan with an admin console, is not activated as a new subscription, nor its pool made, while its workspace profile names fewer than two different IT Admins; the period a renewal continues is never asked, it only carries the flag vendorAdminsBelowMinimum), and an update may also be refused with PRIMARY_NOT_ELIGIBLE (details.reason); the price is refused with MONEY_SCALE_EXCEEDED, MONEY_OUT_OF_RANGE or CURRENCY_NOT_SUPPORTED.',
  examples: [
    VALIDATION_EXAMPLE,
    SUBSCRIPTION_ERROR_EXAMPLES.PLAN_NOT_FOUND,
    SUBSCRIPTION_ERROR_EXAMPLES.OWNER_DEPARTMENT_INACTIVE,
    SUBSCRIPTION_ERROR_EXAMPLES.APPLICATION_RETIRED,
    SUBSCRIPTION_ERROR_EXAMPLES.PLAN_HAS_NO_SUBSCRIPTION,
    SUBSCRIPTION_ERROR_EXAMPLES.PERPETUAL_NEEDS_LICENSED_APPLICATION,
    SUBSCRIPTION_ERROR_EXAMPLES.PERPETUAL_HAS_NO_TERM,
    SUBSCRIPTION_ERROR_EXAMPLES.DATES_INVALID,
    SUBSCRIPTION_ERROR_EXAMPLES.COMMITMENT_TERM_REQUIRED,
    SUBSCRIPTION_ERROR_EXAMPLES.COMMITMENT_TERM_NOT_ALLOWED,
    SUBSCRIPTION_ERROR_EXAMPLES.K1_MONTHLY_ONLY,
    SUBSCRIPTION_ERROR_EXAMPLES.BILLING_LONGER_THAN_COMMITMENT,
    SUBSCRIPTION_ERROR_EXAMPLES.BILLING_CYCLE_UNSUPPORTED,
    SUBSCRIPTION_ERROR_EXAMPLES.RESPONSIBLE_REQUIRED,
    SUBSCRIPTION_ERROR_EXAMPLES.VENDOR_ADMINS_REQUIRED,
    SUBSCRIPTION_ERROR_EXAMPLES.RESPONSIBLE_NOT_IT_ADMIN,
    SUBSCRIPTION_ERROR_EXAMPLES.MONEY_SCALE_EXCEEDED,
    SUBSCRIPTION_ERROR_EXAMPLES.MONEY_OUT_OF_RANGE,
    SUBSCRIPTION_ERROR_EXAMPLES.CURRENCY_NOT_SUPPORTED,
  ],
} as const;
const INVALID_UPDATE = {
  ...INVALID,
  description: INVALID.description + INVALID_UPDATE_NOTE,
  examples: [
    VALIDATION_EXAMPLE,
    SUBSCRIPTION_ERROR_EXAMPLES.UPDATE_EMPTY,
    SUBSCRIPTION_ERROR_EXAMPLES.QUANTITY_BELOW_OCCUPIED,
    SUBSCRIPTION_ERROR_EXAMPLES.PERPETUAL_HAS_NO_TERM,
    SUBSCRIPTION_ERROR_EXAMPLES.DATES_INVALID,
    SUBSCRIPTION_ERROR_EXAMPLES.STILL_DRAFT,
    SUBSCRIPTION_ERROR_EXAMPLES.COMMITMENT_TERM_REQUIRED,
    SUBSCRIPTION_ERROR_EXAMPLES.COMMITMENT_TERM_NOT_ALLOWED,
    SUBSCRIPTION_ERROR_EXAMPLES.K1_MONTHLY_ONLY,
    SUBSCRIPTION_ERROR_EXAMPLES.BILLING_LONGER_THAN_COMMITMENT,
    SUBSCRIPTION_ERROR_EXAMPLES.BILLING_CYCLE_UNSUPPORTED,
    SUBSCRIPTION_ERROR_EXAMPLES.RESPONSIBLE_REQUIRED,
    SUBSCRIPTION_ERROR_EXAMPLES.VENDOR_ADMINS_REQUIRED,
    SUBSCRIPTION_ERROR_EXAMPLES.RESPONSIBLE_NOT_IT_ADMIN,
    SUBSCRIPTION_ERROR_EXAMPLES.PRIMARY_NOT_ELIGIBLE,
    SUBSCRIPTION_ERROR_EXAMPLES.MONEY_SCALE_EXCEEDED,
    SUBSCRIPTION_ERROR_EXAMPLES.MONEY_OUT_OF_RANGE,
    SUBSCRIPTION_ERROR_EXAMPLES.CURRENCY_NOT_SUPPORTED,
  ],
} as const;
/** Declaring or completing a subscription of a K2 or K4 plan that already has a live one, once the seat baseline is closed (R-E02, `QĐ-104k`(3)). */
const DUPLICATE_PLAN_CONFLICT = {
  status: HttpStatus.CONFLICT,
  description:
    'The plan is a K2 or K4 plan, another subscription of it is live (a draft, or active and not continued by a later period, not ended) and the seat baseline is closed: add seats to that one or renew it instead (SUBSCRIPTION.DUPLICATE_PLAN, details.subscriptionIds, nothing is written). While the baseline is open the write is accepted and the answer says SHOULD_MERGE in warnings. A price was to be converted, but the reporting currency of the installation is not in the currency table (REPORTING_CURRENCY_NOT_SUPPORTED, details.currency): a fault of the configuration, not of the request.',
  examples: [SUBSCRIPTION_ERROR_EXAMPLES.DUPLICATE_PLAN, SUBSCRIPTION_ERROR_EXAMPLES.REPORTING_CURRENCY_NOT_SUPPORTED],
} as const;

/** The update is the one route whose conflict is not only the configuration: a change that owes more needs a Cost Center. */
const UPDATE_CONFLICT = {
  status: HttpStatus.CONFLICT,
  description:
    'The department that owns the subscription has no Cost Center in use yet and the change creates, raises or extends what is owed: a higher quantity, a later end or renewal date (or one where there was none), auto renewal switched on or a higher unit price (FINANCE.SETUP_INCOMPLETE, nothing is written). A price was to be converted, but the reporting currency of the installation is not in the currency table (REPORTING_CURRENCY_NOT_SUPPORTED, details.currency): a fault of the configuration, not of the request. The unique index of the flag that makes a subscription the primary one of its plan refuses the loser of a race (SUBSCRIPTION.PRIMARY_CONFLICT); the plan is locked for the write, so it normally does not fire.',
  examples: [
    SUBSCRIPTION_ERROR_EXAMPLES.FINANCE_SETUP_INCOMPLETE,
    SUBSCRIPTION_ERROR_EXAMPLES.REPORTING_CURRENCY_NOT_SUPPORTED,
    SUBSCRIPTION_ERROR_EXAMPLES.PRIMARY_CONFLICT,
  ],
} as const;

const toWire = (view: SubscriptionView) => ({
  ...view,
  createdAt: view.createdAt.toISOString(),
  updatedAt: view.updatedAt.toISOString(),
});

/** What the caller reads: the vendor admins, the email and the note are the IT Admin's (SPEC P19); Finance reads the rest and the flags. */
const toWireFor = (actor: AuthenticatedPrincipal, view: SubscriptionView) =>
  toWire(actor.roles.includes('IT_ADMIN') ? view : withoutVendorAdminDetail(view));

/**
 * The subscriptions and perpetual purchases of the plans (`US-04-03`, `US-04-05`). The IT Admin declares and changes
 * them; Finance reads them. Finance, the department head, employees, the spending approver and the Super Admin change
 * nothing, and the department head and employees see no price (AC-10, `SoD-2`, `SoD-5`). A subscription is never
 * deleted: there is no route that does.
 */
@ApiTags('subscriptions')
@Controller({ path: 'subscriptions', version: '1' })
export class SubscriptionsController {
  constructor(
    private readonly subscriptions: SubscriptionService,
    private readonly changes: SubscriptionChangeService,
  ) {}

  @Get()
  @RequireRoles('IT_ADMIN', 'FINANCE')
  @ApiOperation({ operationId: 'subscriptionList', summary: 'List subscriptions' })
  @ApiSuccessResponse(SubscriptionPageResponseDto, {
    message: 'SUBSCRIPTION.LISTED',
    description:
      'A page of subscriptions by application, plan and creation, optionally filtered; warning=NO_ALERT_ANCHOR lists those with no date to alert from. Who administers the plan at the vendor (vendorAdmins), the email of the company account that owns it there (ownerAccountEmail) and the note (adminNote) are for the IT Admin: Finance reads them empty, with the two flags.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, READERS, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The query is invalid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async list(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: ListSubscriptionsQueryDto) {
    try {
      const page = await this.subscriptions.list(query);
      const emptyState = page.items.length === 0 ? await this.subscriptions.emptyState() : null;

      return { items: page.items.map((item) => toWireFor(actor, item)), pagination: page.pagination, emptyState };
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
  @ApiErrorResponses(...AUTH_ERRORS, IT_ONLY, INVALID, DUPLICATE_PLAN_CONFLICT)
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
      'The subscription with its derived notice deadline and source, alert dates, warning, tax profile and tax estimate. Who administers the plan at the vendor (vendorAdmins), the email of the company account that owns it there (ownerAccountEmail) and the note (adminNote) are for the IT Admin: Finance reads them empty, with the two flags.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, READERS, NOT_FOUND, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The id is not a UUID (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async get(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: SubscriptionIdParamDto) {
    try {
      return toWireFor(actor, await this.subscriptions.get(params.id));
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
      'The subscription as it is after the change; a new unit price is converted again at the rate of today; a change of nothing is answered the same and not audited. The plan, the kind and the owner department cannot change.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, IT_ONLY, INVALID_UPDATE, NOT_FOUND, UPDATE_CONFLICT)
  async update(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: SubscriptionIdParamDto,
    @Body() body: UpdateSubscriptionBodyDto,
  ) {
    try {
      return toWire(await this.changes.update(actor, params.id, body));
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
  @ApiErrorResponses(...AUTH_ERRORS, IT_ONLY, NOT_FOUND, DUPLICATE_PLAN_CONFLICT, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'The id is invalid (VALIDATION_ERROR) or the subscription still lacks data or the rate of its price day (SUBSCRIPTION.STILL_DRAFT, details.missing), or the shared-pool rules refuse it: COMMITMENT_TERM_REQUIRED, K1_MONTHLY_ONLY, RESPONSIBLE_REQUIRED, RESPONSIBLE_NOT_IT_ADMIN, VENDOR_ADMINS_REQUIRED.',
    examples: [
      VALIDATION_EXAMPLE,
      SUBSCRIPTION_ERROR_EXAMPLES.STILL_DRAFT,
      SUBSCRIPTION_ERROR_EXAMPLES.COMMITMENT_TERM_REQUIRED,
      SUBSCRIPTION_ERROR_EXAMPLES.K1_MONTHLY_ONLY,
      SUBSCRIPTION_ERROR_EXAMPLES.RESPONSIBLE_REQUIRED,
      SUBSCRIPTION_ERROR_EXAMPLES.VENDOR_ADMINS_REQUIRED,
      SUBSCRIPTION_ERROR_EXAMPLES.RESPONSIBLE_NOT_IT_ADMIN,
      SUBSCRIPTION_ERROR_EXAMPLES.MONEY_OUT_OF_RANGE,
    ],
  })
  async complete(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: SubscriptionIdParamDto) {
    try {
      return toWire(await this.subscriptions.complete(actor, params.id));
    } catch (error) {
      throw toSubscriptionApiException(error);
    }
  }
}
