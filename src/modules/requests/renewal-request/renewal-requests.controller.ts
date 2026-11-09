import { Body, Controller, HttpStatus, Post } from '@nestjs/common';
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
import { AccessRequestQueryService } from '../request-view/access-request-query.service';
import { toWire } from '../request-view/access-request.mapper';
import { RenewalBodyDto, RenewalResponseDto } from './renewal-request.dto';
import { RENEWAL_ERROR_EXAMPLES, toRenewalApiException } from './renewal-request.http-errors';
import { RenewalRequestService } from './renewal-request.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;

const SUBMIT_ERRORS = [
  ...AUTH_ERRORS,
  {
    status: HttpStatus.FORBIDDEN,
    description:
      'The caller is not the holder of the seat, a head of the department included (RENEWAL_REQUEST.NOT_HOLDER), or is the Super Admin, who sends no request (ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST).',
    examples: [RENEWAL_ERROR_EXAMPLES.NOT_HOLDER, RENEWAL_ERROR_EXAMPLES.SUPER_ADMIN_CANNOT_REQUEST],
  },
  {
    status: HttpStatus.NOT_FOUND,
    description: 'The seat does not exist (RENEWAL_REQUEST.ASSIGNMENT_NOT_FOUND).',
    examples: [RENEWAL_ERROR_EXAMPLES.ASSIGNMENT_NOT_FOUND],
  },
  {
    status: HttpStatus.CONFLICT,
    description:
      'The seat cannot be renewed (RENEWAL_REQUEST.ASSIGNMENT_NOT_RENEWABLE, with the reason in details: it is a service account, another record follows it, it has ended, it has no end date, its grant is not done, or it is being revoked), it already has a renewal waiting (RENEWAL_REQUEST.ALREADY_REQUESTED), its window is not open yet (RENEWAL_REQUEST.WINDOW_NOT_OPEN, with details.opensOn and details.windowDays: a renewal is sent from RENEWAL_WINDOW_DAYS days before the approved end, BR-MF1-08a), the application is retired (ACCESS_REQUEST.APPLICATION_RETIRED) or, after the end, the person holds another seat of the tool (ACCESS_REQUEST.ALREADY_HOLDS_ACCESS). After the end the ask is a request for new access, so GH-1/GH-2 judge it too (ACCESS_REQUEST.OPEN_REQUEST_EXISTS, ACCESS_REQUEST.OPEN_LIMIT_REACHED). Nothing is written.',
    examples: [
      RENEWAL_ERROR_EXAMPLES.ASSIGNMENT_NOT_RENEWABLE,
      RENEWAL_ERROR_EXAMPLES.ALREADY_REQUESTED,
      RENEWAL_ERROR_EXAMPLES.WINDOW_NOT_OPEN,
      RENEWAL_ERROR_EXAMPLES.APPLICATION_RETIRED,
      RENEWAL_ERROR_EXAMPLES.ALREADY_HOLDS_ACCESS,
      RENEWAL_ERROR_EXAMPLES.NO_DEPARTMENT,
      RENEWAL_ERROR_EXAMPLES.FINANCE_SETUP_INCOMPLETE,
      RENEWAL_ERROR_EXAMPLES.OPEN_REQUEST_EXISTS,
      RENEWAL_ERROR_EXAMPLES.OPEN_LIMIT_REACHED,
    ],
  },
  {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'The form is incomplete or invalid (VALIDATION_ERROR): the seat, the new end date (newEndDate; or, deprecated, the months more extensionMonths 1 to 12, exactly one of the two) and the reason are required, and nothing else is taken. The new end must be after the end the right has and at most twelve months after it (RENEWAL_REQUEST.END_DATE_OUT_OF_RANGE, with details.previousEndDate and details.maxEndDate). The sender or the holder of the seat is the spending approver (REQUEST_PARTY.INELIGIBLE). After the end, a holder who uses as many paid applications as the threshold must give manyPaidSoftwareReason (ACCESS_REQUEST.MANY_PAID_SOFTWARE_REASON_REQUIRED). Nothing is written.',
    examples: [
      VALIDATION_EXAMPLE,
      RENEWAL_ERROR_EXAMPLES.REQUEST_PARTY_INELIGIBLE,
      RENEWAL_ERROR_EXAMPLES.MANY_PAID_SOFTWARE_REASON_REQUIRED,
      RENEWAL_ERROR_EXAMPLES.END_DATE_OUT_OF_RANGE,
    ],
  },
] as const;

/**
 * The renewal of a right that ends on a day: the holder asks for a later end. The request is the
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
  @ApiErrorResponses(...SUBMIT_ERRORS)
  async submit(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: RenewalBodyDto) {
    try {
      const { outcome, record } = await this.renewals.submit(actor, body);

      return { outcome, request: toWire(await this.queries.view(record)) };
    } catch (error) {
      throw toRenewalApiException(error);
    }
  }
}
