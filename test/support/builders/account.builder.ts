import { normalizeEmail } from '../../../src/core/email';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import {
  ACCESS_TOKEN_VERIFIER,
  type AccessTokenVerifierPort,
  type AuthenticatedPrincipal,
} from '../../../src/infrastructure/security/tokens/access-token-verifier.port';
import { AccountStatusService } from '../../../src/modules/identity-access/accounts/app-users/account-status.service';
import { AccountRecordService } from '../../../src/modules/identity-access/accounts/account-record.service';
import { CredentialService } from '../../../src/modules/identity-access/credentials/credential.service';
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
  role?: string;
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

/** An employee with no placement at all (unplaced, `INV-20`), inserted directly: the manual-entry route is not what the suite proves. */
export async function insertEmployeeWithoutPlacement(
  ctx: HttpTestApp,
  seed: SeededInstallation,
  spec: { code: string; email?: string | null; fullName?: string; hireDate?: string },
): Promise<string> {
  const result = await ctx.sql.query<{ id: string }>(
    `INSERT INTO employees (id, organization_id, employee_code, full_name, work_email, employment_type, hire_date, status, work_state, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, 'STAFF', $5::date, 'ACTIVE', 'WORKING', now())
     RETURNING id`,
    [
      seed.organizationId,
      spec.code,
      spec.fullName ?? `Person ${spec.code}`,
      spec.email ?? null,
      spec.hireDate ?? '2026-01-05',
    ],
  );
  return result.rows[0].id;
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
  const accounts = ctx.app.get(AccountRecordService, { strict: false });
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
    for (const role of [spec.role ?? 'EMPLOYEE']) {
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

/*
 * The one place a suite gives a person `MANAGER` or `SPENDING_APPROVER` as a precondition, or reads who holds the second
 * (QĐ-93b). Both are role grants (QĐ-93a), given through the service of the route (`PUT /app-users/{id}/role`) so every
 * rule of the grant holds for a fixture too. No spec reaches for the role tables itself.
 */

/**
 * The person is a `MANAGER` before a spec makes them a head or a successor: the Super Admin grants the role through the service of the
 * route, unless they hold it already. The person needs an account (the department screen refuses anybody without one, `US-03-06` AC-23).
 */
export async function changeRoleTo(
  ctx: HttpTestApp,
  adminToken: string,
  employeeId: string,
  role: AppRole,
): Promise<void> {
  await ctx.app
    .get(AccountStatusService, { strict: false })
    .changeRole(await principalOf(ctx, adminToken), await appUserOf(ctx, employeeId), role);
}

async function appUserOf(ctx: HttpTestApp, employeeId: string): Promise<string> {
  const { rows } = await ctx.sql.query<{ id: string }>('SELECT id FROM app_users WHERE employee_id = $1', [employeeId]);
  if (rows.length !== 1) throw new Error(`The employee ${employeeId} has no account to hold a role.`);

  return rows[0].id;
}

/**
 * The Super Admin names the one spending approver, through the service of the route (T2.2: no HTTP): whoever holds the role is
 * revoked first (the one holder the grant allows), then the new person is granted it.
 */
export async function setSpendingApprover(ctx: HttpTestApp, adminToken: string, employeeId: string): Promise<void> {
  const actor = await principalOf(ctx, adminToken);
  const status = ctx.app.get(AccountStatusService, { strict: false });
  const current = await spendingApproverEmployeeId(ctx);
  if (current === employeeId) return;
  if (current !== null) await status.changeRole(actor, await appUserOf(ctx, current), 'EMPLOYEE');
  await status.changeRole(actor, await appUserOf(ctx, employeeId), 'SPENDING_APPROVER');
}

/** Nobody is the spending approver any more: the Super Admin revokes the role, through the service of the route. */
export async function clearSpendingApprover(ctx: HttpTestApp, adminToken: string): Promise<void> {
  const current = await spendingApproverEmployeeId(ctx);
  if (current === null) return;
  await ctx.app
    .get(AccountStatusService, { strict: false })
    .changeRole(await principalOf(ctx, adminToken), await appUserOf(ctx, current), 'EMPLOYEE');
}

/** The employee who is the spending approver now; null when nobody is. */
export async function spendingApproverEmployeeId(ctx: HttpTestApp): Promise<string | null> {
  const { rows } = await ctx.sql.query<{ employee_id: string }>(
    `SELECT u.employee_id FROM role_grants g JOIN app_users u ON u.id = g.app_user_id
      WHERE g.role = 'SPENDING_APPROVER' AND g.revoked_at IS NULL`,
  );

  return rows[0]?.employee_id ?? null;
}
