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
const LOT_RULES_NOTE =
  ' A plan of personal accounts (K1) has no subscription: its rights are held per person (SUBSCRIPTION.K1_HAS_NO_SUBSCRIPTION); a perpetual purchase is a lot of licenses, made by the lot route (SUBSCRIPTION.PERPETUAL_IS_LICENSE_LOT).';
const RETIRED_PRIMARY_NOTE =
  ' A subscription of a retired plan cannot be made the primary one (SUBSCRIPTION.PRIMARY_RETIRED).';
const SEAT_LEDGER_NOTE =
  ' The number of seats is no longer written here: a seat is bought or reduced on the lines of the period (SUBSCRIPTION.SEAT_COUNT_VIA_LEDGER, details.routes).';
const INVALID_UPDATE_NOTE =
  ' Changing purchasedQuantity requires expectedUpdatedAt (SUBSCRIPTION.VERSION_REQUIRED) and increasing it on an active K2 subscription requires quantityChangeReason (SUBSCRIPTION.QUANTITY_REASON_REQUIRED). An update that would put the seats bought under the seats taken is refused with SUBSCRIPTION.QUANTITY_BELOW_OCCUPIED (details.occupied, details.requested). An active subscription is never lowered to a draft by an update: one still priced in another currency (an earlier release could not convert it) is refused with SUBSCRIPTION.STILL_DRAFT (details.missing is UNIT_PRICE) until the update enters the price in dong, and it stays active.' +
  RETIRED_PRIMARY_NOTE;
const INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description:
    'The request is invalid (VALIDATION_ERROR) or a rule refuses it: SUBSCRIPTION.PLAN_NOT_FOUND and APPLICATION_RETIRED (declaring only), PLAN_HAS_NO_SUBSCRIPTION, PERPETUAL_NEEDS_LICENSED_APPLICATION, PERPETUAL_HAS_NO_TERM, DATES_INVALID or UPDATE_EMPTY; the shared-pool rules refuse COMMITMENT_TERM_REQUIRED (a term that becomes active names 1 or 12 months), COMMITMENT_TERM_NOT_ALLOWED (a perpetual purchase), K1_MONTHLY_ONLY (R-E01), K4_PERPETUAL_ONLY (a K4 plan is bought once: only a perpetual purchase is written for it), BILLING_LONGER_THAN_COMMITMENT (R-G01), BILLING_CYCLE_UNSUPPORTED (only MONTHLY and ANNUAL are written; QUARTERLY and OTHER stay readable on older data), RESPONSIBLE_REQUIRED (an active subscription names the IT Admin who answers for it), RESPONSIBLE_NOT_IT_ADMIN and VENDOR_ADMINS_REQUIRED (a plan that needs admins at the vendor, a K2 plan or a K4 plan with an admin console, is not activated as a new subscription, nor its pool made, once the seat baseline is closed while fewer than two different working IT Admins are recorded in its workspace profile; while the seat baseline is open it is let through and carries vendorAdminsBelowMinimum when read; the period a renewal continues is never asked, it only carries the flag vendorAdminsBelowMinimum), and an update may also be refused with PRIMARY_NOT_ELIGIBLE (details.reason); the unit price is refused with PRICE_NOT_VND (it is entered in dong only, details.currency) or PRICE_MISMATCH (when monthlyUnitPrice and unitPrice disagree, details.expectedUnitPrice), and the unit price and the original price with MONEY_SCALE_EXCEEDED, MONEY_OUT_OF_RANGE or CURRENCY_NOT_SUPPORTED (the currency of the original price). The workspace the subscription is held in is judged too: WORKSPACE_NOT_FOUND (the workspace named does not exist), WORKSPACE_VENDOR_MISMATCH (it is held at another vendor than the plan), WORKSPACE_REQUIRED (the vendor has several workspaces and none is named, details.workspaceIds), MEMBERS_MONTHLY_ONLY (seats counted by the members commit for one month) and MEMBERS_PAYMENT_DAY_REQUIRED (an active one names its payment day in renewalDate); an update may also be refused with SEAT_COUNTING_FIXED (how the seats are counted does not change once active).' +
    LOT_RULES_NOTE,
  examples: [
    VALIDATION_EXAMPLE,
    SUBSCRIPTION_ERROR_EXAMPLES.WORKSPACE_NOT_FOUND,
    SUBSCRIPTION_ERROR_EXAMPLES.WORKSPACE_VENDOR_MISMATCH,
    SUBSCRIPTION_ERROR_EXAMPLES.WORKSPACE_REQUIRED,
    SUBSCRIPTION_ERROR_EXAMPLES.MEMBERS_MONTHLY_ONLY,
    SUBSCRIPTION_ERROR_EXAMPLES.MEMBERS_PAYMENT_DAY_REQUIRED,
    SUBSCRIPTION_ERROR_EXAMPLES.PLAN_NOT_FOUND,
    SUBSCRIPTION_ERROR_EXAMPLES.APPLICATION_RETIRED,
    SUBSCRIPTION_ERROR_EXAMPLES.PLAN_HAS_NO_SUBSCRIPTION,
    SUBSCRIPTION_ERROR_EXAMPLES.PERPETUAL_NEEDS_LICENSED_APPLICATION,
    SUBSCRIPTION_ERROR_EXAMPLES.PERPETUAL_HAS_NO_TERM,
    SUBSCRIPTION_ERROR_EXAMPLES.DATES_INVALID,
    SUBSCRIPTION_ERROR_EXAMPLES.COMMITMENT_TERM_REQUIRED,
    SUBSCRIPTION_ERROR_EXAMPLES.COMMITMENT_TERM_NOT_ALLOWED,
    SUBSCRIPTION_ERROR_EXAMPLES.K1_MONTHLY_ONLY,
    SUBSCRIPTION_ERROR_EXAMPLES.K4_PERPETUAL_ONLY,
    SUBSCRIPTION_ERROR_EXAMPLES.K1_HAS_NO_SUBSCRIPTION,
    SUBSCRIPTION_ERROR_EXAMPLES.PERPETUAL_IS_LICENSE_LOT,
    SUBSCRIPTION_ERROR_EXAMPLES.BILLING_LONGER_THAN_COMMITMENT,
    SUBSCRIPTION_ERROR_EXAMPLES.BILLING_CYCLE_UNSUPPORTED,
    SUBSCRIPTION_ERROR_EXAMPLES.RESPONSIBLE_REQUIRED,
    SUBSCRIPTION_ERROR_EXAMPLES.VENDOR_ADMINS_REQUIRED,
    SUBSCRIPTION_ERROR_EXAMPLES.RESPONSIBLE_NOT_IT_ADMIN,
    SUBSCRIPTION_ERROR_EXAMPLES.PRICE_NOT_VND,
    SUBSCRIPTION_ERROR_EXAMPLES.PRICE_MISMATCH,
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
    SUBSCRIPTION_ERROR_EXAMPLES.SEAT_COUNTING_FIXED,
    SUBSCRIPTION_ERROR_EXAMPLES.WORKSPACE_NOT_FOUND,
    SUBSCRIPTION_ERROR_EXAMPLES.WORKSPACE_VENDOR_MISMATCH,
    SUBSCRIPTION_ERROR_EXAMPLES.WORKSPACE_REQUIRED,
    SUBSCRIPTION_ERROR_EXAMPLES.MEMBERS_MONTHLY_ONLY,
    SUBSCRIPTION_ERROR_EXAMPLES.MEMBERS_PAYMENT_DAY_REQUIRED,
    SUBSCRIPTION_ERROR_EXAMPLES.UPDATE_EMPTY,
    SUBSCRIPTION_ERROR_EXAMPLES.VERSION_REQUIRED,
    SUBSCRIPTION_ERROR_EXAMPLES.QUANTITY_REASON_REQUIRED,
    SUBSCRIPTION_ERROR_EXAMPLES.QUANTITY_BELOW_OCCUPIED,
    SUBSCRIPTION_ERROR_EXAMPLES.PERPETUAL_HAS_NO_TERM,
    SUBSCRIPTION_ERROR_EXAMPLES.DATES_INVALID,
    SUBSCRIPTION_ERROR_EXAMPLES.STILL_DRAFT,
    SUBSCRIPTION_ERROR_EXAMPLES.COMMITMENT_TERM_REQUIRED,
    SUBSCRIPTION_ERROR_EXAMPLES.COMMITMENT_TERM_NOT_ALLOWED,
    SUBSCRIPTION_ERROR_EXAMPLES.K1_MONTHLY_ONLY,
    SUBSCRIPTION_ERROR_EXAMPLES.K4_PERPETUAL_ONLY,
    SUBSCRIPTION_ERROR_EXAMPLES.BILLING_LONGER_THAN_COMMITMENT,
    SUBSCRIPTION_ERROR_EXAMPLES.BILLING_CYCLE_UNSUPPORTED,
    SUBSCRIPTION_ERROR_EXAMPLES.RESPONSIBLE_REQUIRED,
    SUBSCRIPTION_ERROR_EXAMPLES.VENDOR_ADMINS_REQUIRED,
    SUBSCRIPTION_ERROR_EXAMPLES.RESPONSIBLE_NOT_IT_ADMIN,
    SUBSCRIPTION_ERROR_EXAMPLES.PRIMARY_NOT_ELIGIBLE,
    SUBSCRIPTION_ERROR_EXAMPLES.PRIMARY_RETIRED,
    SUBSCRIPTION_ERROR_EXAMPLES.PRICE_NOT_VND,
    SUBSCRIPTION_ERROR_EXAMPLES.PRICE_MISMATCH,
    SUBSCRIPTION_ERROR_EXAMPLES.MONEY_SCALE_EXCEEDED,
    SUBSCRIPTION_ERROR_EXAMPLES.MONEY_OUT_OF_RANGE,
    SUBSCRIPTION_ERROR_EXAMPLES.CURRENCY_NOT_SUPPORTED,
  ],
} as const;
/** Declaring or completing a subscription of a K2 or K4 plan that already has a live one, once the seat baseline is closed (R-E02, `QĐ-104k`(3)). */
const DUPLICATE_PLAN_CONFLICT = {
  status: HttpStatus.CONFLICT,
  description:
    'The plan is a K2 or K4 plan and another live subscription (a draft, or active and not continued by a later period, not ended) already exists in the same workspace: add seats to that one, renew it, or choose a different workspace instead (SUBSCRIPTION.DUPLICATE_PLAN, details.subscriptionIds, nothing is written).',
  examples: [SUBSCRIPTION_ERROR_EXAMPLES.DUPLICATE_PLAN],
} as const;

