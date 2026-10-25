import { Body, Controller, HttpStatus, Post } from '@nestjs/common';
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
import { AccessRequestQueryService } from '../access-request/access-request-query.service';
import { toWire } from '../access-request/access-request.wire';
import { RenewalBodyDto, RenewalResponseDto } from './renewal-request.dto';
import { toRenewalApiException } from './renewal-request.http-errors';
import { RenewalRequestService } from './renewal-request.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;

/**
 * The renewal of a right that ends on a day: the holder, or the head of their department, asks for a later end. The request is the
 * same as any other (it is read, withdrawn and decided through the routes of requests); this makes it. Nothing here edits the end
 * a right has.
 */
@ApiTags('access-requests')
@Controller({ path: 'access-requests', version: '1' })
export class RenewalRequestsController {
  constructor(
    private readonly renewals: RenewalRequestService,
    private readonly queries: AccessRequestQueryService,
  ) {}

  @Post('renewals')
  @AuthenticatedOnly()
  @ApiOperation({
    operationId: 'accessRequestRenewalSubmit',
    summary: 'Ask to renew a right that ends on a day',
  })
  @ApiSuccessResponse(RenewalResponseDto, {
    status: HttpStatus.CREATED,
    message: 'ACCESS_REQUEST.RENEWAL_SUBMITTED',
    description:
      'The holder of a right that has an end date, or the head of their department, asks for a later end. The end the right has is never edited: a request of its own is made for the same tool and the person, decided like any request (the need step and, for paid software, the spend step), and approval ends the old record at its end and begins a new one that follows it, so the seats taken on any day do not change. Sent up to the end of the right, today included, the right stays as it is until the request is decided, and a refusal or a withdrawal leaves it for the revocation that follows its end. A stay over twelve months in all, counting the records that followed one another, needs the confirmation of whoever confirms the need. Sent after the end, what is made is a request for the tool like any other (outcome NEW_REQUEST), sent by the person it is for.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'The caller is neither the holder nor the head of the department of the holder (RENEWAL_REQUEST.NOT_HOLDER), or heads another department (RENEWAL_REQUEST.OUTSIDE_DEPARTMENT).',
    },
    { status: HttpStatus.NOT_FOUND, description: 'The seat does not exist (RENEWAL_REQUEST.ASSIGNMENT_NOT_FOUND).' },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The seat cannot be renewed (RENEWAL_REQUEST.ASSIGNMENT_NOT_RENEWABLE, with the reason in details: it is a service account, another record follows it, it has ended, it has no end date, its grant is not done, or it is being revoked), it already has a renewal waiting (RENEWAL_REQUEST.ALREADY_REQUESTED), the head asks after the end (RENEWAL_REQUEST.END_PASSED), the application is retired (ACCESS_REQUEST.APPLICATION_RETIRED) or, after the end, the person holds another seat of the tool (ACCESS_REQUEST.ALREADY_HOLDS_ACCESS). Nothing is written.',
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The form is incomplete or invalid (VALIDATION_ERROR). The end is not after the end the right has, or after today (RENEWAL_REQUEST.END_NOT_AFTER), the term is too long (RENEWAL_REQUEST.END_TOO_FAR), a head who sends it for more than twelve months gives no confirmation (RENEWAL_REQUEST.TERM_CONFIRMATION_REQUIRED), or a request sent after the end for a tool outside the standard toolset gives no reason (ACCESS_REQUEST.OUTSIDE_STANDARD_REASON_REQUIRED). Nothing is written.',
    },
  )
  async submit(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: RenewalBodyDto) {
    try {
      const { outcome, record } = await this.renewals.submit(actor, body);

      return { outcome, request: toWire(await this.queries.view(record)) };
    } catch (error) {
      throw toRenewalApiException(error);
    }
  }
}
