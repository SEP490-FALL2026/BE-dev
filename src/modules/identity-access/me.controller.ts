import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses } from '../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../infrastructure/http/decorators/api-success-response.decorator';
import { AuthenticatedOnly } from '../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../infrastructure/security/tokens/access-token-verifier.port';
import { toUnavailableApiException } from './account-management.http-errors';
import { MeResponseDto } from './dto/me.dto';
import { MeService, MeView } from './me.service';

@ApiTags('me')
@Controller({ path: 'me', version: '1' })
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'meGet' })
  @ApiSuccessResponse(MeResponseDto, {
    message: 'ME.RETRIEVED',
    description: 'The signed-in account, its employee record and its effective roles.',
  })
  @ApiErrorResponses(
    { status: HttpStatus.UNAUTHORIZED, description: 'Authentication is required or the token is no longer valid.' },
    {
      status: HttpStatus.SERVICE_UNAVAILABLE,
      description:
        'Authentication or the service is temporarily unavailable (TOKEN_VERIFICATION_UNAVAILABLE from the guard, SERVICE_UNAVAILABLE after it).',
    },
  )
  async get(@CurrentPrincipal() principal: AuthenticatedPrincipal): Promise<MeView> {
    try {
      return await this.me.get(principal);
    } catch (error) {
      // The guard already read the database; it can still stop answering before MeService does (R-15).
      throw toUnavailableApiException(error) ?? error;
    }
  }
}
