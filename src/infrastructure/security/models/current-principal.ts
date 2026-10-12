import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AuthenticatedPrincipal } from '../tokens/access-token-verifier.port';

export const AUTHENTICATED_IDENTITY = Symbol('AUTHENTICATED_IDENTITY');

type AuthenticatedRequest = Request & {
  [AUTHENTICATED_IDENTITY]?: AuthenticatedPrincipal;
};

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedPrincipal => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const identity = request[AUTHENTICATED_IDENTITY];

    if (!identity) {
      throw new Error('Authenticated identity is unavailable');
    }

    return identity;
  },
);
