import { Injectable } from '@nestjs/common';
import { toTransientError } from '../../infrastructure/database/transaction-runner';
import {
  AccessTokenVerifierPort,
  AuthenticatedPrincipal,
  InvalidAccessTokenError,
  TokenVerificationUnavailableError,
} from '../../infrastructure/security/tokens/access-token-verifier.port';
import { OrganizationService } from '../organization/organization.service';
import { IdentityAccessRepo } from './identity-access.repo';
import { PrincipalContext } from './identity-access.types';
import { resolveEffectiveRoles } from './roles.policy';
import { TokenService } from './token.service';

/**
 * Verifies the signed token, then asks the database whether the session and account are still
 * good, on every request. The token carries no roles, so a revoked role or locked account takes
 * effect on the next request (US-01-10 AC-6).
 */
@Injectable()
export class JwtAccessTokenVerifier implements AccessTokenVerifierPort {
  constructor(
    private readonly tokens: TokenService,
    private readonly repo: IdentityAccessRepo,
    private readonly organization: OrganizationService,
  ) {}

  async verify(token: string): Promise<AuthenticatedPrincipal> {
    const claims = await this.tokens.verifyAccessToken(token);

    let context: PrincipalContext | null;
    let employeeStatus: 'ACTIVE' | 'TERMINATED' | null;
    try {
      context = await this.repo.findPrincipalContext(claims.sid);
      employeeStatus = context ? ((await this.organization.getEmployee(context.employeeId))?.status ?? null) : null;
    } catch (error) {
      // Could not reach the database: the token may be fine, so this is a 503, never a 401.
      // Anything toTransientError does not recognise is a defect, and stays one (a 500 with a log).
      if (toTransientError(error)) throw new TokenVerificationUnavailableError(error);
      throw error;
    }

    const now = new Date();
    if (
      !context ||
      context.appUserId !== claims.sub ||
      context.sessionRevokedAt !== null ||
      context.idleExpiresAt <= now ||
      context.absoluteExpiresAt <= now ||
      context.status !== 'ACTIVE' ||
      context.activationState !== 'ACTIVATED' ||
      employeeStatus === null ||
      employeeStatus === 'TERMINATED'
    ) {
      throw new InvalidAccessTokenError();
    }

    const roles = resolveEffectiveRoles(context.directRoles);

    return {
      subject: context.appUserId,
      appUserId: context.appUserId,
      sessionId: context.sessionId,
      employeeId: context.employeeId,
      directRoles: roles.direct,
      derivedRoles: roles.derived,
      roles: roles.effective,
    };
  }
}
