import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
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
import { AuthenticatedOnly, RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { RenewalOutcomeService } from './outcome/renewal-outcome.service';
import { RenewalRecordService } from './record/renewal-record.service';
import {
  SubscriptionDeadlineEventPageResponseDto,
  SubscriptionDeadlineEventListQueryDto,
  SubscriptionRenewalAdjustmentQueryDto,
  SubscriptionRenewalAdjustmentResponseDto,
  SubscriptionRenewalListQueryDto,
  SubscriptionRenewalProposeBodyDto,
  SubscriptionRenewalOutcomeBodyDto,
  SubscriptionRenewalIdParamDto,
  SubscriptionRenewalPageResponseDto,
  SubscriptionRenewalResponseDto,
  SubscriptionRenewalSeatRankingQueryDto,
  SubscriptionRenewalSeatRankingResponseDto,
} from './subscription-renewal.dto';
import { RENEWAL_ERROR_EXAMPLES as EXAMPLES, toRenewalApiException } from './subscription-renewal.http-errors';
import { RenewalViewService } from './subscription-renewal-view.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const INVALID: ErrorResponseDeclaration = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'A field or a filter is invalid (VALIDATION_ERROR).',
  examples: [VALIDATION_EXAMPLE],
};
const READERS_ONLY: ErrorResponseDeclaration = {
  status: HttpStatus.FORBIDDEN,
  description:
    'Only the IT Admin, Finance and the head of a department read the renewals (SUBSCRIPTION_RENEWAL.READ_FORBIDDEN); the head reads those of the subscriptions their department owns, and Finance does not read the seats.',
  examples: [EXAMPLES.READ_FORBIDDEN],
};
const NOT_FOUND: ErrorResponseDeclaration = {
  status: HttpStatus.NOT_FOUND,
  description:
    'There is no renewal with this id, or it belongs to a subscription another department owns, or to the shared pool, and the caller is a head (SUBSCRIPTION_RENEWAL.NOT_FOUND).',
  examples: [EXAMPLES.NOT_FOUND],
};

/**
 * The renewal of a subscription of the shared pool at its point of adjustment (`QĐ-103e`, `SBF-20`): the IT Admin records the result once
 * (the seats the system counts for the next period, what the vendor did and the new period), and the case is written complete: decided by the
 * IT Admin in charge, outcome recorded. No head confirms and the person who decides spending takes no part. Nothing here renews, cancels or
 * pays a vendor, and it holds no budget commitment. A case decided before this rule still takes its outcome through its own route.
 */
@ApiTags('subscription-renewals')
@Controller({ version: '1' })
export class SubscriptionRenewalsController {
  constructor(
    private readonly views: RenewalViewService,
    private readonly records: RenewalRecordService,
    private readonly outcomes: RenewalOutcomeService,
  ) {}

