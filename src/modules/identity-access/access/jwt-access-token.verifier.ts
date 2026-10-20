import { Injectable } from '@nestjs/common';
import { toTransientError } from '../../../infrastructure/database/transaction-runner';
import {
  AccessTokenVerifierPort,
  AuthenticatedPrincipal,
  InvalidAccessTokenError,
  TokenVerificationUnavailableError,
} from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { OrganizationService } from '../../organization/organization.service';
import { EmployeeRecord } from '../../organization/organization.types';
import { ApprovalRoleDirectoryService } from '../approval-roles/approval-role-directory.service';
import { SessionDirectoryService } from '../auth/session-directory.service';
import { TokenService } from '../auth/token.service';
import { PrincipalContext } from '../identity-access.types';
import { employeeHasNotLeft } from '../policies/account-policy';
import { resolveEffectiveRoles } from './effective-roles.policy';

/**
 * Verifies the signed token, then asks the database whether the session and account are still
 * good, on every request. The token carries no roles, so a revoked role or locked account takes
 * effect on the next request (US-01-10 AC-6).
 */
@Injectable()
export class JwtAccessTokenVerifier implements AccessTokenVerifierPort {
  constructor(
    private readonly tokens: TokenService,
    private readonly sessions: SessionDirectoryService,
    private readonly organization: OrganizationService,
    private readonly approvalRoles: ApprovalRoleDirectoryService,
  ) {}

  async verify(token: string): Promise<AuthenticatedPrincipal> {
    const claims = await this.tokens.verifyAccessToken(token);

    let context: PrincipalContext | null;
    let employee: EmployeeRecord | null;
    try {
      context = await this.sessions.findPrincipalContext(claims.sid);
      employee = context ? await this.organization.getEmployee(context.employeeId) : null;
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

    // Roles that follow from data, read on every request like the grants: a head period that begins today applies
    // today, one that ended yesterday no longer does (US-01-02 AC-2).
    let headed: { departmentId: string } | null;
    let isSpendingApprover: boolean;
    try {
      [headed, isSpendingApprover] = await Promise.all([
        this.organization.getHeadedDepartment(context.employeeId),
        this.approvalRoles.isSpendingApprover(context.employeeId),
      ]);
    } catch (error) {
      if (toTransientError(error)) throw new TokenVerificationUnavailableError(error);
      throw error;
    }
    const roles = resolveEffectiveRoles(context.directRoles, {
      headsDepartment: headed !== null,
      isSpendingApprover,
    });

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
