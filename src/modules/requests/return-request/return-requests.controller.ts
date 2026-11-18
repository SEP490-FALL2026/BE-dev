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
import { ACCESS_REQUEST_ERROR_EXAMPLES } from '../access-request/access-request.http-errors';
import {
  ReturnBodyDto,
  ReturnIdParamDto,
  ReturnListQueryDto,
  ReturnListResponseDto,
  ReturnResponseDto,
} from './return-request.dto';
import { RETURN_ERROR_EXAMPLES, toReturnApiException } from './return-request.http-errors';
import { ReturnRequestQueryService } from './return-request-query.service';
import { ReturnRequestService } from './return-request.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The return does not exist, or the caller has no part in it (RETURN_REQUEST.NOT_FOUND).',
  examples: [RETURN_ERROR_EXAMPLES.NOT_FOUND],
} as const;
const INVALID_ID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The id is invalid (VALIDATION_ERROR).',
  examples: [VALIDATION_EXAMPLE],
} as const;

/**
 * The return of a seat: the person who holds it, or the head of their department who confirms it is no longer needed, sends it,
 * and the IT Admin takes the access away through the queue of provisioning. A return is not a request: it has no step to be
 * approved and no saving is recorded for it.
 */
@ApiTags('return-requests')
@Controller({ path: 'return-requests', version: '1' })
export class ReturnRequestsController {
  constructor(
    private readonly returns: ReturnRequestService,
    private readonly queries: ReturnRequestQueryService,
  ) {}

  @Post()
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'returnRequestSubmit', summary: 'Return a seat, or confirm it is no longer needed' })
  @ApiSuccessResponse(ReturnResponseDto, {
    status: HttpStatus.CREATED,
    message: 'RETURN_REQUEST.SUBMITTED',
    description:
      'Names exactly one seat. The holder returns their own seat, whether or not their department has a head; the head of the department of the holder confirms that the seat is no longer needed. There is no approval step: the revocation of the seat is queued for the IT Admin in the same moment, and the seat is given back only when the IT Admin has taken the access away. The note of the plan about what to do before the seat is taken away is shown to the IT Admin; no confirmation of a handover is asked of anyone. No saving is recorded for a return. A request whose withdrawal was refused because its grant was done is named by fromRequestId.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'The Super Admin cannot send a return (ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST). The caller is neither the holder nor the head of the department of the holder (RETURN_REQUEST.NOT_HOLDER), or heads another department (RETURN_REQUEST.OUTSIDE_DEPARTMENT).',
      examples: [
        ACCESS_REQUEST_ERROR_EXAMPLES.SUPER_ADMIN_CANNOT_REQUEST,
        RETURN_ERROR_EXAMPLES.NOT_HOLDER,
        RETURN_ERROR_EXAMPLES.OUTSIDE_DEPARTMENT,
      ],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The seat does not exist (RETURN_REQUEST.ASSIGNMENT_NOT_FOUND).',
      examples: [RETURN_ERROR_EXAMPLES.ASSIGNMENT_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The seat cannot be returned (RETURN_REQUEST.ASSIGNMENT_NOT_RETURNABLE, with the reason in details: it has ended, it is a service account, its plan is not supported, or its grant is not done), it already has a return waiting (RETURN_REQUEST.ALREADY_REQUESTED), a renewal of it waits for its decision (RETURN_REQUEST.RENEWAL_PENDING) or the holder belongs to no department (RETURN_REQUEST.NO_DEPARTMENT). Nothing is written.',
      examples: [
        RETURN_ERROR_EXAMPLES.ASSIGNMENT_NOT_RETURNABLE,
        RETURN_ERROR_EXAMPLES.ALREADY_REQUESTED,
        RETURN_ERROR_EXAMPLES.RENEWAL_PENDING,
        RETURN_ERROR_EXAMPLES.NO_DEPARTMENT,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The form is invalid (VALIDATION_ERROR): exactly one seat and a reason are required. The request named is not the one whose grant made the seat, or the caller has no part in it (RETURN_REQUEST.ORIGIN_MISMATCH). The sender or the holder of the seat is the spending approver (REQUEST_PARTY.INELIGIBLE). Nothing is written.',
      examples: [
        VALIDATION_EXAMPLE,
        RETURN_ERROR_EXAMPLES.ORIGIN_MISMATCH,
        RETURN_ERROR_EXAMPLES.REQUEST_PARTY_INELIGIBLE,
      ],
    },
  )
  async submit(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: ReturnBodyDto) {
    try {
      const record = await this.returns.submit(actor, body);

      return { returnRequest: await this.queries.detail(record) };
    } catch (error) {
      throw toReturnApiException(error);
    }
  }

  @Get()
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'returnRequestList', summary: 'List the returns of seats the caller has a part in' })
  @ApiSuccessResponse(ReturnListResponseDto, {
    message: 'RETURN_REQUEST.LISTED',
    description:
      'The newest first. The IT Admin sees every return; anyone else sees the returns of the seats they hold, the returns they sent and, as the head of a department, those of the people of the department. Each row carries the plan, the source, the state of the revocation, and none of the long texts.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The query is invalid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async list(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: ReturnListQueryDto) {
    try {
      return await this.queries.list(actor, query);
    } catch (error) {
      throw toReturnApiException(error);
    }
  }

  @Get(':id')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'returnRequestGet', summary: 'Read one return of a seat' })
  @ApiSuccessResponse(ReturnResponseDto, {
    message: 'RETURN_REQUEST.READ',
    description:
      'The return with its reason, the note of the plan and how the revocation ended. Only the holder, the person who sent it, the head of the department of the holder and the IT Admin read it.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, NOT_FOUND, INVALID_ID)
  async get(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: ReturnIdParamDto) {
    try {
      return { returnRequest: await this.queries.get(actor, params.id) };
    } catch (error) {
      throw toReturnApiException(error);
    }
  }
}
