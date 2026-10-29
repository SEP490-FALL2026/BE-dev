import { normalizeEmail } from '../../../src/core/email';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import {
  ACCESS_TOKEN_VERIFIER,
  type AccessTokenVerifierPort,
  type AuthenticatedPrincipal,
} from '../../../src/infrastructure/security/tokens/access-token-verifier.port';
import { AccountDirectoryService } from '../../../src/modules/identity-access/accounts/account-directory.service';
import { CredentialService } from '../../../src/modules/identity-access/accounts/credential.service';
import { RoleGrantService } from '../../../src/modules/identity-access/accounts/role-grant.service';
import { LoginService } from '../../../src/modules/identity-access/auth/login.service';
import { IdentityAccessApi } from '../../../src/modules/identity-access/public/identity-access.api';
import type { AppRole } from '../../../src/modules/identity-access/public/identity-access.types';
import { OrganizationApi } from '../../../src/modules/organization/public/organization.api';
import { ACCOUNT_PASSWORD, type ApiAccount } from '../api-accounts';
import type { HttpTestApp, SeededInstallation } from '../http-test-app';

/*
 * T2.2 (spec "Integration: dựng fixture không qua HTTP"): the people a suite only needs as a precondition, built inside the
 * application of the test, never through HTTP. The account is written the way a redeemed invitation leaves it (ACTIVATED,
 * INVITATION_REDEEMED, a credential, exactly the roles asked for, granted by the Super Admin through the grant service so a
 * FINANCE grant is announced to its listeners), and signed in through the login service the route calls: the access token
 * is a real session token, authenticated on every request exactly as one from `POST /auth/login`.
 *
 * What this skips is the invitation workflow itself (its audit rows, the invitation mail in the outbox, the action token):
 * a suite that proves that workflow uses `createActivatedAccount` (api-accounts.ts). No assertion lives here.
 */

export interface AccountSpec {
  code: string;
  email: string;
  roles: readonly string[];
  /** An employee that already exists keeps their department; without one, an employee is placed in `departmentId`. */
  employeeId?: string;
  /** Where a new employee is placed; the seeded department by default. */
  departmentId?: string;
  password?: string;
}

/** Signs in through the login service the route calls (throttle, credential check, session) and returns the access token. */
export async function signIn(ctx: HttpTestApp, email: string, password: string): Promise<string> {
  return (await ctx.app.get(LoginService, { strict: false }).login(email, password)).accessToken;
}

/** A body as the route would receive it: through JSON, so an `undefined` field is absent, as over HTTP. */
export const sent = (body: object): unknown => JSON.parse(JSON.stringify(body));

/** Who the guard says the bearer of this token is, resolved by the application's own verifier on the current data. */
export function principalOf(ctx: HttpTestApp, accessToken: string): Promise<AuthenticatedPrincipal> {
  return ctx.app.get<symbol, AccessTokenVerifierPort>(ACCESS_TOKEN_VERIFIER, { strict: false }).verify(accessToken);
}

/** An activated account holding exactly `spec.roles`, for a new employee or one that exists, signed in. */
export async function buildActivatedAccount(
  ctx: HttpTestApp,
  seed: SeededInstallation,
  spec: AccountSpec,
): Promise<ApiAccount> {
  const password = spec.password ?? ACCOUNT_PASSWORD;
  // Hashing is the slow part and happens before the transaction, as in every credential write of the application.
  const credential = await ctx.app.get(IdentityAccessApi).prepareCredential(password, spec.email);
  const organization = ctx.app.get(OrganizationApi);
  const accounts = ctx.app.get(AccountDirectoryService, { strict: false });
  const credentials = ctx.app.get(CredentialService, { strict: false });
  const grants = ctx.app.get(RoleGrantService, { strict: false });

  const made = await ctx.app.get(TransactionRunner).run(async (tx) => {
    const employeeId =
      spec.employeeId ??
      (
        await organization.createEmployeeWithPlacement(tx, {
          organizationId: seed.organizationId,
          employeeCode: spec.code,
          fullName: `Person ${spec.code}`,
          workEmail: spec.email,
          employmentType: 'STAFF',
          hireDate: '2026-01-05',
          departmentId: spec.departmentId ?? seed.departmentId,
          jobTitle: 'Administrator',
        })
      ).id;
    const user = await accounts.createAppUser(tx, {
      organizationId: seed.organizationId,
      employeeId,
      loginEmail: spec.email.trim(),
      normalizedLoginEmail: normalizeEmail(spec.email),
      status: 'ACTIVE',
      activationState: 'ACTIVATED',
      emailVerificationSource: 'INVITATION_REDEEMED',
      emailVerifiedAt: new Date(),
    });
    await credentials.createCredential(tx, user.id, credential.hash, credential.hashPolicyVersion);
    for (const role of new Set(spec.roles)) {
      await grants.grantRole(tx, {
        organizationId: seed.organizationId,
        appUserId: user.id,
        role: role as AppRole,
        grantedBy: seed.superAdmin.appUserId,
      });
    }

    return { appUserId: user.id, employeeId };
  });

  return { ...made, email: spec.email, accessToken: await signIn(ctx, spec.email, password) };
}
