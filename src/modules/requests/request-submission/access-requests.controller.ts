import { Body, Controller, Get, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { AuthenticatedOnly } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import {
  AccessRequestResponseDto,
  NeedDecisionBodyDto,
  RequestIdParamDto,
  SimilarSeatsQueryDto,
  SimilarSeatsResponseDto,
  SubmitBodyDto,
  WithdrawBodyDto,
} from '../access-request/access-request.dto';
import { AccessRequestOrDraftResponseDto } from '../draft/request-draft.dto';
import { PreviewBodyDto, PreviewResponseDto } from './request-preview.dto';
import { RequestDraftService } from '../draft/request-draft.service';
import { RequestPreviewService } from './request-preview.service';
import { AccessRequestNotFoundError } from '../access-request/access-request.errors';
import {
  ACCESS_REQUEST_ERROR_EXAMPLES as EXAMPLES,
  toAccessRequestApiException,
} from '../access-request/access-request.http-errors';
import { AccessRequestQueryService } from '../access-request/access-request-query.service';
import { toWire } from '../access-request/access-request.mapper';
import { AccessRequestService } from './access-request.service';
import { NeedDecisionService } from '../need-decision/need-decision.service';
import { SimilarSeatsService } from '../need-decision/similar-seats.service';
import { WithdrawalService } from '../withdraw/withdrawal.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const PLAN_NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The plan does not exist (ACCESS_REQUEST.PLAN_NOT_FOUND).',
  examples: [EXAMPLES.PLAN_NOT_FOUND],
} as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The request does not exist, or the caller has no part in it (ACCESS_REQUEST.NOT_FOUND).',
  examples: [EXAMPLES.NOT_FOUND],
} as const;

/**
 * A request for access to software (`US-05-02`, `US-05-03`): any signed-in person sends one for themselves, and only the
 * people with a part in it read it. Nothing here chooses the branch, the Cost Center or who decides: the system fixes them
 * when the request is sent, and nobody changes them afterwards.
 */
@ApiTags('access-requests')
@Controller({ path: 'access-requests', version: '1' })
export class AccessRequestsController {
  constructor(
    private readonly requests: AccessRequestService,
    private readonly previews: RequestPreviewService,
    private readonly queries: AccessRequestQueryService,
    private readonly decisions: NeedDecisionService,
    private readonly similarSeats: SimilarSeatsService,
    private readonly withdrawals: WithdrawalService,
    private readonly drafts: RequestDraftService,
  ) {}

