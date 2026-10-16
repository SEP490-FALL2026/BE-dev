import { Body, Controller, Get, HttpStatus, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ApiErrorResponses } from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { AuthenticatedOnly } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { toAccountApiException, toUnavailableApiException } from '../accounts/account.http-errors';
import { PasswordChangeService } from '../auth/password-change.service';
import { RefreshCookie } from '../auth/refresh-cookie';
import { ChangePasswordBodyDto, PasswordChangedResponseDto } from '../dto/auth.dto';
import { MeResponseDto } from '../dto/me.dto';
import { MeService, MeView } from './me.service';

@ApiTags('me')
@Controller({ path: 'me', version: '1' })
export class MeController {
  constructor(
    private readonly me: MeService,
    private readonly passwordChanges: PasswordChangeService,
    private readonly cookie: RefreshCookie,
  ) {}

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

  /**
   * Changes the caller's own password. Open to every signed-in account, with or without roles; there is no
   * route to change anyone else's (`US-01-10` AC-8). Every session ends, this one included, and the refresh
   * cookie is cleared.
   */
  @Post('password')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'meChangePassword' })
  @ApiSuccessResponse(PasswordChangedResponseDto, {
    message: 'AUTH.PASSWORD_CHANGED',
    description: 'The password was replaced and every session ended, this one included. Sign in again.',
  })
  @ApiErrorResponses(
    {
      status: HttpStatus.UNAUTHORIZED,
      description:
        'Authentication is required or the token is no longer valid (also: locked account, departed employee).',
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The body is invalid (VALIDATION_ERROR), the current password is wrong (AUTH.CURRENT_PASSWORD_INVALID) or the new one breaks the policy (AUTH.PASSWORD_POLICY_VIOLATION).',
    },
    {
      status: HttpStatus.TOO_MANY_REQUESTS,
      description: 'Too many wrong passwords for this email; see retryAfterSeconds (AUTH.LOGIN_TEMPORARILY_BLOCKED).',
    },
    {
      status: HttpStatus.SERVICE_UNAVAILABLE,
      description:
        'Authentication or the service is temporarily unavailable (TOKEN_VERIFICATION_UNAVAILABLE from the guard, SERVICE_UNAVAILABLE after it).',
    },
  )
  async changePassword(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: ChangePasswordBodyDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ passwordChanged: true }> {
    try {
      await this.passwordChanges.changePassword(principal, body.currentPassword, body.newPassword);
    } catch (error) {
      throw toAccountApiException(error);
    }
    // Every session just ended, so the cookie that held this one's refresh token is worthless.
    this.cookie.clear(response);

    return { passwordChanged: true };
  }
}
