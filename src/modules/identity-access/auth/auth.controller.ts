import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { TransientDatabaseError } from '../../../infrastructure/database/transaction-runner';
import { ApiErrorResponses } from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { RawResponse } from '../../../infrastructure/http/decorators/raw-response.decorator';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { Public } from '../../../infrastructure/security/decorators/public.decorator';
import { AccountInvitationService } from '../accounts/account-invitation.service';
import { toAccountApiException } from '../accounts/account.http-errors';
import { AccountActivatedResponseDto, RedeemInvitationBodyDto } from '../dto/account-management.dto';
import {
  LoginBodyDto,
  PasswordResetBodyDto,
  PasswordResetRequestBodyDto,
  PasswordResetRequestedResponseDto,
  PasswordResetResponseDto,
  RefreshTokenBodyDto,
  SessionTokenResponseDto,
} from '../dto/auth.dto';
import {
  InvalidCredentialsError,
  LoginTemporarilyBlockedError,
  SessionInvalidError,
} from '../errors/identity-access.errors';
import { IssuedSession } from '../identity-access.types';
import { LoginService } from './login.service';
import { PasswordResetService } from './password-reset.service';
import { SessionService } from './session.service';

interface SessionTokens {
  accessToken: string;
  tokenType: 'Bearer';
  expiresAt: string;
  refreshToken: string;
}

const UNAVAILABLE = {
  status: HttpStatus.SERVICE_UNAVAILABLE,
  description: 'The database is temporarily unavailable. Retry shortly.',
} as const;

