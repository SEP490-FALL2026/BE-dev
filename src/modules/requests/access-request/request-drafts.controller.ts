import { Body, Controller, Delete, Get, HttpStatus, Param, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import {
  ApiSuccessResponse,
  SUCCESS_MESSAGE_OVERRIDE,
} from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { AuthenticatedOnly } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { ACCESS_REQUEST_ERROR_EXAMPLES as EXAMPLES, toAccessRequestApiException } from './access-request.http-errors';
import { AccessRequestQueryService } from './access-request-query.service';
import { toWire } from './access-request.wire';
import {
  AccessRequestDraftPageResponseDto,
  AccessRequestDraftResponseDto,
  DraftListQueryDto,
  DraftParamDto,
  DraftSaveBodyDto,
  DraftSubmitBodyDto,
  DraftSubmitResponseDto,
} from './request-draft.dto';
import type { DraftKind } from './request-draft.policy';
import { RequestDraftSubmitService } from './request-draft-submit.service';
import { RequestDraftService } from './request-draft.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const SUPER_ADMIN = {
  status: HttpStatus.FORBIDDEN,
  description:
    'The Super Admin sends no request, so keeps no draft of one (ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST).',
  examples: [EXAMPLES.SUPER_ADMIN_CANNOT_REQUEST],
} as const;
const DRAFT_NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The request is not a draft of the caller, or does not exist (ACCESS_REQUEST.NOT_FOUND).',
  examples: [EXAMPLES.NOT_FOUND],
} as const;
const NOT_DRAFT = {
  status: HttpStatus.CONFLICT,
  description: 'The request is the caller’s and was sent already: it is no longer a draft (ACCESS_REQUEST.NOT_DRAFT).',
  examples: [EXAMPLES.NOT_DRAFT],
} as const;

/** The message of the operation that sends each kind of request: a draft that is sent answers as that operation does. */
const SUBMITTED_MESSAGE: Readonly<Record<DraftKind, string>> = {
  INDIVIDUAL: 'ACCESS_REQUEST.SUBMITTED',
  GROUP: 'GROUP_REQUEST.SUBMITTED',
  SERVICE_ACCOUNT: 'ACCESS_REQUEST.SERVICE_ACCOUNT_SUBMITTED',
};

/**
 * The drafts of paid requests (spec L.1, F27): what a person saves when their department has no Cost Center yet and a paid request
 * cannot be sent. A draft is the sender's alone: it is listed, sent and deleted only by them, and it is never a request until it is
 * sent (no queue, no `KPI-2`, no count of open work, no reader of a request sees it). Saving runs no gate; sending runs every gate of
 * the operation that sends that kind of request. There is no operation that changes a draft: delete it and save it again. The Super
 * Admin sends no request, and keeps no draft. This controller is declared before the one of `access-requests/:id`, so that the path
 * `drafts` is a route of its own and never an id.
 */
@ApiTags('access-requests')
@Controller({ path: 'access-requests/drafts', version: '1' })
export class RequestDraftsController {
  constructor(
    private readonly drafts: RequestDraftService,
    private readonly submissions: RequestDraftSubmitService,
    private readonly queries: AccessRequestQueryService,
  ) {}

