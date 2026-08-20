import { CanActivate, ExecutionContext, Inject, Injectable, HttpStatus } from '@nestjs/common';
import type { Request } from 'express';
import { Reflector } from '@nestjs/core';
import { ApiException } from '../../http/errors/api.exception';
import { IS_PUBLIC_METADATA } from '../decorators/public.decorator';
import { AUTHENTICATED_IDENTITY } from '../models/current-principal';
import { ACCESS_TOKEN_VERIFIER, AccessTokenVerifierPort } from '../tokens/access-token-verifier.port';
import { extractBearerToken } from '../tokens/bearer-token';

type AuthenticatedRequest = Request & {
  [AUTHENTICATED_IDENTITY]?: Awaited<ReturnType<AccessTokenVerifierPort['verify']>>;
};

@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(ACCESS_TOKEN_VERIFIER)
    private readonly tokenVerifier: AccessTokenVerifierPort,
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
    } catch {
      throw new ApiException(HttpStatus.UNAUTHORIZED, {
        code: 'INVALID_ACCESS_TOKEN',
        message: 'The access token is invalid.',
      });
    }
  }
}
