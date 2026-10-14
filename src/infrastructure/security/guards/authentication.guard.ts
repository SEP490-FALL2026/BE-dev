import { CanActivate, ExecutionContext, HttpStatus, Inject, Injectable, Logger, LoggerService } from '@nestjs/common';
import type { Request } from 'express';
import { Reflector } from '@nestjs/core';
import { ApiException } from '../../http/errors/api.exception';
import { IS_PUBLIC_METADATA } from '../decorators/public.decorator';
import { AUTHENTICATED_IDENTITY } from '../models/current-principal';
import {
  ACCESS_TOKEN_VERIFIER,
  AccessTokenVerifierPort,
  InvalidAccessTokenError,
  TokenVerificationUnavailableError,
} from '../tokens/access-token-verifier.port';
import { extractBearerToken } from '../tokens/bearer-token';

type AuthenticatedRequest = Request & {
  [AUTHENTICATED_IDENTITY]?: Awaited<ReturnType<AccessTokenVerifierPort['verify']>>;
};

/** `LoggerService.error` takes the trace as a string; the application logger sanitises it as one. */
function describeForOperator(reason: unknown): string {
  if (reason instanceof Error) {
    return reason.stack ?? `${reason.name}: ${reason.message}`;
  }

  return String(reason);
}

@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(ACCESS_TOKEN_VERIFIER)
    private readonly tokenVerifier: AccessTokenVerifierPort,
    @Inject(Logger)
    private readonly logger: LoggerService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request.header('authorization'));

    if (!token) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, {
        code: 'AUTHENTICATION_REQUIRED',
        message: 'A Bearer access token is required.',
      });
    }

    try {
      request[AUTHENTICATED_IDENTITY] = await this.tokenVerifier.verify(token);
      return true;
    } catch (error) {
      if (error instanceof TokenVerificationUnavailableError) {
        // During an authentication dependency outage this line is the only signal an operator gets,
        // and the caller deliberately receives none of it.
        //
        // The trace argument must be a STRING: the application logger runs string
        // sanitisation over it. Passing an object throws inside the logger, which escapes
        // this method and turns the 503 below into a 500 with nothing logged at all.
        this.logger.error('Access token verification is unavailable', describeForOperator(error.reason));

        throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, {
          code: 'TOKEN_VERIFICATION_UNAVAILABLE',
          message: 'Authentication is temporarily unavailable. Retry shortly.',
        });
      }

      if (error instanceof InvalidAccessTokenError) {
        // Deliberately not logged: rejected tokens are normal and high-volume, so logging
        // each one would hand an attacker a log-flooding vector for the cost of one request.
        // The wire message is fixed rather than the error's own, which is internal detail.
        throw new ApiException(HttpStatus.UNAUTHORIZED, {
          code: 'INVALID_ACCESS_TOKEN',
          message: 'The access token is invalid.',
        });
      }

      // Anything else is a defect in the verifier, not a bad token. Let it surface as a 500
      // instead of being disguised as an authentication failure nobody can diagnose.
      throw error;
    }
  }
}
