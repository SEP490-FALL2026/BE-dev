import { Body, Controller, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { AuthenticatedOnly, RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AccessRequestResponseDto, RequestIdParamDto } from '../access-request/access-request.dto';
import { AccessRequestQueryService } from '../request-view/access-request-query.service';
import { toWire } from '../request-view/access-request.mapper';
import { ServiceAccountBoundaryService } from './service-account-boundary.service';
import { ServiceAccountRequestService } from './service-account-request.service';
import { ServiceAccountReviewBodyDto, ServiceAccountSubmitBodyDto } from './service-account-request.dto';
import { SERVICE_ACCOUNT_ERROR_EXAMPLES, toServiceAccountApiException } from './service-account-request.http-errors';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;

/**
 * A request for the account of a non-human subject after the installation, and the verdict of the IT Admin on whether it is
 * one. The request is the same as any other (it is read, withdrawn and decided through the routes of requests); this adds
 * the two things only it has. The system keeps no password or key of the account.
 */
@ApiTags('access-requests')
@Controller({ path: 'access-requests', version: '1' })
export class ServiceAccountRequestsController {
  constructor(
    private readonly requests: ServiceAccountRequestService,
    private readonly boundary: ServiceAccountBoundaryService,
    private readonly queries: AccessRequestQueryService,
  ) {}

  @Post('service-accounts')
  @AuthenticatedOnly()
  @ApiOperation({
    operationId: 'accessRequestServiceAccountSubmit',
    summary: 'Send a request for a service account',
  })
  @ApiSuccessResponse(AccessRequestResponseDto, {
    status: HttpStatus.CREATED,
    message: 'ACCESS_REQUEST.SERVICE_ACCOUNT_SUBMITTED',
    description:
      'The sender asks for the account of a non-human subject for themselves and answers for it. The request is charged to the Unit Cost Center of the department of the sender on the day, and is decided like any request for the plan: a paid plan always has its spend step, whatever seats are left on the subscription. It is granted only after the IT Admin accepted that the account is a non-human subject. It carries the purpose and the identifier the sender expects, which the IT Admin may change when granting. Only plans granted by a seat on a subscription or in internal software are accepted, and only once the seat baseline is closed.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'The Super Admin sends no request (ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST).',
      examples: [SERVICE_ACCOUNT_ERROR_EXAMPLES.SUPER_ADMIN_CANNOT_REQUEST],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The plan does not exist (ACCESS_REQUEST.PLAN_NOT_FOUND).',
      examples: [SERVICE_ACCOUNT_ERROR_EXAMPLES.PLAN_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The seat baseline is not closed yet (SERVICE_ACCOUNT_REQUEST.BASELINE_NOT_CLOSED), the application of the plan is retired (ACCESS_REQUEST.APPLICATION_RETIRED) , the sender belongs to no department (ACCESS_REQUEST.NO_DEPARTMENT) or the department has no Cost Center in use yet (FINANCE.SETUP_INCOMPLETE). Nothing is written.',
      examples: [
        SERVICE_ACCOUNT_ERROR_EXAMPLES.BASELINE_NOT_CLOSED,
        SERVICE_ACCOUNT_ERROR_EXAMPLES.APPLICATION_RETIRED,
        SERVICE_ACCOUNT_ERROR_EXAMPLES.NO_DEPARTMENT,
        SERVICE_ACCOUNT_ERROR_EXAMPLES.FINANCE_SETUP_INCOMPLETE,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The form is incomplete or invalid (VALIDATION_ERROR): the purpose, the identifier, the reason and the term are required. The plan is granted by a key tied to a device or cannot be granted yet (SERVICE_ACCOUNT_REQUEST.PLAN_NOT_SUPPORTED), or the sender is the spending approver (REQUEST_PARTY.INELIGIBLE). Nothing is written.',
      examples: [
        VALIDATION_EXAMPLE,
        SERVICE_ACCOUNT_ERROR_EXAMPLES.PLAN_NOT_SUPPORTED,
        SERVICE_ACCOUNT_ERROR_EXAMPLES.REQUEST_PARTY_INELIGIBLE,
      ],
    },
  )
  async submit(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: ServiceAccountSubmitBodyDto) {
    try {
      const record = await this.requests.submit(actor, body);

      return { request: toWire(await this.queries.view(record)) };
    } catch (error) {
      throw toServiceAccountApiException(error);
    }
  }

  @Post(':id/service-account-review')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({
    operationId: 'accessRequestServiceAccountReview',
    summary: 'Accept or refuse the boundary of a service account',
  })
  @ApiSuccessResponse(AccessRequestResponseDto, {
    message: 'ACCESS_REQUEST.SERVICE_ACCOUNT_REVIEWED',
    description:
      'Once every approval is taken, the IT Admin reads the purpose and says whether the account belongs to a non-human subject. An acceptance lets the request be granted. A refusal gives its reason and ends the request as refused by the IT Admin; what was held for it in the budget goes back, and no assignment or task is made. The verdict is given once. An IT Admin who answers for the account themselves decides only when no other usable IT Admin can.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'Only an IT Admin decides, and one who answers for the account themselves waits for another usable IT Admin (PROVISIONING.ANOTHER_IT_ADMIN_NEEDED).',
      examples: [FORBIDDEN_EXAMPLE, SERVICE_ACCOUNT_ERROR_EXAMPLES.ANOTHER_IT_ADMIN_NEEDED],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The request does not exist (ACCESS_REQUEST.NOT_FOUND).',
      examples: [SERVICE_ACCOUNT_ERROR_EXAMPLES.REQUEST_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The request is not for a service account or is not waiting to be carried out (SERVICE_ACCOUNT_REQUEST.NOT_REVIEWABLE), or the verdict is already given (SERVICE_ACCOUNT_REQUEST.BOUNDARY_ALREADY_DECIDED). Nothing changes.',
      examples: [
        SERVICE_ACCOUNT_ERROR_EXAMPLES.NOT_REVIEWABLE,
        SERVICE_ACCOUNT_ERROR_EXAMPLES.BOUNDARY_ALREADY_DECIDED,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The id or the body is invalid (VALIDATION_ERROR): a refusal without a reason, or an acceptance with one.',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async review(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: RequestIdParamDto,
    @Body() body: ServiceAccountReviewBodyDto,
  ) {
    try {
      const record = await this.boundary.review(actor, params.id, body);

      return { request: toWire(await this.queries.view(record)) };
    } catch (error) {
      throw toServiceAccountApiException(error);
    }
  }
}