/** The update is the one route whose conflict is not only the configuration: the loser of a race on the primary flag, or a stale edit. */
const UPDATE_CONFLICT = {
  status: HttpStatus.CONFLICT,
  description:
    'The unique index of the flag that makes a subscription the primary one of its plan refuses the loser of a race (SUBSCRIPTION.PRIMARY_CONFLICT); the plan is locked for the write, so it normally does not fire. When expectedUpdatedAt is sent and the subscription was changed since (by another edit, or by a seat bought for a grant), nothing is written (SUBSCRIPTION.STALE, details.currentUpdatedAt): read it again and redo the edit. Reducing purchasedQuantity on a 12-month active K2 subscription without mid-term reduction enabled is refused (SUBSCRIPTION.MID_TERM_REDUCTION_NOT_ALLOWED).' +
    SEAT_LEDGER_NOTE,
  examples: [
    SUBSCRIPTION_ERROR_EXAMPLES.PRIMARY_CONFLICT,
    SUBSCRIPTION_ERROR_EXAMPLES.STALE,
    SUBSCRIPTION_ERROR_EXAMPLES.MID_TERM_REDUCTION_NOT_ALLOWED,
    SUBSCRIPTION_ERROR_EXAMPLES.SEAT_COUNT_VIA_LEDGER,
  ],
} as const;

const toWire = (view: SubscriptionView) => {
  const wire: Record<string, unknown> = {
    ...view,
    lines: view.lines ?? [],
    createdAt: view.createdAt.toISOString(),
    updatedAt: view.updatedAt.toISOString(),
  };
  delete wire.lineCount;
  delete wire.seatsToday;

  return wire;
};

