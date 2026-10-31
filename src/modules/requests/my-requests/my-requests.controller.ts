import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
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
  ACCESS_REQUEST_ERROR_EXAMPLES as EXAMPLES,
  toAccessRequestApiException,
} from '../access-request/access-request.http-errors';
import { MyRequestsPageResponseDto, MyRequestsQueryDto } from './my-requests.dto';
import { MyRequestsService } from './my-requests.service';

/**
 * "My requests": the requests the signed-in person sent, for the web overview and the phone screen alike (one operation, no separate
 * one for the phone). Read only, and only ever about the caller: there is no parameter that names a person. The route is declared under
 * `me`, so it can never be taken for the id of a request.
 */
@ApiTags('me')
@Controller({ path: 'me/access-requests', version: '1' })
export class MyRequestsController {
  constructor(private readonly myRequests: MyRequestsService) {}

  @Get()
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'meAccessRequestList', summary: 'List the requests I sent' })
  @ApiSuccessResponse(MyRequestsPageResponseDto, {
    message: 'ME.ACCESS_REQUESTS_LISTED',
    description:
      'One page of the requests the signed-in person sent and nobody else’s, the newest sent first and then by id: pageSize 1 to 100, 20 when left out. A request that somebody else sent for them, a request they only decide or read as the head, the IT Admin or Finance, and a draft are not listed (a draft is listed by the drafts route). Narrowed by view (open or ended), by one or more states, by type and by the moment it was sent. Each row names the plan or the proposed software, who it is for, its state, who it waits for at the need step, where a request that costs money stands on its way to the spending approver, the reason when it was refused, when it was withdrawn and whether the sender may withdraw it now (a hint: the withdrawal judges again). No budget figure, what is left, result of a check, price or cost of another person is answered; the detail of a request is read by its id.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'The Super Admin sends no request, so has none to list (ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST).',
      examples: [EXAMPLES.SUPER_ADMIN_CANNOT_REQUEST],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The page, its size, the view, the states, the type or the window of the moment sent is invalid, or a parameter that names a person is given (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async list(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: MyRequestsQueryDto) {
    try {
      return await this.myRequests.list(actor, query);
    } catch (error) {
      throw toAccessRequestApiException(error);
    }
  }
}