function unavailable(): ApiException {
  return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, {
    code: 'AUTH.UNAVAILABLE',
    message: 'Authentication is temporarily unavailable. Retry shortly.',
  });
}

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly logins: LoginService,
    private readonly sessions: SessionService,
    private readonly invitations: AccountInvitationService,
    private readonly passwordResets: PasswordResetService,
  ) {}

  @Post('login')
  @Public()
  @ApiOperation({ operationId: 'authLogin' })
  @ApiSuccessResponse(SessionTokenResponseDto, {
    message: 'AUTH.LOGGED_IN',
    description: 'Signed in. The body carries the access token and the refresh token.',
  })
  @ApiErrorResponses(
    {
      status: HttpStatus.UNAUTHORIZED,
      description: 'The email or password is not valid (one answer for every reason).',
    },
    { status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'The request body is invalid.' },
    { status: HttpStatus.TOO_MANY_REQUESTS, description: 'Too many failed attempts; see retryAfterSeconds.' },
    UNAVAILABLE,
  )
  async login(@Body() body: LoginBodyDto): Promise<SessionTokens> {
    try {
      return toSessionTokens(await this.logins.login(body.email, body.password));
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        throw new ApiException(HttpStatus.UNAUTHORIZED, {
          code: 'AUTH.INVALID_CREDENTIALS',
          message: 'The email or password is not valid.',
        });
      }
      if (error instanceof LoginTemporarilyBlockedError) {
        throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, {
          code: 'AUTH.LOGIN_TEMPORARILY_BLOCKED',
          message: 'Too many failed sign-in attempts. Try again later.',
          details: { retryAfterSeconds: error.retryAfterSeconds },
        });
      }
      if (error instanceof TransientDatabaseError) throw unavailable();
      throw error;
    }
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'authRefresh' })
  @ApiSuccessResponse(SessionTokenResponseDto, {
    message: 'AUTH.SESSION_REFRESHED',
    description: 'A new access token and a new refresh token; the presented refresh token is spent.',
  })
  @ApiErrorResponses(
    { status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'The body has no refresh token (VALIDATION_ERROR).' },
    {
      status: HttpStatus.UNAUTHORIZED,
      description: 'The refresh token is unknown, malformed, expired, spent or its session ended.',
    },
    UNAVAILABLE,
  )
  async refresh(@Body() body: RefreshTokenBodyDto): Promise<SessionTokens> {
    try {
      return toSessionTokens(await this.sessions.refresh(body.refreshToken));
    } catch (error) {
      if (error instanceof SessionInvalidError) {
        throw new ApiException(HttpStatus.UNAUTHORIZED, {
          code: 'AUTH.SESSION_INVALID',
          message: 'The session is not valid. Sign in again.',
        });
      }
      if (error instanceof TransientDatabaseError) throw unavailable();
      throw error;
    }
  }

  /**
   * Authenticated by the refresh token in the body, not by a Bearer token: the moment a user most
   * needs to sign out is often after the access token has expired. Idempotent: any well-formed
   * request is 204, whether or not the token belongs to an open session.
   */
  @Post('logout')
  @Public()
  @RawResponse()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ operationId: 'authLogout' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Signed out (or there was nothing to sign out).' })
  @ApiErrorResponses(
    { status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'The body has no refresh token (VALIDATION_ERROR).' },
    UNAVAILABLE,
  )
  async logout(@Body() body: RefreshTokenBodyDto): Promise<void> {
    try {
      await this.sessions.logout(body.refreshToken);
    } catch (error) {
      // Not signed out for certain: the client keeps its token and retries.
      if (error instanceof TransientDatabaseError) throw unavailable();
      throw error;
    }
  }

  /**
   * Asks for a password-reset link. The answer is the same for every email, whether or not it belongs
   * to an account that may use one, so it cannot be used to find out which emails exist (AC-3).
   */
  @Post('password-reset-requests')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ operationId: 'authRequestPasswordReset' })
  @ApiSuccessResponse(PasswordResetRequestedResponseDto, {
    message: 'AUTH.PASSWORD_RESET_REQUESTED',
    description: 'The request was accepted. The same answer is given for every email.',
    status: HttpStatus.ACCEPTED,
  })
  @ApiErrorResponses(
    { status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'The body is invalid (VALIDATION_ERROR).' },
    { status: HttpStatus.TOO_MANY_REQUESTS, description: 'Too many requests from this address.' },
    UNAVAILABLE,
  )
  async requestPasswordReset(@Body() body: PasswordResetRequestBodyDto): Promise<{ requested: true }> {
    try {
      await this.passwordResets.requestReset(body.email);

      return { requested: true };
    } catch (error) {
      if (error instanceof TransientDatabaseError) throw unavailable();
      throw error;
    }
  }

  /**
   * Sets a new password from a reset link. Public: the caller has forgotten the old one. It does not
   * sign the user in and does not unlock anything; every existing session ends.
   */
  @Post('password-resets')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ operationId: 'authResetPassword' })
  @ApiSuccessResponse(PasswordResetResponseDto, {
    message: 'AUTH.PASSWORD_RESET',
    description: 'The password was replaced and every session ended. The user signs in with the new one.',
  })
  @ApiErrorResponses(
    {
      status: HttpStatus.BAD_REQUEST,
      description:
        'The link is not valid (unknown, used, replaced, expired, or the account cannot use it). One answer for all.',
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The body is invalid or the password does not meet the policy.',
    },
    { status: HttpStatus.TOO_MANY_REQUESTS, description: 'Too many requests from this address.' },
    UNAVAILABLE,
  )
  async resetPassword(@Body() body: PasswordResetBodyDto): Promise<{ passwordReset: true }> {
    try {
      await this.passwordResets.resetPassword(body.token, body.newPassword);

      return { passwordReset: true };
    } catch (error) {
      // A public route: an outage is AUTH.UNAVAILABLE, like login and refresh.
      if (error instanceof TransientDatabaseError) throw unavailable();
      throw toAccountApiException(error);
    }
  }

  /**
   * Sets the first password from an invitation link and activates the account. Public: the caller
   * has no account yet. It does not sign the user in; they use the login route afterwards.
   */
  @Post('invitations/redeem')
  @Public()
  @ApiOperation({ operationId: 'authRedeemInvitation' })
  @ApiSuccessResponse(AccountActivatedResponseDto, {
    message: 'AUTH.ACCOUNT_ACTIVATED',
    description: 'The account is activated. The user signs in with the login route.',
  })
  @ApiErrorResponses(
    {
      status: HttpStatus.BAD_REQUEST,
      description: 'The link is not valid (unknown, used, replaced, expired, or the account cannot be activated).',
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The body is invalid or the password does not meet the policy.',
    },
    UNAVAILABLE,
  )
  async redeemInvitation(@Body() body: RedeemInvitationBodyDto): Promise<{ activated: true }> {
    try {
      await this.invitations.redeemInvitation(body.token, body.password);

      return { activated: true };
    } catch (error) {
      throw toAccountApiException(error);
    }
  }
}

function toSessionTokens(session: IssuedSession): SessionTokens {
  return {
    accessToken: session.accessToken,
    tokenType: 'Bearer',
    expiresAt: session.accessTokenExpiresAt.toISOString(),
    refreshToken: session.refreshToken,
  };
}