  @Post()
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'accessRequestSubmit', summary: 'Send a request for access to software' })
  @ApiSuccessResponse(AccessRequestResponseDto, {
    status: HttpStatus.CREATED,
    message: 'ACCESS_REQUEST.SUBMITTED',
    description:
      'The request is fixed to its branch and chain of steps, charged to the Unit Cost Center of the department of the sender on the day, and its need step is given to the one person the routing table names. With nobody valid to hold it the request waits under control (state WAITING_CONTROLLED) and decides or refuses nothing.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'The Super Admin sends no request (ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST).',
      examples: [EXAMPLES.SUPER_ADMIN_CANNOT_REQUEST],
    },
    PLAN_NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The application of the plan is retired (ACCESS_REQUEST.APPLICATION_RETIRED), the sender belongs to no department (ACCESS_REQUEST.NO_DEPARTMENT), the department has no Cost Center in use yet (FINANCE.SETUP_INCOMPLETE) or the sender already holds a seat of the plan (ACCESS_REQUEST.ALREADY_HOLDS_ACCESS, with the seat in details).',
      examples: [
        EXAMPLES.APPLICATION_RETIRED,
        EXAMPLES.NO_DEPARTMENT,
        EXAMPLES.FINANCE_SETUP_INCOMPLETE,
        EXAMPLES.ALREADY_HOLDS_ACCESS,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The form is incomplete or invalid (VALIDATION_ERROR): the reason and the term are required. Nothing is written.',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.NO_SPEND_FOR_FREE_SOFTWARE],
    },
  )
  async submit(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: SubmitBodyDto) {
    try {
      const record = await this.requests.submit(actor, body);

      return { request: toWire(await this.queries.view(record)) };
    } catch (error) {
      throw toAccessRequestApiException(error);
    }
  }

  @Post('preview')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'accessRequestPreview', summary: 'Preview a request before sending it' })
  @ApiSuccessResponse(PreviewResponseDto, {
    message: 'ACCESS_REQUEST.PREVIEWED',
    description:
      'What sending the request would fix, without writing anything: the cost with its estimated tax (labelled as an estimate), the chain of people who decide it with the time each step may take, the seat the sender already holds of it, and whether the request can go on to be decided as spend. There is no budget figure and no field to give an amount.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    PLAN_NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The application of the plan is retired (ACCESS_REQUEST.APPLICATION_RETIRED), the caller belongs to no department (ACCESS_REQUEST.NO_DEPARTMENT) or the department has no Cost Center in use yet (FINANCE.SETUP_INCOMPLETE).',
      examples: [EXAMPLES.APPLICATION_RETIRED, EXAMPLES.NO_DEPARTMENT, EXAMPLES.FINANCE_SETUP_INCOMPLETE],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The body is invalid (VALIDATION_ERROR), or an expected spend date is given for internal software (ACCESS_REQUEST.NO_SPEND_FOR_FREE_SOFTWARE).',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.NO_SPEND_FOR_FREE_SOFTWARE],
    },
  )
  async preview(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: PreviewBodyDto) {
    try {
      return { preview: await this.previews.preview(actor, body) };
    } catch (error) {
      throw toAccessRequestApiException(error);
    }
  }

  @Get(':id')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'accessRequestGet', summary: 'Get a request for access to software' })
  @ApiSuccessResponse(AccessRequestOrDraftResponseDto, {
    message: 'ACCESS_REQUEST.FETCHED',
    description:
      'The request with the person who holds its need step, the row of the routing table that named them (or why nobody holds it) and whether the same person also holds the spend step. Only the sender, the person it is for, the person who holds the step and an IT Admin read it. The person who saved a draft reads it here too, as `draft` instead of `request`: a draft is not a request yet, so it has no price, step or Cost Center, and nobody else reads it (the id of a draft that is owned by somebody else answers as one that does not exist).',
  })
  @ApiErrorResponses(...AUTH_ERRORS, NOT_FOUND, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The id is invalid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async get(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: RequestIdParamDto) {
    try {
      return await this.requestOrOwnDraft(actor, params.id);
    } catch (error) {
      throw toAccessRequestApiException(error);
    }
  }

  /**
   * The request when the caller may see it; else their own draft with that id (spec L.1, F92); else the answer of a request that does
   * not exist. Only the miss reaches for the draft, so reading a request that was sent costs what it always did.
   */
  private async requestOrOwnDraft(actor: AuthenticatedPrincipal, id: string) {
    try {
      return { request: toWire(await this.queries.get(actor, id)) };
    } catch (error) {
      if (!(error instanceof AccessRequestNotFoundError)) throw error;
      const draft = await this.drafts.readOwn(actor, id);
      if (draft === null) throw error;

      return { draft };
    }
  }

  @Post(':id/need-decision')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'accessRequestNeedDecide', summary: 'Approve or refuse the need step of a request' })
  @ApiSuccessResponse(AccessRequestResponseDto, {
    message: 'ACCESS_REQUEST.NEED_DECIDED',
    description:
      'The person who holds the need step approves or refuses it. A refusal gives its reason; a term over twelve months is approved only with a confirmation. The decision becomes an electronic approval record that is never changed. An approval sends the request on (the IT Admin for internal software, the spend submission for paid software); a refusal ends it with no spend step and no commitment.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'The caller asked for or is given the request (ACCESS_REQUEST.OWN_REQUEST), or does not hold the step (ACCESS_REQUEST.NOT_THE_ASSIGNEE).',
      examples: [EXAMPLES.DECISION_OWN_REQUEST, EXAMPLES.DECISION_NOT_THE_ASSIGNEE],
    },
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The step is not pending: it is decided, or waits for somebody to hold it (ACCESS_REQUEST.STEP_NOT_PENDING).',
      examples: [EXAMPLES.STEP_NOT_PENDING, EXAMPLES.GROUP_USES_LINES],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The decision is invalid (VALIDATION_ERROR: a refusal without a reason, a signature, both a line and outside the plan) or a term over twelve months is approved without a confirmation (ACCESS_REQUEST.TERM_CONFIRMATION_REQUIRED). The head who approves a request that costs money gives a line of the plan of the budget or says it is outside the plan, else nothing is saved (ACCESS_REQUEST.PLAN_LINE_REQUIRED); a line that is not there (ACCESS_REQUEST.LINE_NOT_FOUND) or whose window has gone by and is not confirmed as still needed (ACCESS_REQUEST.STILL_NEEDED_REQUIRED) is refused, and a line or a day is not for anyone else or for a request that costs nothing (ACCESS_REQUEST.SPEND_NOT_APPLICABLE).',
      examples: [
        VALIDATION_EXAMPLE,
        EXAMPLES.TERM_CONFIRMATION_REQUIRED,
        EXAMPLES.PLAN_LINE_REQUIRED,
        EXAMPLES.LINE_NOT_FOUND,
        EXAMPLES.STILL_NEEDED_REQUIRED,
        EXAMPLES.SPEND_NOT_APPLICABLE,
      ],
    },
  )
  async decide(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: RequestIdParamDto,
    @Body() body: NeedDecisionBodyDto,
  ) {
    try {
      const record = await this.decisions.decide(actor, params.id, {
        decision: body.decision,
        reason: body.reason,
        termConfirmationReason: body.termConfirmation?.reason,
        ...(body.spend
          ? {
              spend: {
                planLine: body.spend.planLine
                  ? { position: body.spend.planLine.position, stillNeeded: body.spend.planLine.stillNeeded ?? false }
                  : null,
                expectedSpendOn: body.spend.expectedSpendOn,
              },
            }
          : {}),
      });

      return { request: toWire(await this.queries.view(record)) };
    } catch (error) {
      throw toAccessRequestApiException(error);
    }
  }

  @Post(':id/withdraw')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'accessRequestWithdraw', summary: 'Withdraw a request that is still waiting' })
  @ApiSuccessResponse(AccessRequestResponseDto, {
    message: 'ACCESS_REQUEST.WITHDRAWN',
    description:
      'The requester withdraws the request while it waits or while the grant has not been carried out; the head of the department does too, with a reason, once Finance gave it back, it waits for a budget or the data stopped it. The open steps and the questions to Finance close, the request leaves the batch it was sent in, what was held for it goes back to the budget and a task nobody has worked is cancelled with its assignment (never failed). When the grant had failed the request waits (AWAITING_IT_CLOSE) until the IT Admin cancels the task, and it then ends as withdrawn.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'The caller is not the requester, the person it was sent for included, and not the head in a stage the head acts on (ACCESS_REQUEST.NOT_REQUESTER).',
      examples: [EXAMPLES.NOT_REQUESTER],
    },
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'Nothing is left to withdraw (ACCESS_REQUEST.ALREADY_ENDED), the withdrawal waits for the IT Admin (ACCESS_REQUEST.WITHDRAWAL_PENDING), the task of the grant is being worked: ask again when it has a result (ACCESS_REQUEST.GRANT_RUNNING), or the seat is real and the way back is a return (ACCESS_REQUEST.GRANT_COMPLETED). Nothing changes.',
      examples: [
        EXAMPLES.WITHDRAWAL_ALREADY_ENDED,
        EXAMPLES.WITHDRAWAL_PENDING,
        EXAMPLES.GRANT_RUNNING,
        EXAMPLES.GRANT_COMPLETED,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The body is invalid (VALIDATION_ERROR: a blank reason), or the head gives no reason (ACCESS_REQUEST.REASON_REQUIRED). Nothing is saved.',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.WITHDRAWAL_REASON_REQUIRED],
    },
  )
  async withdraw(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: RequestIdParamDto,
    @Body() body: WithdrawBodyDto,
  ) {
    try {
      const record = await this.withdrawals.withdraw(actor, params.id, body);

      return { request: toWire(await this.queries.view(record)) };
    } catch (error) {
      throw toAccessRequestApiException(error);
    }
  }

  @Get(':id/similar-seats')
  @AuthenticatedOnly()
  @ApiOperation({
    operationId: 'accessRequestSimilarSeatList',
    summary: 'List the similar seats of the person asked for',
  })
  @ApiSuccessResponse(SimilarSeatsResponseDto, {
    message: 'ACCESS_REQUEST.SIMILAR_SEATS_LISTED',
    description:
      'The seats the person the request is for already holds in tools of the same functional group, oldest first. Only the person who holds the need step reads them.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'The caller has a part in the request but does not hold its need step (ACCESS_REQUEST.NOT_THE_ASSIGNEE).',
      examples: [EXAMPLES.NOT_ASSIGNEE],
    },
    NOT_FOUND,
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The id or the query is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.EMPLOYEE_REQUIRED],
    },
  )
  async listSimilarSeats(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: RequestIdParamDto,
    @Query() query: SimilarSeatsQueryDto,
  ) {
    try {
      return await this.similarSeats.list(actor, params.id, query);
    } catch (error) {
      throw toAccessRequestApiException(error);
    }
  }
}