  @Post()
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'accessRequestDraftSave', summary: 'Save a request as a draft' })
  @ApiSuccessResponse(AccessRequestDraftResponseDto, {
    status: HttpStatus.CREATED,
    message: 'ACCESS_REQUEST.DRAFT_SAVED',
    description:
      'Keeps what the sender filled for an individual request, a request for a group or a request for a service account (the body is the one of the operation that sends it, with its kind), without any gate: no Cost Center, no check of the budget, no step, no commitment, and it counts for nothing. It is listed, sent and deleted only by the sender; to change it, delete it and save it again.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    SUPER_ADMIN,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The plan does not exist (ACCESS_REQUEST.PLAN_NOT_FOUND).',
      examples: [EXAMPLES.PLAN_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description: 'The sender belongs to no department (ACCESS_REQUEST.NO_DEPARTMENT).',
      examples: [EXAMPLES.NO_DEPARTMENT],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The body is invalid for its kind (VALIDATION_ERROR). Nothing is saved.',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async save(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: DraftSaveBodyDto) {
    try {
      return { draft: await this.drafts.save(actor, body) };
    } catch (error) {
      throw toAccessRequestApiException(error);
    }
  }

  @Get()
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'accessRequestDraftList', summary: 'List the drafts of the caller' })
  @ApiSuccessResponse(AccessRequestDraftPageResponseDto, {
    message: 'ACCESS_REQUEST.DRAFTS_LISTED',
    description:
      'The drafts the caller saved and nobody else’s, the newest first and then by id, a page at a time (pageSize 1 to 100, 20 when left out): the kind, the department and the plan, and how many people it is for.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, SUPER_ADMIN, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The page or its size is invalid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async list(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: DraftListQueryDto) {
    try {
      return await this.drafts.list(actor, query);
    } catch (error) {
      throw toAccessRequestApiException(error);
    }
  }

  @Post(':id/submission')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'accessRequestDraftSubmit', summary: 'Send a draft' })
  @ApiSuccessResponse(DraftSubmitResponseDto, {
    status: HttpStatus.CREATED,
    message: 'ACCESS_REQUEST.SUBMITTED',
    description:
      'Sends the draft by the operation that sends that kind of request, with every gate it has (the finance setup of the department of the sender on the day first), on what was saved: the draft becomes the request, sent now. It answers as that operation does, with its message (GROUP_REQUEST.SUBMITTED for a group, ACCESS_REQUEST.SERVICE_ACCOUNT_SUBMITTED for a service account). When a gate refuses, the answer is that operation’s own and the draft stays as it was.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    SUPER_ADMIN,
    {
      status: HttpStatus.NOT_FOUND,
      description:
        'The request is not a draft of the caller (ACCESS_REQUEST.NOT_FOUND), or the plan no longer exists (ACCESS_REQUEST.PLAN_NOT_FOUND).',
      examples: [EXAMPLES.NOT_FOUND, EXAMPLES.PLAN_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The request was sent already (ACCESS_REQUEST.NOT_DRAFT), the department has no Cost Center in use yet (FINANCE.SETUP_INCOMPLETE), the application of the plan is retired (ACCESS_REQUEST.APPLICATION_RETIRED), the sender belongs to no department (ACCESS_REQUEST.NO_DEPARTMENT) or already holds a seat of the plan (ACCESS_REQUEST.ALREADY_HOLDS_ACCESS). The refusals particular to a group or a service account are those of their own operations.',
      examples: [
        EXAMPLES.NOT_DRAFT,
        EXAMPLES.FINANCE_SETUP_INCOMPLETE,
        EXAMPLES.APPLICATION_RETIRED,
        EXAMPLES.NO_DEPARTMENT,
        EXAMPLES.ALREADY_HOLDS_ACCESS,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The id is invalid (VALIDATION_ERROR), or an expected spend date is saved for internal software (ACCESS_REQUEST.NO_SPEND_FOR_FREE_SOFTWARE). Nothing changes.',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.NO_SPEND_FOR_FREE_SOFTWARE],
    },
  )
  async submit(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: DraftParamDto,
    @Body() _body: DraftSubmitBodyDto,
    @Req() request: Record<string, unknown>,
  ) {
    try {
      const sent = await this.submissions.submit(actor, params.id);
      request[SUCCESS_MESSAGE_OVERRIDE] = SUBMITTED_MESSAGE[sent.kind];

      return { request: toWire(await this.queries.view(sent.record)) };
    } catch (error) {
      throw toAccessRequestApiException(error);
    }
  }

  @Delete(':id')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'accessRequestDraftDelete', summary: 'Delete a draft' })
  @ApiSuccessResponse(AccessRequestDraftResponseDto, {
    message: 'ACCESS_REQUEST.DRAFT_DELETED',
    description:
      'Deletes the draft and what hangs from it in one transaction, and answers with what it was. The Audit Trail keeps its kind, plan and department. A request the caller sent already is not a draft and is not deleted.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, SUPER_ADMIN, DRAFT_NOT_FOUND, NOT_DRAFT, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The id is invalid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async delete(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: DraftParamDto) {
    try {
      return { draft: await this.drafts.delete(actor, params.id) };
    } catch (error) {
      throw toAccessRequestApiException(error);
    }
  }
}