const toWireList = (actor: AuthenticatedPrincipal, view: SubscriptionView) => {
  const base = actor.roles.includes('IT_ADMIN') ? view : withoutVendorAdminDetail(view);
  const wire: Record<string, unknown> = {
    ...base,
    lineCount: base.lineCount ?? 0,
    seatsToday: base.seatsToday ?? 0,
    createdAt: base.createdAt.toISOString(),
    updatedAt: base.updatedAt.toISOString(),
  };
  delete wire.lines;

  return wire;
};

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
      'A page of subscriptions by application, plan and creation, optionally filtered (planId finds the subscription to grant a seat from or to edit, as a plan has one subscription; a subscription has no owning department); warning=NO_ALERT_ANCHOR lists those with no date to alert from, mine=true those the caller answers for, expiry=SOON or EXPIRED those from the point of adjustment to the last day of their period, or past it (a plan by the month opens 7 days before its next payment day, a plan by the year 30 days before the deadline to cancel; a purchase made once never). Each row says the days left to the deadline, the seats of a shared pool (K2), who answers for it and the logo of the application. Who administers the plan at the vendor (vendorAdmins), the email of the company account that owns it there (ownerAccountEmail) and the note (adminNote) are for the IT Admin: Finance reads them empty, with the two flags.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, READERS, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The query is invalid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async list(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: ListSubscriptionsQueryDto) {
    try {
      const page = await this.subscriptions.list(query, actor.employeeId);
      const emptyState = page.items.length === 0 ? await this.subscriptions.emptyState() : null;

      return { items: page.items.map((item) => toWireList(actor, item)), pagination: page.pagination, emptyState };
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
      'The subscription is stored: it has no owning department and a plan has one subscription; a K1 subscription is the shared record of the personal purchases of the plan, and each grant adds one seat to it. It is a draft while its data is incomplete, with what is missing; the unit price is in dong, and the price in the currency of the vendor is kept beside it when given.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    IT_ONLY,
    {
      ...INVALID,
      examples: [
        ...INVALID.examples,
        SUBSCRIPTION_ERROR_EXAMPLES.LINES_XOR_PLAN,
        SUBSCRIPTION_ERROR_EXAMPLES.LINE_PLAN_NOT_K2,
      ],
    },
    DUPLICATE_PLAN_CONFLICT,
  )
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
      'The subscription as it is after the change; a new unit price is in dong and nothing is converted; a change of nothing is answered the same and not audited. The plan and the kind cannot change. The IT Admin who answers for the subscription is not changed here: the Super Admin does it with subscriptionResponsibleItAdminChange (POST /subscriptions/{id}/responsible-it-admin).',
  })
  @ApiErrorResponses(...AUTH_ERRORS, IT_ONLY, INVALID_UPDATE, NOT_FOUND, UPDATE_CONFLICT)
  async update(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: SubscriptionIdParamDto,
    @Body() body: UpdateSubscriptionBodyDto,
  ) {
    try {
      const { expectedUpdatedAt, ...change } = body;
      const expected = expectedUpdatedAt === undefined ? undefined : new Date(expectedUpdatedAt);

      return toWire(await this.changes.update(actor, params.id, change, expected));
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
      'The draft becomes active once its data is whole; its unit price is in dong and nothing is converted. An active subscription is answered unchanged.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, IT_ONLY, NOT_FOUND, DUPLICATE_PLAN_CONFLICT, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'The id is invalid (VALIDATION_ERROR) or the subscription still lacks data (SUBSCRIPTION.STILL_DRAFT, details.missing; a price an earlier release left in another currency counts as missing until it is entered again in dong), or the shared-pool rules refuse it: COMMITMENT_TERM_REQUIRED, K1_MONTHLY_ONLY, K4_PERPETUAL_ONLY, RESPONSIBLE_REQUIRED, RESPONSIBLE_NOT_IT_ADMIN, VENDOR_ADMINS_REQUIRED (requires at least two working IT Admins in the workspace profile once the seat baseline is closed; let through while open).',
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
