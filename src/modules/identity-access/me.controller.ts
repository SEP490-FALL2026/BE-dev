import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses } from '../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../infrastructure/http/decorators/api-success-response.decorator';
import { AuthenticatedOnly } from '../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../infrastructure/security/tokens/access-token-verifier.port';
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
    { status: HttpStatus.SERVICE_UNAVAILABLE, description: 'Authentication is temporarily unavailable.' },
  )
  get(@CurrentPrincipal() principal: AuthenticatedPrincipal): Promise<MeView> {
    return this.me.get(principal);
  }
}
