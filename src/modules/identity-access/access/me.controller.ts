import { Body, Controller, Get, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  VALIDATION_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { AuthenticatedOnly } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { PasswordChangeService } from '../auth/password-change.service';
import { ChangePasswordBodyDto, PasswordChangedResponseDto } from '../dto/auth.dto';
import { AUTH_ERROR_EXAMPLES, toPasswordApiException } from '../mappers/auth.http-errors';
import { MeResponseDto } from './me.dto';
import { MeService, MeView } from './me.service';

@ApiTags('me')
@Controller({ path: 'me', version: '1' })
export class MeController {
  constructor(
    private readonly me: MeService,
    private readonly passwordChanges: PasswordChangeService,
  ) {}

  @Get()
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'meGet', summary: 'Get the signed-in account' })
  @ApiSuccessResponse(MeResponseDto, {
    message: 'ME.RETRIEVED',
    description: 'The signed-in account, its employee record and its effective roles.',
  })
  @ApiErrorResponses(UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE)
  async get(@CurrentPrincipal() principal: AuthenticatedPrincipal): Promise<MeView> {
    try {
      return await this.me.get(principal);
    } catch (error) {
      // The guard already read the database; it can still stop answering before MeService does (R-15).
      throw toUnavailableApiException(error) ?? error;
    }
  }

  /**
   * Changes the caller's own password. Open to every signed-in account, with or without roles; there is no
   * route to change anyone else's (`US-01-10` AC-8). Every session ends, this one included, so every refresh
   * token the account holds stops working.
   */
  @Post('password')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'meChangePassword', summary: 'Change my password' })
  @ApiSuccessResponse(PasswordChangedResponseDto, {
    message: 'AUTH.PASSWORD_CHANGED',
    description: 'The password was replaced and every session ended, this one included. Sign in again.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The body is invalid (VALIDATION_ERROR), the current password is wrong (AUTH.CURRENT_PASSWORD_INVALID) or the new one breaks the policy (AUTH.PASSWORD_POLICY_VIOLATION).',
      examples: [
        VALIDATION_EXAMPLE,
        AUTH_ERROR_EXAMPLES.CURRENT_PASSWORD_INVALID,
        AUTH_ERROR_EXAMPLES.PASSWORD_POLICY_VIOLATION,
      ],
    },
    {
      status: HttpStatus.TOO_MANY_REQUESTS,
      description:
        'Too many wrong passwords for this email; see retryAfterSeconds (AUTH.LOGIN_TEMPORARILY_BLOCKED). ' +
        'Too many requests to this route from this address also answer 429 (HTTP_TOO_MANY_REQUESTS).',
      examples: [AUTH_ERROR_EXAMPLES.LOGIN_TEMPORARILY_BLOCKED],
    },
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  )
  async changePassword(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: ChangePasswordBodyDto,
  ): Promise<{ passwordChanged: true }> {
    try {
      await this.passwordChanges.changePassword(principal, body.currentPassword, body.newPassword);
    } catch (error) {
      throw toPasswordApiException(error);
    }

    return { passwordChanged: true };
  }
}