  @Get('subscription-renewals')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'subscriptionRenewalList', summary: 'List the renewals of subscription periods' })
  @ApiSuccessResponse(SubscriptionRenewalPageResponseDto, {
    message: 'SUBSCRIPTION_RENEWAL.LISTED',
    description:
      'A page of the renewal cases: the period (subscription.ownerDepartmentId is null for a subscription of the shared pool), the day the case counts from and where it comes from (a declared or an inferred cancellation deadline, the renewal day, the payment day or the end date), the choice recorded, the decision and the outcome. The IT Admin and Finance (who only reads) see every case; the head of a department sees those of the subscriptions the department owns, and none of the shared pool. A case that waited for a head before the one-write renewal is closed (state STALE); waitingReason is always null. Filter by state, by subscription or by the late flag.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, READERS_ONLY, INVALID)
  async list(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: SubscriptionRenewalListQueryDto) {
    try {
      return await this.views.list(actor, query);
    } catch (error) {
      throw toRenewalApiException(error);
    }
  }

  /** Declared before `:id`: Nest matches in the order of declaration, so after it `adjustment` would be read as an id (422). */
  @Get('subscription-renewals/adjustment')
  @RequireRoles('IT_ADMIN', 'FINANCE')
  @ApiOperation({
    operationId: 'subscriptionRenewalAdjustmentGet',
    summary: 'Read the seats a subscription needs for its next period',
  })
  @ApiSuccessResponse(SubscriptionRenewalAdjustmentResponseDto, {
    message: 'SUBSCRIPTION_RENEWAL.ADJUSTMENT_FOUND',
    description:
      'Read before the result is recorded, from any day (also before the point of adjustment): the point (commitment, the kind and day of the deadline, the day the point opens, the renewal day and, for a plan by the year, the red alert day), the seats the next period needs (seatsNeeded.total, the sum of the seats held past the renewal day, the continuations waiting and the grants approved and waiting; no buffer seat is added), target (the need raised to the vendor minimum, zero when nothing is needed), suggestedChoice (the choice the count points to; null when the seats bought are not known), canCancel (target 0, no seat in effect today and no request of the plan open), the IT Admin responsible, whether the caller is that person (false means the caller records in their place; it blocks nothing) and recordedRenewalId when the period already has its result. Read by the IT Admin and Finance. The write counts again under a lock: a number recorded that is not the target is refused there.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only the IT Admin and Finance read the seats a subscription needs.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The subscription does not exist (SUBSCRIPTION_RENEWAL.NOT_FOUND).',
      examples: [EXAMPLES.NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The subscription has no point of adjustment: a perpetual purchase, internal software, a term that is not a workspace of the shared pool (a department owns it, or it is a key or a one-time license), a draft, a period already continued or a subscription already recorded as cancelled (SUBSCRIPTION_RENEWAL.NOT_RENEWABLE, details.reason PERPETUAL, INTERNAL, NOT_POOL_TERM, NOT_ACTIVE, ALREADY_CONTINUED or CANCELLED); no date gives its point and its contract data must be completed first (SUBSCRIPTION_RENEWAL.CONTRACT_DATA_INCOMPLETE).',
      examples: [EXAMPLES.NOT_RENEWABLE, EXAMPLES.CONTRACT_DATA_INCOMPLETE],
    },
    INVALID,
  )
  async adjustment(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Query() query: SubscriptionRenewalAdjustmentQueryDto,
  ) {
    try {
      return { adjustment: await this.views.adjustmentOf(actor, query.subscriptionId) };
    } catch (error) {
      throw toRenewalApiException(error);
    }
  }

  @Get('subscription-renewals/:id')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'subscriptionRenewalGet', summary: 'Read a renewal of a subscription period' })
  @ApiSuccessResponse(SubscriptionRenewalResponseDto, {
    message: 'SUBSCRIPTION_RENEWAL.FOUND',
    description:
      'The case with its period (seats bought and in use, dates, automatic renewal, reduction mid-term), whether evidence of use is available (without it the usage cannot be judged, never 0), the choice the IT Admin recorded with proposal.seatsNeeded, the seats the system counted for the next period (null on a case of before), the decision (deciderRole IT_ADMIN_IN_CHARGE for a case recorded in one write; the money snapshot is null for the IT Admin), and the outcome with the new period, outcomeDetail.lateRenewal (recorded after the renewal day) and the savings at renewal when the new period costs less. A decision never holds a budget commitment.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, READERS_ONLY, NOT_FOUND, INVALID)
  async get(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: SubscriptionRenewalIdParamDto) {
    try {
      return { renewal: await this.views.get(actor, params.id) };
    } catch (error) {
      throw toRenewalApiException(error);
    }
  }

  @Get('subscription-renewals/:id/seat-ranking')
  @AuthenticatedOnly()
  @ApiOperation({
    operationId: 'subscriptionRenewalSeatRanking',
    summary: 'List the seats in use ranked for a reduction',
  })
  @ApiSuccessResponse(SubscriptionRenewalSeatRankingResponseDto, {
    message: 'SUBSCRIPTION_RENEWAL.SEATS_RANKED',
    description:
      'Deprecated: no seat is chosen for a reduction any more, the system counts them (`SBF-20`). The personal seats in use of the period, in the order a reduction below them was chosen from: the seats whose revocation is already decided, then those whose holder left, then those a waste rule flagged and the rest by the oldest last activity. While no evidence of use is connected (usage NOT_AVAILABLE) no seat is flagged, lastActivityOn is null and the rest come oldest seat first: an order, not a judgement of use. Each seat shows whether the IT Admin proposed to take it back (inProposal; proposedOnly=true lists only those). Read by the IT Admin and by the head of the owner department; the head sees the code and name of the holder and nothing else of them.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, READERS_ONLY, NOT_FOUND, INVALID)
  async seatRanking(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: SubscriptionRenewalIdParamDto,
    @Query() query: SubscriptionRenewalSeatRankingQueryDto,
  ) {
    try {
      return await this.views.seatRanking(actor, params.id, query);
    } catch (error) {
      throw toRenewalApiException(error);
    }
  }

  @Post('subscription-renewals')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({
    operationId: 'subscriptionRenewalPropose',
    summary: 'Record the result of the adjustment of a subscription period',
  })
  @ApiSuccessResponse(SubscriptionRenewalResponseDto, {
    status: HttpStatus.CREATED,
    message: 'SUBSCRIPTION_RENEWAL.OUTCOME_RECORDED',
    description:
      'Any IT Admin records, once per period and from its point of adjustment, what was done with the vendor: the choice (renew as it is, reduce, increase or cancel) with the seats the system counts for the next period (read them first; a number that is not that count is refused, and one above it is accepted only as the vendor minimum with the evidence in note), what the vendor did (as decided, refused, did otherwise; a result the vendor has not confirmed is recorded once it has) and the new period it confirmed, which starts on the renewal day and which a renewal, a reduction or an increase must carry (only a vendor that refused a plan by the month may leave it out) and so must a cancellation the vendor refused or did otherwise (it made a period anyway: an incident is raised for it). A cancellation is accepted only when no seat is needed, none is in effect and no request for the plan is open, and needs closure.dataExported and closure.adminsTransferred. The case is written complete in one transaction (state OUTCOME_RECORDED, deciderRole IT_ADMIN_IN_CHARGE): the new period continues the old one with the seats held on its first day, a seat ending on the renewal day stays on the old period. Writing after the renewal day is allowed (a late renewal). Finance is told; the IT Admin responsible is told too when another IT Admin recorded in their place (the audit trail says so). It opens no revocation, asks no head and creates no budget commitment. releasedAssignmentIds is no longer taken.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    { status: HttpStatus.FORBIDDEN, description: 'Only an IT Admin records.', examples: [FORBIDDEN_EXAMPLE] },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The subscription does not exist (SUBSCRIPTION_RENEWAL.NOT_FOUND).',
      examples: [EXAMPLES.NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The subscription has no point of adjustment: a perpetual purchase, internal software, a term that is not a workspace of the shared pool, a draft, a period already continued or a subscription already recorded as cancelled (SUBSCRIPTION_RENEWAL.NOT_RENEWABLE, details.reason PERPETUAL, INTERNAL, NOT_POOL_TERM, NOT_ACTIVE, ALREADY_CONTINUED or CANCELLED); no date gives its point and its contract data must be completed first (SUBSCRIPTION_RENEWAL.CONTRACT_DATA_INCOMPLETE); the point has not come (SUBSCRIPTION_RENEWAL.BEFORE_ADJUSTMENT_POINT, details.adjustmentPointOn, details.deadline); the quantity is not the seats the next period needs (SUBSCRIPTION_RENEWAL.QUANTITY_NOT_SEATS_NEEDED, details.seatsNeeded, vendorMinimumSeats, target, quantity); a cancellation while seats are needed, in effect or a request of the plan is open (SUBSCRIPTION_RENEWAL.CANCEL_NOT_ALLOWED, details.seatsNeeded, heldPastRenewal, pendingContinuations, approvedAwaitingGrant, activeSeatsToday, openRequests); the period already has its result, or a case of before still waits for its outcome (SUBSCRIPTION_RENEWAL.ALREADY_PROPOSED, details.renewalId); more seats are held than the new period buys (SUBSCRIPTION_RENEWAL.EXCESS_NOT_REVOKED); a seat to carry has an open task (SUBSCRIPTION_RENEWAL.SEATS_HAVE_OPEN_TASKS); the new period cannot be recorded as the continuation (SUBSCRIPTION_RENEWAL.PERIOD_REFUSED, details.reason NOT_ON_RENEWAL_DAY with details.renewalOn when nextPeriod.startDate is not the renewal day: renewalOn or the day after it for a plan by the year, the payment day for a plan by the month; or another reason such as ALREADY_RENEWED, PRICE_NOT_VND). Nothing is written.',
      examples: [
        EXAMPLES.NOT_RENEWABLE,
        EXAMPLES.CONTRACT_DATA_INCOMPLETE,
        EXAMPLES.BEFORE_ADJUSTMENT_POINT,
        EXAMPLES.QUANTITY_NOT_SEATS_NEEDED,
        EXAMPLES.CANCEL_NOT_ALLOWED,
        EXAMPLES.ALREADY_PROPOSED,
        EXAMPLES.EXCESS_NOT_REVOKED,
        EXAMPLES.SEATS_HAVE_OPEN_TASKS,
        EXAMPLES.PERIOD_REFUSED,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'A field is invalid or one the route does not know (VALIDATION_ERROR), among them a note missing when the vendor refused or did otherwise and a closure not confirmed for a cancellation; the quantity does not fit the choice: a renewal names the seats bought, a reduction fewer, an increase more, a cancellation none (SUBSCRIPTION_RENEWAL.QUANTITY_INVALID); the seats are the vendor minimum above the need and note gives no evidence (SUBSCRIPTION_RENEWAL.VENDOR_MINIMUM_EVIDENCE_REQUIRED, details.seatsNeeded, vendorMinimumSeats); a renewal, a reduction or an increase with no nextPeriod, except a vendor that refused a plan by the month, and a cancellation the vendor refused or did otherwise with no nextPeriod (SUBSCRIPTION_RENEWAL.NEXT_PERIOD_REQUIRED); an outcome as decided whose new period does not have the seats recorded (SUBSCRIPTION_RENEWAL.OUTCOME_MISMATCH); the price of the new period has too many decimals or an unknown currency (MONEY_SCALE_EXCEEDED, CURRENCY_NOT_SUPPORTED).',
      examples: [
        VALIDATION_EXAMPLE,
        EXAMPLES.QUANTITY_INVALID,
        EXAMPLES.VENDOR_MINIMUM_EVIDENCE_REQUIRED,
        EXAMPLES.NEXT_PERIOD_REQUIRED,
        EXAMPLES.OUTCOME_MISMATCH,
        EXAMPLES.MONEY_SCALE_EXCEEDED,
        EXAMPLES.CURRENCY_NOT_SUPPORTED,
      ],
    },
  )
  async propose(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: SubscriptionRenewalProposeBodyDto) {
    try {
      const created = await this.records.record(actor, body);

      return { renewal: await this.views.detailOf(created, actor) };
    } catch (error) {
      throw toRenewalApiException(error);
    }
  }

  @Post('subscription-renewals/:id/outcome')
  @HttpCode(HttpStatus.OK)
  @RequireRoles('IT_ADMIN')
  @ApiOperation({
    operationId: 'subscriptionRenewalRecordOutcome',
    summary: 'Record the outcome of a renewal decided before (legacy)',
  })
  @ApiSuccessResponse(SubscriptionRenewalResponseDto, {
    message: 'SUBSCRIPTION_RENEWAL.OUTCOME_RECORDED',
    description:
      'Legacy: only for a case a head decided before the one-write renewal (state DECIDED); a new result is recorded with POST /subscription-renewals. The IT Admin records what was done with the vendor outside the system: as decided, or what really happened (the vendor refused, did something else, has not confirmed), which leaves a follow-up with the vendor open; the note (the reason and the evidence) is required when the vendor refused or did something else. A new period the vendor confirmed is recorded as the continuation of the old one, once, with the seats held on its first day carried to it; it is refused while more seats are held than it buys. A cancellation as decided needs every seat taken back first. The savings at renewal are written only for an outcome as decided whose new period, of the same length, costs less in total. Nothing creates a budget commitment.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only an IT Admin records the outcome.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The case is not waiting for its outcome (SUBSCRIPTION_RENEWAL.NOT_AWAITING_OUTCOME); more seats are held than the new period buys, or a cancelled subscription still has seats (SUBSCRIPTION_RENEWAL.EXCESS_NOT_REVOKED, details.seatsInUse, details.quantity); a seat to carry has an open task (SUBSCRIPTION_RENEWAL.SEATS_HAVE_OPEN_TASKS); the new period cannot be recorded as the continuation, for example the period was already continued, or its unit price is not in dong: a price is entered in dong only (SUBSCRIPTION_RENEWAL.PERIOD_REFUSED, details.reason ALREADY_RENEWED, PRICE_NOT_VND and the others). Nothing is written.',
      examples: [
        EXAMPLES.NOT_AWAITING_OUTCOME,
        EXAMPLES.EXCESS_NOT_REVOKED,
        EXAMPLES.SEATS_HAVE_OPEN_TASKS,
        EXAMPLES.PERIOD_REFUSED,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'A field is invalid (VALIDATION_ERROR); an outcome as decided that is not the decision (SUBSCRIPTION_RENEWAL.OUTCOME_MISMATCH); the price of the new period has too many decimals or an unknown currency (MONEY_SCALE_EXCEEDED, CURRENCY_NOT_SUPPORTED).',
      examples: [
        VALIDATION_EXAMPLE,
        EXAMPLES.OUTCOME_MISMATCH,
        EXAMPLES.MONEY_SCALE_EXCEEDED,
        EXAMPLES.CURRENCY_NOT_SUPPORTED,
      ],
    },
  )
  async recordOutcome(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: SubscriptionRenewalIdParamDto,
    @Body() body: SubscriptionRenewalOutcomeBodyDto,
  ) {
    try {
      const recorded = await this.outcomes.record(actor, params.id, body);

      return { renewal: await this.views.detailOf(recorded, actor) };
    } catch (error) {
      throw toRenewalApiException(error);
    }
  }

  @Get('subscription-deadline-events')
  @RequireRoles('IT_ADMIN', 'FINANCE', 'SPENDING_APPROVER', 'SUPER_ADMIN')
  @ApiOperation({
    operationId: 'subscriptionDeadlineEventList',
    summary: 'List the renewal days that passed with no result recorded',
  })
  @ApiSuccessResponse(SubscriptionDeadlineEventPageResponseDto, {
    message: 'SUBSCRIPTION_DEADLINE_EVENT.LISTED',
    description:
      'A page of what the system recorded when the renewal day of a period passed with no result recorded, the newest first: an incident for a subscription that renews itself (what the measure of unwanted renewals counts, one per period) or a mark that a subscription that does not renew itself expired without renewal. A result recorded later never removes an event, and a step past its SLA is never one. subscription.ownerDepartmentId is null for a subscription of the shared pool. Filter by kind and by the day recorded.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only the IT Admin, Finance, the person who decides spending and the Super Admin read them.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    INVALID,
  )
  async deadlineEvents(@Query() query: SubscriptionDeadlineEventListQueryDto) {
    try {
      return await this.views.deadlineEvents(query);
    } catch (error) {
      throw toRenewalApiException(error);
    }
  }
}
