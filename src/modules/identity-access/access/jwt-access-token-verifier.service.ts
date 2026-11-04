import { Injectable } from '@nestjs/common';
import { toTransientError } from '../../../infrastructure/database/transaction-runner';
import {
  AccessTokenVerifierPort,
  AuthenticatedPrincipal,
  InvalidAccessTokenError,
  TokenVerificationUnavailableError,
} from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { EmployeeRecord } from '../../organization/public/organization.types';
import { SessionRecordService } from '../auth/session-record.service';
import { TokenService } from '../auth/token.service';
import { PrincipalContext } from '../public/identity-access.types';
import { employeeHasNotLeft } from '../accounts/account.policy';
import { authorizingRoles } from './effective-roles.policy';

/**
 * Verifies the signed token, then asks the database whether the session and account are still
 * good, on every request. The token carries no roles, so a revoked role or locked account takes
 * effect on the next request (US-01-10 AC-6).
 */
@Injectable()
export class JwtAccessTokenVerifier implements AccessTokenVerifierPort {
  constructor(
    private readonly tokens: TokenService,
    private readonly sessions: SessionRecordService,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  async verify(token: string): Promise<AuthenticatedPrincipal> {
    const claims = await this.tokens.verifyAccessToken(token);

    let context: PrincipalContext | null;
    let employee: EmployeeRecord | null;
    try {
      context = await this.sessions.findPrincipalContext(claims.sid);
      employee = context ? await this.organizationReads.getEmployee(context.employeeId) : null;
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
      !employeeHasNotLeft(employee)
    ) {
      throw new InvalidAccessTokenError();
    }

    // MANAGER counts only while the person heads a department, read on every request like the grants: a head period that begins
    // today applies today, one that ended yesterday no longer does (US-01-02 AC-2). No role is derived from data (QĐ-93a).
    let headsDepartmentToday = false;
    if (context.directRoles.includes('MANAGER')) {
      try {
        headsDepartmentToday = (await this.organizationReads.getHeadedDepartment(context.employeeId)) !== null;
      } catch (error) {
        if (toTransientError(error)) throw new TokenVerificationUnavailableError(error);
        throw error;
      }
    }

    return {
      subject: context.appUserId,
      appUserId: context.appUserId,
      sessionId: context.sessionId,
      employeeId: context.employeeId,
      directRoles: [...context.directRoles].sort(),
      roles: authorizingRoles(context.directRoles, headsDepartmentToday),
    };
  }
}
