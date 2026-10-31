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
import { RenewalDecisionService } from './decision/renewal-decision.service';
import { RenewalOutcomeService } from './outcome/renewal-outcome.service';
import { RenewalProposalService } from './proposal/renewal-proposal.service';
import {
  SubscriptionDeadlineEventPageResponseDto,
  SubscriptionRenewalDecideBodyDto,
  SubscriptionDeadlineEventListQueryDto,
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
    'Only the IT Admin, Finance, the person who decides spending and the substitute read the renewals (SUBSCRIPTION_RENEWAL.READ_FORBIDDEN).',
  examples: [EXAMPLES.READ_FORBIDDEN],
};
const NOT_FOUND: ErrorResponseDeclaration = {
  status: HttpStatus.NOT_FOUND,
  description: 'There is no renewal with this id (SUBSCRIPTION_RENEWAL.NOT_FOUND).',
  examples: [EXAMPLES.NOT_FOUND],
};

/**
 * The renewal of a subscription period: the proposal of the IT Admin, the decision of the person who decides spending (renew,
 * reduce or cancel), and the outcome recorded once the IT Admin carried it out with the vendor outside the system. A decision holds
 * no budget commitment and creates no new period; only the recorded outcome does that. Nothing here renews, cancels or pays a vendor.
 */
@ApiTags('subscription-renewals')
@Controller({ version: '1' })
export class SubscriptionRenewalsController {
  constructor(
    private readonly views: RenewalViewService,
    private readonly proposals: RenewalProposalService,
    private readonly decisions: RenewalDecisionService,
    private readonly outcomes: RenewalOutcomeService,
  ) {}

