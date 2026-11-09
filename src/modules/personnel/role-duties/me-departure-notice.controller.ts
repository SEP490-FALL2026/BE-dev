import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { AuthenticatedOnly } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { DepartureNoticeResponseDto, type DepartureNoticeWire } from './role-duties.dto';
import { RoleDutiesViewService } from './role-duties-view.service';

/**
 * The departure of the person who asks, told to them: the last working day, how far it has come and which of the roles that need
 * someone to take over they still hold. Open to every signed-in account, and only ever about the account that asks.
 */
@ApiTags('me')
@Controller({ path: 'me/departure-notice', version: '1' })
export class MeDepartureNoticeController {
  constructor(private readonly view: RoleDutiesViewService) {}

  @Get()
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'meDepartureNoticeGet', summary: 'Read my own departure' })
  @ApiSuccessResponse(DepartureNoticeResponseDto, {
    message: 'ME.DEPARTURE_NOTICE_RETRIEVED',
    description:
      'The departure of the signed-in person that is not closed, or no data when there is none: the last working day, whether it has passed with the departure not yet recorded (the account still works until the departure is recorded), and which of the roles that need someone to take over they hold. It is never about anyone else.',
  })
  @ApiErrorResponses(UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE)
  async get(@CurrentPrincipal() principal: AuthenticatedPrincipal): Promise<DepartureNoticeWire | null> {
    try {
      return await this.view.noticeOf(principal);
    } catch (error) {
      throw toUnavailableApiException(error) ?? error;
    }
  }
}
