import { RequestResubmissionService } from '../request-intake/request-resubmission.service';
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
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
import { AccessRequestResponseDto, RequestIdParamDto, SubmitBodyDto } from '../access-request/access-request.dto';
import { AccessRequestOrDraftResponseDto } from '../draft/request-draft.dto';
import { PreviewBodyDto, PreviewResponseDto } from './request-preview.dto';
import { RequestDraftService } from '../draft/request-draft.service';
import { RequestPreviewService } from './request-preview.service';
import { AccessRequestNotFoundError } from '../access-request/access-request.errors';
import {
  ACCESS_REQUEST_ERROR_EXAMPLES as EXAMPLES,
  toAccessRequestApiException,
} from '../access-request/access-request.http-errors';
import { AccessRequestQueryService } from '../request-view/access-request-query.service';
import { toWire } from '../request-view/access-request.mapper';
import { AccessRequestService } from '../request-intake/access-request.service';

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
    private readonly resubmissions: RequestResubmissionService,
    private readonly previews: RequestPreviewService,
    private readonly queries: AccessRequestQueryService,
    private readonly drafts: RequestDraftService,
  ) {}

  @Post()
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'accessRequestSubmit', summary: 'Send a request for access to software' })
  @ApiSuccessResponse(AccessRequestResponseDto, {
    status: HttpStatus.CREATED,
    message: 'ACCESS_REQUEST.SUBMITTED',
    description:
      'The request is fixed to its branch and chain of steps, charged to the Unit Cost Center of the department of the sender on the day, and its need step is given to the one person the routing table names. A requester who is the current head, or whose department has no effective head, skips the need step; paid requests are checked immediately and a blocked request stays saved for revision.',
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
        'The form is incomplete or invalid (VALIDATION_ERROR): the reason and the term are required. The sender is the spending approver (REQUEST_PARTY.INELIGIBLE, with the sender in details.employeeIds). Nothing is written.',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.REQUEST_PARTY_INELIGIBLE],
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
        'The body is invalid (VALIDATION_ERROR), or the caller is placed in no department (REQUEST_PARTY.INELIGIBLE, details.reason UNPLACED). A spending approver is not refused here: the answer is 200 with blockedBy and canSubmit false.',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.PREVIEW_REQUEST_PARTY_UNPLACED],
    },
  )
  async preview(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: PreviewBodyDto) {
    try {
      return { preview: await this.previews.preview(actor, body) };
    } catch (error) {
      throw toAccessRequestApiException(error);
    }
  }

  @Post(':id/resubmission')
  @HttpCode(HttpStatus.OK)
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'accessRequestResubmit', summary: 'Send a revised one-step request again' })
  @ApiSuccessResponse(AccessRequestResponseDto, {
    message: 'ACCESS_REQUEST.RESUBMITTED',
    description: 'The request is checked again and either waits for its requester or goes to the spending approver.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    NOT_FOUND,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only the requester sends the request again (ACCESS_REQUEST.NOT_REQUESTER).',
      examples: [EXAMPLES.NOT_REQUESTER],
    },
    {
      status: HttpStatus.CONFLICT,
      description: 'The request is not waiting for revision (ACCESS_REQUEST.NOT_AWAITING_REVISION).',
      examples: [EXAMPLES.NOT_AWAITING_REVISION],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The id is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async resubmit(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: RequestIdParamDto) {
    try {
      return { request: toWire(await this.queries.view(await this.resubmissions.resubmit(actor, params.id))) };
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
      'The request with the person who holds its need step, the row of the routing table that named them (or why nobody holds it) and its fixed one-step or via-head routing. It is read by the people who read it in their history: the sender, the person it is for, whoever holds or held a need step, the head today of the department it was sent from, an IT Admin, a spending approver once a spend step was opened on it and Finance once its spend was approved; nobody else, the Super Admin included, learns that it exists. The person who saved a draft reads it here too, as `draft` instead of `request`: a draft is not a request yet, so it has no price, step or Cost Center, and nobody else reads it (the id of a draft that is owned by somebody else answers as one that does not exist).',
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
   * The request when the caller may see it; else their own draft with that id; else the answer of a request that does
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
}
