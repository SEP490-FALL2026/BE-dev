import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { AuthenticatedOnly } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import {
  ReturnBodyDto,
  ReturnIdParamDto,
  ReturnListQueryDto,
  ReturnListResponseDto,
  ReturnResponseDto,
} from './return-request.dto';
import { toReturnApiException } from './return-request.http-errors';
import { ReturnRequestQueryService } from './return-request-query.service';
import { ReturnRequestService } from './return-request.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;

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
      'Names exactly one seat. The holder returns their own seat, whether or not their department has a head; the head of the department of the holder confirms that the seat is no longer needed. There is no approval step: the revocation of the seat is queued for the IT Admin in the same moment, and the seat is given back only when the IT Admin has taken the access away. A plan whose removal loses data asks the person who sent the return to confirm that the handover is done, by a short deadline; a plan that loses nothing only shows its note. No saving is recorded for a return. A request whose withdrawal was refused because its grant was done is named by fromRequestId.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'The caller is neither the holder nor the head of the department of the holder (RETURN_REQUEST.NOT_HOLDER), or heads another department (RETURN_REQUEST.OUTSIDE_DEPARTMENT).',
    },
    { status: HttpStatus.NOT_FOUND, description: 'The seat does not exist (RETURN_REQUEST.ASSIGNMENT_NOT_FOUND).' },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The seat cannot be returned (RETURN_REQUEST.ASSIGNMENT_NOT_RETURNABLE, with the reason in details: it has ended, it is a service account, its plan is not supported, or its grant is not done), it already has a return waiting (RETURN_REQUEST.ALREADY_REQUESTED), a renewal of it waits for its decision (RETURN_REQUEST.RENEWAL_PENDING) or the holder belongs to no department (RETURN_REQUEST.NO_DEPARTMENT). Nothing is written.',
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The form is invalid (VALIDATION_ERROR): exactly one seat and a reason are required. The request named is not the one whose grant made the seat, or the caller has no part in it (RETURN_REQUEST.ORIGIN_MISMATCH). Nothing is written.',
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
      'The newest first. The IT Admin sees every return; anyone else sees the returns of the seats they hold, the returns they sent and, as the head of a department, those of the people of the department. Each row carries the plan, the source, the state of the revocation and what the handover asks, and none of the long texts.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The query is invalid (VALIDATION_ERROR).',
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
      'The return with its reason, the note of the plan, the handover and how the revocation ended. Only the holder, the person who sent it, the head of the department of the holder and the IT Admin read it.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The return does not exist, or the caller has no part in it (RETURN_REQUEST.NOT_FOUND).',
    },
    { status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'The id is invalid (VALIDATION_ERROR).' },
  )
  async get(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: ReturnIdParamDto) {
    try {
      return { returnRequest: await this.queries.get(actor, params.id) };
    } catch (error) {
      throw toReturnApiException(error);
    }
  }

  @Post(':id/handover-confirmation')
  @AuthenticatedOnly()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'returnRequestHandoverConfirm',
    summary: 'Confirm that the handover of the data is done',
  })
  @ApiSuccessResponse(ReturnResponseDto, {
    message: 'RETURN_REQUEST.HANDOVER_CONFIRMED',
    description:
      'The person who sent the return, the holder returning their seat or the head confirming it, says that the handover of the data is done. The IT Admin may complete the revocation of a plan that loses data only after this, or after the deadline has passed: a revocation completed after the deadline without it is flagged as completed without the confirmation. The confirmation is written once.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'The caller did not send the return (RETURN_REQUEST.NOT_REQUESTER).',
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The return does not exist, or the caller has no part in it (RETURN_REQUEST.NOT_FOUND).',
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The plan asks for no handover (RETURN_REQUEST.HANDOVER_NOT_REQUIRED), it is confirmed already (RETURN_REQUEST.HANDOVER_ALREADY_CONFIRMED) or the return has ended (RETURN_REQUEST.NOT_AWAITING). Nothing changes.',
    },
    { status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'The id is invalid (VALIDATION_ERROR).' },
  )
  async confirmHandover(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: ReturnIdParamDto) {
    try {
      const record = await this.returns.confirmHandover(actor, params.id);

      return { returnRequest: await this.queries.detail(record) };
    } catch (error) {
      throw toReturnApiException(error);
    }
  }
}