  @Get('subscription-renewals')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'subscriptionRenewalList', summary: 'List the renewals of subscription periods' })
  @ApiSuccessResponse(SubscriptionRenewalPageResponseDto, {
    message: 'SUBSCRIPTION_RENEWAL.LISTED',
    description:
      'A page of the renewal cases, the earliest milestone first: the period, the milestone it was proposed against (a declared or an inferred cancellation deadline, or the end date), the choice proposed, the decision and when it is carried out, the outcome and the late flag. With state PROPOSED it is the queue of the decider: a period with no proposal of the IT Admin has nothing to decide. Filter by state, by subscription or by the late flag.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, READERS_ONLY, INVALID)
  async list(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: SubscriptionRenewalListQueryDto) {
    try {
      return await this.views.list(actor, query);
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
      'The case with its period (seats bought and in use, dates, automatic renewal, reduction mid-term), whether evidence of use is available (without it the usage cannot be judged, never 0), the proposal with the opinion of the Business Owner the IT Admin recorded, the decision with the snapshot frozen when it was taken and the seats chosen to take back, the late flag, and the outcome with the new period and the savings at renewal when the new period costs less. A decision never holds a budget commitment.',
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
      'The personal seats in use of the period, in the order a reduction below them is chosen from: the seats whose revocation is already decided, then those whose holder left, then those a waste rule flagged and the rest by the oldest last activity. While no evidence of use is connected (usage NOT_AVAILABLE) no seat is flagged and the rest come oldest seat first: an order, not a judgement of use. The decider chooses; nothing is chosen for them.',
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
  @ApiOperation({ operationId: 'subscriptionRenewalPropose', summary: 'Propose the renewal of a subscription period' })
  @ApiSuccessResponse(SubscriptionRenewalResponseDto, {
    status: HttpStatus.CREATED,
    message: 'SUBSCRIPTION_RENEWAL.PROPOSED',
    description:
      'The IT Admin proposes to renew the period as it is, to reduce it to a number of seats, or to cancel it, with the opinion of the Business Owner if they gave one (an input, never a step). One proposal per period. It puts the case in the queue of the person who decides spending, who is told; the IT Admin does not decide it.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    { status: HttpStatus.FORBIDDEN, description: 'Only an IT Admin proposes.', examples: [FORBIDDEN_EXAMPLE] },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The subscription does not exist (SUBSCRIPTION_RENEWAL.NOT_FOUND).',
      examples: [EXAMPLES.NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'A perpetual purchase, internal software, a draft or a period already continued has no renewal (SUBSCRIPTION_RENEWAL.NOT_RENEWABLE); the period has no milestone to count from and its contract data must be completed first (SUBSCRIPTION_RENEWAL.CONTRACT_DATA_INCOMPLETE); the period already has a proposal (SUBSCRIPTION_RENEWAL.ALREADY_PROPOSED).',
      examples: [EXAMPLES.NOT_RENEWABLE, EXAMPLES.CONTRACT_DATA_INCOMPLETE, EXAMPLES.ALREADY_PROPOSED],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'A field is invalid (VALIDATION_ERROR), or the quantity does not fit the choice: a reduction names fewer seats than bought, the others none (SUBSCRIPTION_RENEWAL.QUANTITY_INVALID).',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.QUANTITY_INVALID],
    },
  )
  async propose(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: SubscriptionRenewalProposeBodyDto) {
    try {
      const created = await this.proposals.propose(actor, body);

      return { renewal: await this.views.detailOf(created) };
    } catch (error) {
      throw toRenewalApiException(error);
    }
  }

  @Post('subscription-renewals/:id/decision')
  @HttpCode(HttpStatus.OK)
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'subscriptionRenewalDecide', summary: 'Decide a renewal of a subscription period' })
  @ApiSuccessResponse(SubscriptionRenewalResponseDto, {
    message: 'SUBSCRIPTION_RENEWAL.DECIDED',
    description:
      'The person who decides spending (or the substitute when that person proposed the case) renews as it is, reduces or cancels. A cancellation while seats are in use is confirmed after seeing how many; a reduction below the seats in use names exactly the seats to take back, chosen from the ranked list, and their revocations are opened. A decision after the milestone is never voided: it is carried out mid-term when the subscription allows a reduction mid-term, else at the next renewal. The decision is written with the snapshot the decider saw; it holds no budget commitment, creates no new period and records no savings. The IT Admin who carries it out is told.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'The caller is not the person who decides this renewal now, or proposed it (SUBSCRIPTION_RENEWAL.NOT_DECIDER).',
      examples: [EXAMPLES.NOT_DECIDER],
    },
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The case is not waiting for a decision (SUBSCRIPTION_RENEWAL.NOT_AWAITING_DECISION); people still use the subscription and the cancellation was not confirmed (SUBSCRIPTION_RENEWAL.ACTIVE_USERS_NOT_ACKNOWLEDGED, details.seatsInUse); the owner department has no Cost Center in use and the decision owes more into a new period (FINANCE.SETUP_INCOMPLETE); a seat to take back cannot be revoked through the queue (REVOCATION.TYPE_NOT_SUPPORTED). Nothing is written.',
      examples: [
        EXAMPLES.NOT_AWAITING_DECISION,
        EXAMPLES.ACTIVE_USERS_NOT_ACKNOWLEDGED,
        EXAMPLES.FINANCE_SETUP_INCOMPLETE,
        EXAMPLES.REVOCATION_TYPE_NOT_SUPPORTED,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'A field is invalid (VALIDATION_ERROR); the quantity does not fit the choice (SUBSCRIPTION_RENEWAL.QUANTITY_INVALID); the seats chosen are not exactly the excess of this subscription (SUBSCRIPTION_RENEWAL.EXCESS_SELECTION_INVALID, details.required, details.selected); a reduction within the paid period on a subscription that does not allow one (SUBSCRIPTION_RENEWAL.MID_TERM_NOT_ALLOWED).',
      examples: [
        VALIDATION_EXAMPLE,
        EXAMPLES.QUANTITY_INVALID,
        EXAMPLES.EXCESS_SELECTION_INVALID,
        EXAMPLES.MID_TERM_NOT_ALLOWED,
      ],
    },
  )
  async decide(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: SubscriptionRenewalIdParamDto,
    @Body() body: SubscriptionRenewalDecideBodyDto,
  ) {
    try {
      const decided = await this.decisions.decide(actor, params.id, body);

      return { renewal: await this.views.detailOf(decided) };
    } catch (error) {
      throw toRenewalApiException(error);
    }
  }

  @Post('subscription-renewals/:id/outcome')
  @HttpCode(HttpStatus.OK)
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'subscriptionRenewalRecordOutcome', summary: 'Record the outcome of a renewal' })
  @ApiSuccessResponse(SubscriptionRenewalResponseDto, {
    message: 'SUBSCRIPTION_RENEWAL.OUTCOME_RECORDED',
    description:
      'The IT Admin records what was done with the vendor outside the system: as decided, or what really happened (the vendor refused, did something else, has not confirmed), which leaves a follow-up with the vendor open. A new period the vendor confirmed is recorded as the continuation of the old one, once, with the seats held on its first day carried to it; it is refused while more seats are held than it buys. A cancellation as decided needs every seat taken back first. The savings at renewal are written only for an outcome as decided whose new period, of the same length, costs less in total. Nothing creates a budget commitment.',
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
        'The case is not waiting for its outcome (SUBSCRIPTION_RENEWAL.NOT_AWAITING_OUTCOME); more seats are held than the new period buys, or a cancelled subscription still has seats (SUBSCRIPTION_RENEWAL.EXCESS_NOT_REVOKED, details.seatsInUse, details.quantity); a seat to carry has an open task (SUBSCRIPTION_RENEWAL.SEATS_HAVE_OPEN_TASKS); the new period cannot be recorded as the continuation, for example the period was already continued (SUBSCRIPTION_RENEWAL.PERIOD_REFUSED, details.reason). Nothing is written.',
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

      return { renewal: await this.views.detailOf(recorded) };
    } catch (error) {
      throw toRenewalApiException(error);
    }
  }

  @Get('subscription-deadline-events')
  @RequireRoles('IT_ADMIN', 'SPENDING_APPROVER', 'SUPER_ADMIN')
  @ApiOperation({
    operationId: 'subscriptionDeadlineEventList',
    summary: 'List the milestones that passed with no renewal decision',
  })
  @ApiSuccessResponse(SubscriptionDeadlineEventPageResponseDto, {
    message: 'SUBSCRIPTION_DEADLINE_EVENT.LISTED',
    description:
      'A page of what the system recorded when the milestone of a period passed with no decision taken by it, the newest first: an incident for a subscription that renews itself (what the measure of unwanted renewals counts, one per period) or a mark that a subscription that does not renew itself will end. A decision taken later never removes an event, and a step past its SLA is never one. Filter by kind and by the day recorded.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only the IT Admin, the person who decides spending and the Super Admin read them.',
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
